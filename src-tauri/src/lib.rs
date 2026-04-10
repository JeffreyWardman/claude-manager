mod commands;
mod journal;
mod metadata;
mod pty_manager;
mod sessions;

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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_sessions,
            commands::get_custom_themes,
            commands::new_window,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
