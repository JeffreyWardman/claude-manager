use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeSession {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub project_name: String,
    pub started_at: i64,
    pub status: SessionStatus,
    pub display_name: Option<String>,
    pub git_branch: Option<String>,
    pub pending_rename: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Active,
    Offline,
}

// The session file written by Claude Code at ~/.claude/sessions/<pid>.json
#[derive(Debug, Deserialize)]
struct SessionFile {
    pid: u32,
    #[serde(rename = "sessionId")]
    session_id: String,
    cwd: String,
    #[serde(rename = "startedAt")]
    started_at: i64,
}

// First line of a conversation JSONL file
#[derive(Debug, Deserialize)]
struct JournalFirstLine {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    cwd: Option<String>,
    timestamp: Option<String>,
    #[serde(rename = "gitBranch")]
    git_branch: Option<String>,
}

fn is_process_alive(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn project_name_from_cwd(cwd: &str) -> String {
    PathBuf::from(cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(cwd)
        .to_string()
}

fn claude_sessions_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".claude").join("sessions"))
}

fn claude_projects_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".claude").join("projects"))
}

/// Parse the timestamp string "2026-04-06T04:39:58.491Z" to unix ms
fn parse_timestamp(ts: &str) -> i64 {
    // Quick hand-rolled parse to avoid adding a time crate dep
    // Format: YYYY-MM-DDTHH:MM:SS.mmmZ
    if ts.len() < 19 {
        return 0;
    }
    let parts: Vec<&str> = ts.splitn(2, 'T').collect();
    if parts.len() != 2 {
        return 0;
    }
    let date_parts: Vec<i64> = parts[0].split('-').filter_map(|s| s.parse().ok()).collect();
    let time_str = parts[1].trim_end_matches('Z');
    let time_parts: Vec<i64> = time_str
        .split(':')
        .map(|s| s.split('.').next().unwrap_or("0"))
        .filter_map(|s| s.parse().ok())
        .collect();
    if date_parts.len() < 3 || time_parts.len() < 3 {
        return 0;
    }
    // Approximate: days since epoch * 86400000 + time offset
    // Good enough for sorting; not astronomically accurate
    let year = date_parts[0];
    let month = date_parts[1];
    let day = date_parts[2];
    let days_since_epoch = (year - 1970) * 365 + (year - 1969) / 4 + // leap years approx
        match month {
            1 => 0, 2 => 31, 3 => 59, 4 => 90, 5 => 120, 6 => 151,
            7 => 181, 8 => 212, 9 => 243, 10 => 273, 11 => 304, 12 => 334,
            _ => 0,
        } +
        day - 1;
    days_since_epoch * 86_400_000
        + time_parts[0] * 3_600_000
        + time_parts[1] * 60_000
        + time_parts[2] * 1_000
}

/// Read cwd, sessionId, timestamp from the first valid line of a JSONL file
fn read_jsonl_header(path: &PathBuf) -> Option<JournalFirstLine> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    for line in reader.lines().take(10) {
        let line = match line { Ok(l) => l, Err(_) => continue };
        if let Ok(entry) = serde_json::from_str::<JournalFirstLine>(&line) {
            if entry.cwd.is_some() && entry.session_id.is_some() {
                return Some(entry);
            }
        }
    }
    None
}

const MAX_OFFLINE_SESSIONS: usize = 50;

pub fn get_all_sessions() -> Vec<ClaudeSession> {
    let metadata = crate::metadata::load();

    // Step 1: Scan pid files for alive processes. Build cwd → pid map.
    // Pid files are NOT added directly to the session list — JSONL files are the
    // source of truth for session identity. Pid files only tell us what's running.
    let mut alive_cwd_pids: std::collections::HashMap<String, u32> =
        std::collections::HashMap::new();
    if let Some(sessions_dir) = claude_sessions_dir() {
        if let Ok(entries) = fs::read_dir(&sessions_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(sf) = serde_json::from_str::<SessionFile>(&content) {
                        if is_process_alive(sf.pid) {
                            alive_cwd_pids.insert(sf.cwd, sf.pid);
                        }
                    }
                }
            }
        }
    }

    // Step 2: Scan ~/.claude/projects/*/*.jsonl — every session shown in the UI
    // comes from here, so only sessions with real conversation data are visible.
    let mut candidates: Vec<(i64, ClaudeSession)> = Vec::new();
    if let Some(projects_dir) = claude_projects_dir() {
        if let Ok(project_entries) = fs::read_dir(&projects_dir) {
            for project_entry in project_entries.flatten() {
                let project_path = project_entry.path();
                if !project_path.is_dir() {
                    continue;
                }
                if let Ok(session_entries) = fs::read_dir(&project_path) {
                    for session_entry in session_entries.flatten() {
                        let sp = session_entry.path();
                        if sp.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                            continue;
                        }
                        let filename_id = sp
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_string();
                        if filename_id.len() != 36 {
                            continue;
                        }
                        if let Some(header) = read_jsonl_header(&sp) {
                            let cwd = header.cwd.unwrap_or_default();
                            let sid = filename_id; // JSONL filename is the resume key
                            let started_at = header
                                .timestamp
                                .as_deref()
                                .map(parse_timestamp)
                                .unwrap_or(0);
                            let meta = metadata.get(&sid);
                            if meta.map(|m| m.archived).unwrap_or(false) {
                                continue;
                            }
                            let display_name = meta.and_then(|m| m.display_name.clone());
                            let pending_rename = meta.and_then(|m| m.pending_rename.clone());
                            let project_name = project_name_from_cwd(&cwd);
                            candidates.push((started_at, ClaudeSession {
                                pid: 0,
                                session_id: sid,
                                project_name,
                                cwd,
                                started_at,
                                status: SessionStatus::Offline,
                                display_name,
                                git_branch: header.git_branch,
                                pending_rename,
                            }));
                        }
                    }
                }
            }
        }
    }

    // Step 3: Sort by recency. For each cwd with a live process, mark the most
    // recent JSONL session in that directory as Active (and attach the pid).
    candidates.sort_by(|a, b| b.0.cmp(&a.0));

    let mut active_cwds_marked: std::collections::HashSet<String> =
        std::collections::HashSet::new();
    let mut sessions: Vec<ClaudeSession> = Vec::new();
    let mut offline_count = 0usize;

    for (_, mut session) in candidates {
        if let Some(&pid) = alive_cwd_pids.get(&session.cwd) {
            if !active_cwds_marked.contains(&session.cwd) {
                session.status = SessionStatus::Active;
                session.pid = pid;
                active_cwds_marked.insert(session.cwd.clone());
                sessions.push(session);
                continue;
            }
        }
        if offline_count < MAX_OFFLINE_SESSIONS {
            sessions.push(session);
            offline_count += 1;
        }
    }

    // Final sort: active first, then offline, newest first within each group
    sessions.sort_by(|a, b| {
        let ord = |s: &SessionStatus| match s {
            SessionStatus::Active => 0,
            SessionStatus::Offline => 1,
        };
        ord(&a.status)
            .cmp(&ord(&b.status))
            .then(b.started_at.cmp(&a.started_at))
    });

    sessions
}
