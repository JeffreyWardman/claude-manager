use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConversationEntry {
    pub role: EntryRole,
    pub text: String,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum EntryRole {
    User,
    Assistant,
}

#[derive(Debug, Deserialize)]
struct RawEntry {
    #[serde(rename = "type")]
    entry_type: Option<String>,
    message: Option<RawMessage>,
    timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawMessage {
    role: Option<String>,
    content: Option<serde_json::Value>,
}

fn extract_text(content: &serde_json::Value) -> Option<String> {
    match content {
        serde_json::Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
        }
        serde_json::Value::Array(arr) => {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(|item| {
                    let obj = item.as_object()?;
                    if obj.get("type")?.as_str()? == "text" {
                        let t = obj.get("text")?.as_str()?.trim();
                        if t.is_empty() { None } else { Some(t.to_string()) }
                    } else {
                        None
                    }
                })
                .collect();
            if parts.is_empty() { None } else { Some(parts.join("\n")) }
        }
        _ => None,
    }
}

fn strip_system_tags(text: &str) -> String {
    // Strip <command-message>, <system-reminder>, etc.
    let re_patterns = [
        r"<command-message>.*?</command-message>",
        r"<command-name>.*?</command-name>",
        r"<system-reminder>[\s\S]*?</system-reminder>",
        r"<local-command-caveat>[\s\S]*?</local-command-caveat>",
    ];
    let mut result = text.to_string();
    for pattern in &re_patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            result = re.replace_all(&result, "").to_string();
        }
    }
    result.trim().to_string()
}

fn claude_projects_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".claude").join("projects"))
}

fn encode_path_for_claude(path: &str) -> String {
    path.trim_start_matches('/').replace('/', "-")
}

fn find_jsonl_path(cwd: &str, session_id: &str) -> Option<PathBuf> {
    let projects_dir = claude_projects_dir()?;
    let encoded = encode_path_for_claude(cwd);
    // Try exact match first
    let path = projects_dir
        .join(&encoded)
        .join(format!("{}.jsonl", session_id));
    if path.exists() {
        return Some(path);
    }
    // Scan all project dirs for this session_id (handles paths with hyphens)
    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let candidate = entry.path().join(format!("{}.jsonl", session_id));
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

const MAX_ENTRIES: usize = 100;

#[tauri::command]
pub fn get_conversation(cwd: String, session_id: String) -> Vec<ConversationEntry> {
    let Some(path) = find_jsonl_path(&cwd, &session_id) else {
        return vec![];
    };
    let Ok(file) = fs::File::open(&path) else {
        return vec![];
    };

    let reader = BufReader::new(file);
    let mut entries: Vec<ConversationEntry> = Vec::new();

    for line in reader.lines().flatten() {
        let Ok(raw) = serde_json::from_str::<RawEntry>(&line) else {
            continue;
        };
        let entry_type = raw.entry_type.as_deref().unwrap_or("");
        if entry_type != "user" && entry_type != "assistant" {
            continue;
        }
        let Some(msg) = raw.message else { continue };
        let role_str = msg.role.as_deref().unwrap_or("");
        let role = match role_str {
            "user" => EntryRole::User,
            "assistant" => EntryRole::Assistant,
            _ => continue,
        };
        let Some(content) = msg.content else { continue };
        let Some(text) = extract_text(&content) else { continue };
        let text = strip_system_tags(&text);
        if text.is_empty() {
            continue;
        }
        entries.push(ConversationEntry {
            role,
            text,
            timestamp: raw.timestamp.unwrap_or_default(),
        });
    }

    // Return the last MAX_ENTRIES
    if entries.len() > MAX_ENTRIES {
        entries = entries.split_off(entries.len() - MAX_ENTRIES);
    }
    entries
}

/// Returns the byte size of the JSONL file — used by the frontend to detect updates
#[tauri::command]
pub fn get_jsonl_size(cwd: String, session_id: String) -> u64 {
    find_jsonl_path(&cwd, &session_id)
        .and_then(|p| fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0)
}
