use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClaudeSession {
    pub pid: u32,
    pub session_id: String,
    pub cwd: String,
    pub project_name: String,
    pub started_at: i64,
    pub last_modified: i64,
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
    cwd: String,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "startedAt")]
    started_at: Option<i64>,
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

fn project_name_from_cwd(cwd: &str) -> String {
    PathBuf::from(cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(cwd)
        .to_string()
}

fn file_mtime_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
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
        day
        - 1;
    days_since_epoch * 86_400_000
        + time_parts[0] * 3_600_000
        + time_parts[1] * 60_000
        + time_parts[2] * 1_000
}

/// Read cwd, sessionId, timestamp from the first valid line of a JSONL file
fn read_jsonl_header(path: &Path) -> Option<JournalFirstLine> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    for line in reader.lines().take(10) {
        let Ok(line) = line else { continue };
        if let Ok(entry) = serde_json::from_str::<JournalFirstLine>(&line) {
            if entry.cwd.is_some() && entry.session_id.is_some() {
                return Some(entry);
            }
        }
    }
    None
}

const MAX_OFFLINE_SESSIONS: usize = 50;

pub fn get_all_sessions(config_dir: &str) -> Vec<ClaudeSession> {
    let config_path = PathBuf::from(config_dir);
    let metadata = crate::metadata::load();

    // Step 1: Scan pid files for alive processes. Build cwd → pid map and
    // collect pid-file-only sessions (alive processes with no JSONL yet).
    let mut alive_cwd_pids: std::collections::HashMap<String, u32> =
        std::collections::HashMap::new();
    let mut pid_only_sessions: Vec<(String, String, u32, i64)> = Vec::new(); // (session_id, cwd, pid, started_at)
    let sessions_dir = config_path.join("sessions");
    if let Ok(entries) = fs::read_dir(&sessions_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(session_file) = serde_json::from_str::<SessionFile>(&content) {
                    if crate::utils::is_pid_alive(session_file.pid) {
                        alive_cwd_pids.insert(session_file.cwd.clone(), session_file.pid);
                        if let Some(ref sid) = session_file.session_id {
                            pid_only_sessions.push((
                                sid.clone(),
                                session_file.cwd,
                                session_file.pid,
                                session_file.started_at.unwrap_or(0),
                            ));
                        }
                    }
                }
            }
        }
    }

    // Step 2: Scan projects/*/*.jsonl — every session shown in the UI
    // comes from here, so only sessions with real conversation data are visible.
    let mut candidates: Vec<(i64, ClaudeSession)> = Vec::new();
    let projects_dir = config_path.join("projects");
    if let Ok(project_entries) = fs::read_dir(&projects_dir) {
        for project_entry in project_entries.flatten() {
            let project_path = project_entry.path();
            if !project_path.is_dir() {
                continue;
            }
            if let Ok(session_entries) = fs::read_dir(&project_path) {
                for session_entry in session_entries.flatten() {
                    let session_path = session_entry.path();
                    if session_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                        continue;
                    }
                    let filename_id = session_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    if filename_id.len() != 36 {
                        continue;
                    }
                    if let Some(header) = read_jsonl_header(&session_path) {
                        let cwd = header.cwd.unwrap_or_default();
                        let session_id = filename_id;
                        let started_at = header
                            .timestamp
                            .as_deref()
                            .map(parse_timestamp)
                            .unwrap_or(0);
                        let meta = metadata.get(&session_id);
                        if meta.map(|m| m.archived).unwrap_or(false) {
                            continue;
                        }
                        let display_name = meta.and_then(|m| m.display_name.clone());
                        let pending_rename = meta.and_then(|m| m.pending_rename.clone());
                        let project_name = project_name_from_cwd(&cwd);
                        let last_modified = file_mtime_ms(&session_path);
                        candidates.push((
                            started_at,
                            ClaudeSession {
                                pid: 0,
                                session_id,
                                project_name,
                                cwd,
                                started_at,
                                last_modified,
                                status: SessionStatus::Offline,
                                display_name,
                                git_branch: header.git_branch,
                                pending_rename,
                            },
                        ));
                    }
                }
            }
        }
    }

    // Step 2b: Add pid-only sessions (alive process, no JSONL yet — freshly spawned).
    {
        let jsonl_ids: std::collections::HashSet<String> = candidates
            .iter()
            .map(|(_, s)| s.session_id.clone())
            .collect();
        for (session_id, cwd, pid, started_at) in &pid_only_sessions {
            if !jsonl_ids.contains(session_id) {
                let meta = metadata.get(session_id);
                if meta.map(|m| m.archived).unwrap_or(false) {
                    continue;
                }
                let project_name = project_name_from_cwd(cwd);
                let display_name = meta.and_then(|m| m.display_name.clone());
                let pending_rename = meta.and_then(|m| m.pending_rename.clone());
                candidates.push((
                    *started_at,
                    ClaudeSession {
                        pid: *pid,
                        session_id: session_id.clone(),
                        project_name,
                        cwd: cwd.clone(),
                        started_at: *started_at,
                        last_modified: *started_at,
                        status: SessionStatus::Active,
                        display_name,
                        git_branch: None,
                        pending_rename,
                    },
                ));
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
