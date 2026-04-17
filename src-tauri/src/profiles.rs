use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub path: String,
    pub hidden: bool,
}

fn profiles_path() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| {
        h.join(".config")
            .join("claude-manager")
            .join("profiles.json")
    })
}

fn load_saved_profiles() -> Vec<Profile> {
    let Some(path) = profiles_path() else {
        return vec![];
    };
    let Ok(content) = fs::read_to_string(&path) else {
        return vec![];
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn save_profiles(profiles: &[Profile]) {
    let Some(path) = profiles_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(profiles) {
        let _ = fs::write(&path, content);
    }
}

#[tauri::command]
pub fn discover_profiles() -> Vec<Profile> {
    let Some(home) = dirs_next::home_dir() else {
        return vec![];
    };
    let saved = load_saved_profiles();

    // Scan ~/.claude* directories
    let mut discovered: Vec<PathBuf> = vec![];
    if let Ok(entries) = fs::read_dir(&home) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with(".claude") && entry.path().is_dir() {
                if name_str == ".claude-manager" {
                    continue;
                }
                discovered.push(entry.path());
            }
        }
    }
    discovered.sort();

    // Merge: keep saved profile names/hidden state, add newly discovered ones
    let mut profiles: Vec<Profile> = vec![];
    for dir in &discovered {
        let path_str = dir.to_string_lossy().to_string();
        let id = path_str.clone();
        if let Some(existing) = saved.iter().find(|p| p.id == id) {
            profiles.push(existing.clone());
        } else {
            let dir_name = dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(".claude");
            let name = if dir_name == ".claude" {
                "Default".to_string()
            } else {
                dir_name.trim_start_matches(".claude-").to_string()
            };
            profiles.push(Profile {
                id,
                name,
                path: path_str,
                hidden: false,
            });
        }
    }

    // Append custom (non-discovered) saved profiles
    for saved_profile in &saved {
        if !profiles.iter().any(|p| p.id == saved_profile.id) {
            profiles.push(saved_profile.clone());
        }
    }

    profiles
}

#[tauri::command]
pub fn save_profile_config(profiles: Vec<Profile>) -> Result<(), String> {
    save_profiles(&profiles);
    Ok(())
}

#[tauri::command]
pub fn create_profile(name: String) -> Result<Profile, String> {
    let home = dirs_next::home_dir().ok_or(crate::utils::NO_HOME_DIR)?;
    let slug = name
        .trim()
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "-");
    if slug.is_empty() {
        return Err("invalid profile name".into());
    }
    let dir = home.join(format!(".claude-{slug}"));
    if dir.exists() {
        return Err(format!("directory already exists: {}", dir.display()));
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Write .claude.json to skip onboarding prompt
    let claude_json = dir.join(".claude.json");
    let _ = fs::write(&claude_json, r#"{"hasCompletedOnboarding": true}"#);

    let path_str = dir.to_string_lossy().to_string();
    let profile = Profile {
        id: path_str.clone(),
        name: name.trim().to_string(),
        path: path_str,
        hidden: false,
    };

    // Save to profiles.json so the custom name persists
    let mut profiles = load_saved_profiles();
    profiles.push(profile.clone());
    save_profiles(&profiles);

    Ok(profile)
}

#[tauri::command]
pub fn remove_profile(id: String) -> Result<(), String> {
    // Don't allow removing the default ~/.claude profile
    let home = dirs_next::home_dir().ok_or(crate::utils::NO_HOME_DIR)?;
    let default_path = home.join(".claude").to_string_lossy().to_string();
    if id == default_path {
        return Err("cannot remove the default profile".into());
    }

    // Remove from saved profiles
    let mut profiles = load_saved_profiles();
    profiles.retain(|p| p.id != id);
    save_profiles(&profiles);

    // Don't delete the directory — just unlink from Claude Manager.
    // The user can delete ~/.claude-{name} manually if they want.
    Ok(())
}
