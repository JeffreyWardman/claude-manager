use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

pub const PORT: u16 = 23816;
const HOOK_URL: &str = "http://127.0.0.1:23816/hook";

fn hook_command() -> String {
    format!(
        "curl -sf --max-time 2 -X POST {HOOK_URL} -H 'Content-Type: application/json' -d @- || true"
    )
}

/// Start the HTTP hook listener. Silently no-ops if the port is already bound.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let listener = match TcpListener::bind(format!("127.0.0.1:{PORT}")) {
            Ok(l) => l,
            Err(_) => return,
        };
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || handle(stream, app));
        }
    });
}

fn handle(stream: std::net::TcpStream, app: AppHandle) {
    if stream
        .peer_addr()
        .map(|a| !a.ip().is_loopback())
        .unwrap_or(true)
    {
        return;
    }

    let mut write_stream = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };

    let mut reader = BufReader::new(stream);
    let mut content_length: usize = 0;

    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => return,
            Ok(_) => {}
        }
        if line == "\r\n" {
            break;
        }
        if line.to_ascii_lowercase().starts_with("content-length:") {
            if let Ok(n) = line["content-length:".len()..].trim().parse::<usize>() {
                content_length = n.min(64 * 1024);
            }
        }
    }

    let mut body = vec![0u8; content_length];
    if reader.read_exact(&mut body).is_err() {
        return;
    }
    let _ = write_stream
        .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");

    #[derive(Deserialize)]
    struct Payload {
        session_id: String,
        hook_event_name: String,
        tool_name: Option<String>,
    }

    let Ok(p) = serde_json::from_slice::<Payload>(&body) else {
        return;
    };

    if !crate::utils::is_valid_session_id(&p.session_id) {
        return;
    }

    let event = match p.hook_event_name.as_str() {
        "UserPromptSubmit" => format!("hook-computing-{}", p.session_id),
        "Stop" => format!("hook-stop-{}", p.session_id),
        // PreToolUse for the Agent tool fires just before a background agent is
        // launched, which is before the intermediate Stop. Use this to flag that
        // the next Stop should use the extended confirmation window.
        "PreToolUse" if matches!(p.tool_name.as_deref(), Some("Agent") | Some("Task")) => {
            format!("hook-agentlaunched-{}", p.session_id)
        }
        _ => return,
    };
    let _ = app.emit(&event, ());
}

/// Write UserPromptSubmit and Stop hooks into settings.json for every profile.
/// Merges with existing settings; skips entries already pointing at our URL.
pub fn install_hooks(config_dirs: &[PathBuf]) {
    let command = hook_command();
    for dir in config_dirs {
        let _ = install_for_dir(dir, &command);
    }
}

fn install_for_dir(dir: &std::path::Path, command: &str) -> Option<()> {
    let settings_path = dir.join("settings.json");

    let mut settings: serde_json::Value = if settings_path.exists() {
        let content = std::fs::read_to_string(&settings_path).ok()?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let obj = settings.as_object_mut()?;
    let hooks_val = obj.entry("hooks").or_insert_with(|| serde_json::json!({}));
    let hooks_map = hooks_val.as_object_mut()?;

    let mut changed = false;
    for hook_type in &["UserPromptSubmit", "PreToolUse", "Stop"] {
        let entries = hooks_map
            .entry(*hook_type)
            .or_insert_with(|| serde_json::json!([]));
        let arr = entries.as_array_mut()?;

        let already = arr.iter().any(|entry| {
            entry["hooks"]
                .as_array()
                .map(|hs| {
                    hs.iter()
                        .any(|h| h["command"].as_str().unwrap_or("").contains(HOOK_URL))
                })
                .unwrap_or(false)
        });

        if !already {
            arr.push(serde_json::json!({
                "matcher": "",
                "hooks": [{"type": "command", "command": command}]
            }));
            changed = true;
        }
    }

    if changed {
        if let Some(parent) = settings_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let content = serde_json::to_string_pretty(&settings).ok()?;
        std::fs::write(&settings_path, content).ok()?;
    }

    Some(())
}
