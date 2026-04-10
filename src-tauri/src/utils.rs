use std::path::PathBuf;

pub fn is_pid_alive(pid: u32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn claude_projects_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".claude").join("projects"))
}

pub fn manager_config_dir() -> Option<PathBuf> {
    dirs_next::home_dir().map(|h| h.join(".config").join("claude-manager"))
}
