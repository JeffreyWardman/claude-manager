mod commands;
mod hook_server;
mod journal;
mod metadata;
mod profiles;
mod pty_manager;
mod sessions;
mod utils;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin({
            use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

            let new_session = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);

            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &new_session && event.state() == ShortcutState::Pressed {
                        let _ = app.emit("global-new-session", ());
                    }
                })
                .build()
        })
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyN);
                app.global_shortcut().register(shortcut)?;
            }

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
            pty_manager::pty_rekey,
            pty_manager::pty_kill,
            profiles::discover_profiles,
            profiles::save_profile_config,
            profiles::create_profile,
            profiles::remove_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
