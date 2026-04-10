use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct SessionMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default)]
    pub archived: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_rename: Option<String>,
}

pub type MetadataStore = HashMap<String, SessionMeta>;

fn metadata_path() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".claude").join("manager").join("metadata.json"))
}

pub fn load() -> MetadataStore {
    if let Some(path) = metadata_path() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(store) = serde_json::from_str::<MetadataStore>(&content) {
                return store;
            }
        }
    }
    MetadataStore::default()
}

fn save(store: &MetadataStore) {
    if let Some(path) = metadata_path() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(content) = serde_json::to_string_pretty(store) {
            let _ = fs::write(&path, content);
        }
    }
}

#[tauri::command]
pub fn rename_session(session_id: String, name: String) -> Result<(), String> {
    let mut store = load();
    let entry = store.entry(session_id).or_default();
    let trimmed = name.trim().to_string();
    entry.display_name = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.clone())
    };
    entry.pending_rename = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    };
    save(&store);
    Ok(())
}

#[tauri::command]
pub fn clear_pending_rename(session_id: String) -> Result<(), String> {
    let mut store = load();
    if let Some(entry) = store.get_mut(&session_id) {
        entry.pending_rename = None;
    }
    save(&store);
    Ok(())
}

#[tauri::command]
pub fn archive_session(session_id: String) -> Result<(), String> {
    let mut store = load();
    store.entry(session_id).or_default().archived = true;
    save(&store);
    Ok(())
}

#[tauri::command]
pub fn delete_session(session_id: String) -> Result<(), String> {
    // Remove the JSONL file from ~/.claude/projects/*/
    let projects_dir = dirs_next::home_dir()
        .map(|h| h.join(".claude").join("projects"))
        .ok_or_else(|| "no home dir".to_string())?;

    if let Ok(project_entries) = fs::read_dir(&projects_dir) {
        for entry in project_entries.flatten() {
            let jsonl_path = entry.path().join(format!("{}.jsonl", session_id));
            if jsonl_path.exists() {
                fs::remove_file(&jsonl_path).map_err(|e| e.to_string())?;
                break;
            }
        }
    }

    // Remove from metadata too
    let mut store = load();
    store.remove(&session_id);
    save(&store);
    Ok(())
}
