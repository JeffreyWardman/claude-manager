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
    crate::utils::manager_config_dir().map(|d| d.join("metadata.json"))
}

pub fn load() -> MetadataStore {
    let new_path = metadata_path();
    if let Some(ref new) = new_path {
        if !new.exists() {
            if let Some(old) = dirs_next::home_dir()
                .map(|h| h.join(".claude").join("manager").join("metadata.json"))
            {
                if old.exists() {
                    if let Some(parent) = new.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    let _ = fs::copy(&old, new);
                }
            }
        }
    }

    if let Some(path) = new_path {
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

fn with_metadata(f: impl FnOnce(&mut MetadataStore)) {
    let mut store = load();
    f(&mut store);
    save(&store);
}

#[tauri::command]
pub fn rename_session(session_id: String, name: String) -> Result<(), String> {
    with_metadata(|store| {
        let entry = store.entry(session_id).or_default();
        let value = {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        };
        entry.pending_rename = value.clone();
        entry.display_name = value;
    });
    Ok(())
}

#[tauri::command]
pub fn clear_pending_rename(session_id: String) -> Result<(), String> {
    with_metadata(|store| {
        if let Some(entry) = store.get_mut(&session_id) {
            entry.pending_rename = None;
        }
    });
    Ok(())
}

#[tauri::command]
pub fn archive_session(session_id: String) -> Result<(), String> {
    with_metadata(|store| {
        store.entry(session_id).or_default().archived = true;
    });
    Ok(())
}

#[tauri::command]
pub fn delete_session(config_dir: String, session_id: String) -> Result<(), String> {
    let projects_dir = PathBuf::from(&config_dir).join("projects");

    if let Ok(project_entries) = fs::read_dir(&projects_dir) {
        for entry in project_entries.flatten() {
            let jsonl_path = entry.path().join(format!("{}.jsonl", session_id));
            if jsonl_path.exists() {
                fs::remove_file(&jsonl_path).map_err(|e| e.to_string())?;
                break;
            }
        }
    }

    with_metadata(|store| {
        store.remove(&session_id);
    });
    Ok(())
}
