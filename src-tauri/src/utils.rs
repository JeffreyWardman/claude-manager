use std::path::PathBuf;

pub const NO_HOME_DIR: &str = "Cannot find home directory";

pub fn is_pid_alive(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn manager_config_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".config").join("claude-manager"))
}

/// Validate a session ID is a UUID-like string (36 chars, alphanumeric + hyphens).
pub fn is_valid_session_id(id: &str) -> bool {
    id.len() == 36 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}
