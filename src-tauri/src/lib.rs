mod commands;
mod hook_server;
mod journal;
mod metadata;
mod profiles;
mod pty_manager;
mod sessions;
mod utils;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            app.manage(pty_manager::PtyState::new());

            let config_dirs: Vec<std::path::PathBuf> = profiles::discover_profiles()
                .into_iter()
                .map(|p| std::path::PathBuf::from(&p.path))
                .collect();
            hook_server::install_hooks(&config_dirs);
            hook_server::start(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_sessions,
            commands::get_custom_themes,
            commands::new_window,
            commands::set_badge_count,
            commands::get_platform,
            commands::play_sound,
            journal::get_conversation,
            journal::get_jsonl_size,
            metadata::rename_session,
            metadata::archive_session,
            metadata::delete_session,
            metadata::clear_pending_rename,
            pty_manager::pty_spawn,
            pty_manager::pty_get_scrollback,
            pty_manager::pty_write,
            pty_manager::pty_resize,
            pty_manager::pty_kill,
            profiles::discover_profiles,
            profiles::save_profile_config,
            profiles::create_profile,
            profiles::remove_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
