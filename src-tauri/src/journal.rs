use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

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
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        serde_json::Value::Array(arr) => {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(|item| {
                    let obj = item.as_object()?;
                    if obj.get("type")?.as_str()? == "text" {
                        let t = obj.get("text")?.as_str()?.trim();
                        if t.is_empty() {
                            None
                        } else {
                            Some(t.to_string())
                        }
                    } else {
                        None
                    }
                })
                .collect();
            if parts.is_empty() {
                None
            } else {
                Some(parts.join("\n"))
            }
        }
        _ => None,
    }
}

fn strip_regexes() -> &'static [regex::Regex] {
    static REGEXES: OnceLock<Vec<regex::Regex>> = OnceLock::new();
    REGEXES.get_or_init(|| {
        [
            r"<command-message>.*?</command-message>",
            r"<command-name>.*?</command-name>",
            r"<system-reminder>[\s\S]*?</system-reminder>",
            r"<local-command-caveat>[\s\S]*?</local-command-caveat>",
        ]
        .iter()
        .filter_map(|p| regex::Regex::new(p).ok())
        .collect()
    })
}

fn strip_system_tags(text: &str) -> String {
    let mut result = text.to_string();
    for re in strip_regexes() {
        result = re.replace_all(&result, "").into_owned();
    }
    result.trim().to_string()
}

fn encode_path_for_claude(path: &str) -> String {
    path.trim_start_matches('/').replace('/', "-")
}

fn find_jsonl_path(projects_dir: &Path, cwd: &str, session_id: &str) -> Option<PathBuf> {
    let encoded = encode_path_for_claude(cwd);
    let path = projects_dir
        .join(&encoded)
        .join(format!("{}.jsonl", session_id));
    if path.exists() {
        return Some(path);
    }
    if let Ok(entries) = fs::read_dir(projects_dir) {
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
pub fn get_conversation(
    config_dir: String,
    cwd: String,
    session_id: String,
) -> Vec<ConversationEntry> {
    let projects_dir = PathBuf::from(&config_dir).join("projects");
    let Some(path) = find_jsonl_path(&projects_dir, &cwd, &session_id) else {
        return vec![];
    };
    let Ok(file) = fs::File::open(&path) else {
        return vec![];
    };

    let reader = BufReader::new(file);
    let mut entries: Vec<ConversationEntry> = Vec::new();

    for line in reader.lines().map_while(Result::ok) {
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
        let Some(text) = extract_text(&content) else {
            continue;
        };
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
pub fn get_jsonl_size(config_dir: String, cwd: String, session_id: String) -> u64 {
    let projects_dir = PathBuf::from(&config_dir).join("projects");
    find_jsonl_path(&projects_dir, &cwd, &session_id)
        .and_then(|p| fs::metadata(p).ok())
        .map(|m| m.len())
        .unwrap_or(0)
}
