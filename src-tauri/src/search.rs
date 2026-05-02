use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::journal;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct IndexEntry {
    project_name: String,
    cwd: String,
    mtime: i64,
    last_modified: i64,
    text: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct IndexFile {
    entries: HashMap<String, IndexEntry>,
}

#[derive(Debug, Serialize, Clone)]
pub struct SearchHit {
    pub session_id: String,
    pub project_name: String,
    pub cwd: String,
    pub snippet: String,
    pub match_count: u32,
    pub last_modified: i64,
}

pub struct SearchIndex {
    entries: HashMap<String, IndexEntry>,
    index_path: PathBuf,
    projects_dir: PathBuf,
}

#[derive(Debug, Deserialize)]
struct RawEntry {
    #[serde(rename = "type")]
    entry_type: Option<String>,
    message: Option<RawMessage>,
    cwd: Option<String>,
    #[serde(rename = "isMeta")]
    is_meta: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RawMessage {
    content: Option<serde_json::Value>,
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

/// Extract user+assistant text from a JSONL file. Returns concatenated text and
/// the cwd discovered in the header.
fn extract_searchable_text(path: &Path) -> Option<(String, String)> {
    let file = fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut text = String::new();
    let mut cwd: Option<String> = None;
    for line in reader.lines().map_while(Result::ok) {
        let Ok(raw) = serde_json::from_str::<RawEntry>(&line) else {
            continue;
        };
        if cwd.is_none() {
            if let Some(c) = raw.cwd.clone() {
                cwd = Some(c);
            }
        }
        let entry_type = raw.entry_type.as_deref().unwrap_or("");
        if entry_type != "user" && entry_type != "assistant" {
            continue;
        }
        if raw.is_meta.unwrap_or(false) {
            continue;
        }
        let Some(message) = raw.message.as_ref() else {
            continue;
        };
        let Some(content) = message.content.as_ref() else {
            continue;
        };
        if let Some(t) = journal::extract_text_for_search(content) {
            if !text.is_empty() {
                text.push('\n');
            }
            text.push_str(&t);
        }
    }
    Some((text, cwd.unwrap_or_default()))
}

impl SearchIndex {
    pub fn load(config_dir: &Path) -> Self {
        let manager_dir = config_dir.join("manager");
        let _ = fs::create_dir_all(&manager_dir);
        let index_path = manager_dir.join("search-index.json");
        let entries = fs::read_to_string(&index_path)
            .ok()
            .and_then(|s| serde_json::from_str::<IndexFile>(&s).ok())
            .map(|f| f.entries)
            .unwrap_or_default();
        Self {
            entries,
            index_path,
            projects_dir: config_dir.join("projects"),
        }
    }

    fn save(&self) {
        let file = IndexFile {
            entries: self.entries.clone(),
        };
        if let Ok(json) = serde_json::to_string(&file) {
            let _ = fs::write(&self.index_path, json);
        }
    }

    /// Walk projects dir, add/update entries whose mtime changed, drop deleted.
    pub fn refresh(&mut self) {
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        let Ok(project_entries) = fs::read_dir(&self.projects_dir) else {
            return;
        };
        for project_entry in project_entries.flatten() {
            let project_path = project_entry.path();
            if !project_path.is_dir() {
                continue;
            }
            let Ok(session_entries) = fs::read_dir(&project_path) else {
                continue;
            };
            for session_entry in session_entries.flatten() {
                let session_path = session_entry.path();
                if session_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }
                let session_id = session_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                if session_id.len() != 36 {
                    continue;
                }
                seen.insert(session_id.clone());
                let mtime = file_mtime_ms(&session_path);
                if let Some(existing) = self.entries.get(&session_id) {
                    if existing.mtime == mtime {
                        continue;
                    }
                }
                let Some((text, cwd)) = extract_searchable_text(&session_path) else {
                    continue;
                };
                let project_name = project_name_from_cwd(&cwd);
                self.entries.insert(
                    session_id,
                    IndexEntry {
                        project_name,
                        cwd,
                        mtime,
                        last_modified: mtime,
                        text,
                    },
                );
            }
        }
        // Drop entries whose files were deleted/archived off disk.
        self.entries.retain(|id, _| seen.contains(id));
        self.save();
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        let needle = query.to_lowercase();
        if needle.is_empty() {
            return vec![];
        }
        let mut hits: Vec<SearchHit> = Vec::new();
        for (session_id, entry) in &self.entries {
            let haystack = entry.text.to_lowercase();
            let mut count: u32 = 0;
            let mut start = 0usize;
            let mut first_idx: Option<usize> = None;
            while let Some(pos) = haystack[start..].find(&needle) {
                let abs = start + pos;
                if first_idx.is_none() {
                    first_idx = Some(abs);
                }
                count += 1;
                start = abs + needle.len().max(1);
                if count >= 50 {
                    break;
                }
            }
            if count == 0 {
                continue;
            }
            let snippet = build_snippet(&entry.text, first_idx.unwrap_or(0), needle.len());
            hits.push(SearchHit {
                session_id: session_id.clone(),
                project_name: entry.project_name.clone(),
                cwd: entry.cwd.clone(),
                snippet,
                match_count: count,
                last_modified: entry.last_modified,
            });
        }
        hits.sort_by_key(|b| std::cmp::Reverse(b.last_modified));
        hits.truncate(limit);
        hits
    }
}

fn build_snippet(text: &str, match_idx: usize, match_len: usize) -> String {
    const WINDOW: usize = 60;
    // Operate on chars, not bytes, to avoid splitting UTF-8.
    let chars: Vec<char> = text.chars().collect();
    // match_idx is a byte index from a lowercased copy; fall back to char-aligned approximation.
    let approx_char_idx = text
        .char_indices()
        .position(|(b, _)| b >= match_idx)
        .unwrap_or(chars.len().saturating_sub(1));
    let start = approx_char_idx.saturating_sub(WINDOW);
    let end = (approx_char_idx + match_len + WINDOW).min(chars.len());
    let mut snippet: String = chars[start..end].iter().collect();
    snippet = snippet.replace('\n', " ").trim().to_string();
    if start > 0 {
        snippet = format!("…{}", snippet);
    }
    if end < chars.len() {
        snippet.push('…');
    }
    snippet
}

pub type SearchIndexState = Mutex<HashMap<String, SearchIndex>>;

#[tauri::command]
pub fn search_conversations(
    config_dir: String,
    query: String,
    limit: Option<usize>,
    state: tauri::State<SearchIndexState>,
) -> Vec<SearchHit> {
    if query.trim().len() < 2 {
        return vec![];
    }
    let mut map = state.lock().unwrap();
    let index = map
        .entry(config_dir.clone())
        .or_insert_with(|| SearchIndex::load(Path::new(&config_dir)));
    index.refresh();
    index.search(query.trim(), limit.unwrap_or(50))
}
