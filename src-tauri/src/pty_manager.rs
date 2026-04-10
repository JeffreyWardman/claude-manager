use base64::Engine as _;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::{fs, process};
use tauri::{AppHandle, Emitter, State};

use crate::utils::is_pid_alive;

const MAX_BUF: usize = 512 * 1024; // 512 KB scrollback

fn locks_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".claude").join("manager").join("locks"))
}

fn lock_path(id: &str) -> Option<PathBuf> {
    locks_dir().map(|d| d.join(format!("{id}.lock")))
}

fn acquire_lock(id: &str) -> Result<(), String> {
    let path = lock_path(id).ok_or("no home dir")?;
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            if pid != process::id() && is_pid_alive(pid) {
                return Err(format!("Session is locked by another instance (pid {pid})"));
            }
        }
    }
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, process::id().to_string()).map_err(|e| e.to_string())
}

fn release_lock(id: &str) {
    if let Some(path) = lock_path(id) {
        if let Ok(content) = fs::read_to_string(&path) {
            if content.trim().parse::<u32>().ok() == Some(process::id()) {
                let _ = fs::remove_file(&path);
            }
        }
    }
}

struct PtyEntry {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    scrollback: Arc<Mutex<Vec<u8>>>,
}

pub struct PtyState(Arc<Mutex<HashMap<String, PtyEntry>>>);

impl Default for PtyState {
    fn default() -> Self {
        PtyState(Arc::new(Mutex::new(HashMap::new())))
    }
}

impl PtyState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[tauri::command]
pub fn pty_spawn(
    id: String,
    cwd: String,
    rows: u16,
    cols: u16,
    resume: bool,
    cmd: Option<String>,
    skip_permissions: Option<bool>,
    state: State<'_, PtyState>,
    app: AppHandle,
) -> Result<(), String> {
    // Expand ~ in cwd
    let cwd = if cwd.starts_with("~/") || cwd == "~" {
        dirs_next::home_dir()
            .map(|h| cwd.replacen("~", h.to_str().unwrap_or("~"), 1))
            .unwrap_or(cwd)
    } else {
        cwd
    };

    // Lock this session so no other instance can resume it
    if cmd.is_none() {
        acquire_lock(&id)?;
    }

    // Kill any existing PTY with this id first
    state.0.lock().unwrap().remove(&id);

    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let (master, slave) = (pair.master, pair.slave);

    let mut cmd_builder = if let Some(ref explicit_cmd) = cmd {
        // Plain shell: run directly as a login shell
        let mut c = CommandBuilder::new(explicit_cmd);
        c.args(["-l"]);
        c
    } else {
        // Claude session — use $SHELL (login shell resolves PATH for `claude`)
        let shell = std::env::var("SHELL").unwrap_or_else(|_| String::from("/bin/sh"));
        let mut c = CommandBuilder::new(&shell);
        let skip = if skip_permissions.unwrap_or(false) {
            " --dangerously-skip-permissions"
        } else {
            ""
        };
        let claude_cmd = if resume {
            format!("claude --resume {id}{skip}")
        } else {
            format!("claude{skip}")
        };
        c.args(["-l", "-c", &claude_cmd]);
        c
    };
    cmd_builder.cwd(&cwd);
    cmd_builder.env("TERM", "xterm-256color");
    cmd_builder.env("COLORTERM", "truecolor");

    let mut child = slave
        .spawn_command(cmd_builder)
        .map_err(|e| e.to_string())?;
    drop(slave);

    std::thread::spawn(move || {
        let _ = child.wait();
    });

    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    let scrollback: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::new()));
    let scrollback_writer = scrollback.clone();

    let data_event = format!("pty-data-{}", id);
    let exit_event = format!("pty-exit-{}", id);

    // Clones needed by the reader thread for cleanup on exit
    let state_map = state.0.clone();
    let id_for_exit = id.clone();

    // Capture a weak reference to identify this specific spawn instance.
    // If pty_spawn is called again for the same id before this reader exits,
    // the new entry will have a different Arc, so we won't accidentally remove it.
    let scrollback_identity = scrollback.clone();

    std::thread::spawn(move || {
        let mut buf = vec![0u8; 8192];
        let mut first_output = true;
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app.emit(&exit_event, ());
                    // Only remove the entry if it still belongs to this spawn instance.
                    let mut map = state_map.lock().unwrap();
                    let is_same = map
                        .get(&id_for_exit)
                        .map(|e| Arc::ptr_eq(&e.scrollback, &scrollback_identity))
                        .unwrap_or(false);
                    if is_same {
                        map.remove(&id_for_exit);
                        drop(map);
                        release_lock(&id_for_exit);
                        let _ = app.emit("sessions-changed", ());
                    }
                    break;
                }
                Ok(n) => {
                    if first_output {
                        first_output = false;
                        // Claude needs time to write its pid file.
                        // Emit at 1s and 3s to catch it reliably.
                        for delay in [1, 3] {
                            let a = app.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_secs(delay));
                                let _ = a.emit("sessions-changed", ());
                            });
                        }
                    }
                    {
                        let mut sb = scrollback_writer.lock().unwrap();
                        sb.extend_from_slice(&buf[..n]);
                        if sb.len() > MAX_BUF {
                            let trim = sb.len() - MAX_BUF;
                            sb.drain(..trim);
                        }
                    }
                    let encoded = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    let _ = app.emit(&data_event, encoded);
                }
            }
        }
    });

    state.0.lock().unwrap().insert(
        id,
        PtyEntry {
            writer,
            master,
            scrollback,
        },
    );
    Ok(())
}

/// Returns base64-encoded scrollback buffer if a PTY with this id exists, else null.
/// Used by the frontend to replay history when reattaching to a running PTY.
#[tauri::command]
pub fn pty_get_scrollback(id: String, state: State<'_, PtyState>) -> Option<String> {
    let map = state.0.lock().unwrap();
    map.get(&id).map(|e| {
        let sb = e.scrollback.lock().unwrap();
        base64::engine::general_purpose::STANDARD.encode(&*sb)
    })
}

#[tauri::command]
pub fn pty_write(
    id: String,
    data: Vec<u8>,
    state: State<'_, PtyState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some(e) = map.get_mut(&id) {
        e.writer.write_all(&data).map_err(|e| e.to_string())?;
        drop(map);
        let _ = app.emit(&format!("pty-input-{}", id), ());
    }
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    id: String,
    rows: u16,
    cols: u16,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    if let Some(e) = map.get(&id) {
        e.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pty_kill(id: String, state: State<'_, PtyState>) -> Result<(), String> {
    state.0.lock().unwrap().remove(&id);
    release_lock(&id);
    Ok(())
}
