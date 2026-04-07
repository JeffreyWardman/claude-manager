mod commands;
mod db;
mod journal;
mod metadata;
mod pty_manager;
mod sessions;

use sqlx::PgPool;
use tauri::Manager;

pub struct DbState(pub Option<PgPool>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            app.manage(pty_manager::PtyState::new());

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match db::connect().await {
                    Ok(pool) => {
                        handle.manage(DbState(Some(pool)));
                    }
                    Err(e) => {
                        eprintln!("DB connection failed (session naming unavailable): {e}");
                        handle.manage(DbState(None));
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_sessions,
            commands::get_display_names,
            commands::set_display_name,
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
