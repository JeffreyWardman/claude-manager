use std::path::PathBuf;

pub const NO_HOME_DIR: &str = "Cannot find home directory";

pub fn is_pid_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(windows)]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH", "/FO", "CSV"])
            .output()
            .map(|o| {
                let out = String::from_utf8_lossy(&o.stdout);
                out.lines().any(|line| {
                    line.split(',')
                        .nth(1)
                        .and_then(|s| s.trim_matches('"').parse::<u32>().ok())
                        == Some(pid)
                })
            })
            .unwrap_or(false)
    }
}

pub fn manager_config_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".config").join("claude-manager"))
}

/// Validate a session ID is a UUID-like string (36 chars, alphanumeric + hyphens).
pub fn is_valid_session_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}
