use crate::sessions::{get_all_sessions, ClaudeSession};
use crate::utils::manager_config_dir;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn get_custom_themes() -> Vec<serde_json::Value> {
    let Some(dir) = manager_config_dir().map(|d| d.join("themes")) else {
        return vec![];
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return vec![];
    };
    entries
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| {
            let content = std::fs::read_to_string(e.path()).ok()?;
            serde_json::from_str::<serde_json::Value>(&content).ok()
        })
        .collect()
}

#[tauri::command]
pub fn get_sessions(config_dir: String) -> Vec<ClaudeSession> {
    get_all_sessions(&config_dir)
}

#[tauri::command]
pub fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn play_sound(path: String) {
    std::thread::spawn(move || {
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("afplay").arg(&path).output();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("paplay").arg(&path).output();
        }
        #[cfg(target_os = "windows")]
        {
            // Pass path via env var to avoid PowerShell metacharacter injection
            let _ = std::process::Command::new("powershell")
                .env("__CM_SOUND", &path)
                .args([
                    "-NoProfile",
                    "-c",
                    "(New-Object Media.SoundPlayer $env:__CM_SOUND).PlaySync()",
                ])
                .output();
        }
    });
}

#[tauri::command]
pub fn new_window(app: AppHandle, profile: Option<String>) -> Result<(), String> {
    let label = format!(
        "main-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );
    let mut url = String::from("/");
    if let Some(ref profile_id) = profile {
        let encoded: String = profile_id
            .bytes()
            .flat_map(|b| {
                if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' {
                    vec![b as char]
                } else {
                    format!("%{:02X}", b).chars().collect()
                }
            })
            .collect();
        url = format!("/?profile={}", encoded);
    }
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("claude-manager")
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 500.0);
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    builder.build().map_err(|e: tauri::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_badge_count(count: Option<i64>, app: AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || unsafe {
            use objc2::MainThreadMarker;
            use objc2_app_kit::NSApplication;
            use objc2_foundation::NSString;

            let mtm = MainThreadMarker::new_unchecked();
            let ns_app = NSApplication::sharedApplication(mtm);
            let dock_tile = ns_app.dockTile();
            let label = match count {
                Some(n) if n > 0 => Some(NSString::from_str(&n.to_string())),
                _ => None,
            };
            dock_tile.setBadgeLabel(label.as_deref());
            dock_tile.display();
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (count, app);
    }
}
