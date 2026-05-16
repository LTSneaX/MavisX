mod commands;
mod engine;
mod network;
mod notify;
mod ssh;
mod tray;
mod vault;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:mavisx.db", commands::migrations())
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .manage(vault::VaultKey(std::sync::Mutex::new(None)))
        .manage(ssh::SshSessions(std::sync::Mutex::new(std::collections::HashMap::new())))
        .manage(ssh::SshExecSessions(std::sync::Mutex::new(std::collections::HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            commands::test_monitor,
            commands::check_monitor_now,
            commands::generate_status_page,
            commands::record_heartbeat,
            commands::get_app_data_dir,
            // Vault
            vault::vault_is_setup,
            vault::vault_is_unlocked,
            vault::vault_setup,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_list_items,
            vault::vault_create_item,
            vault::vault_update_item,
            vault::vault_delete_item,
            vault::vault_get_secret,
            // SSH terminal
            ssh::ssh_connect,
            ssh::ssh_send_input,
            ssh::ssh_resize,
            ssh::ssh_disconnect,
            // SSH exec (log viewer)
            ssh::ssh_exec,
            ssh::ssh_exec_stop,
            // Network toolkit
            network::ping_host,
            network::port_scan,
            network::dns_lookup,
            network::ssl_info,
            network::wake_on_lan,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            tray::setup_tray(app.handle())?;
            engine::spawn_heartbeat_server(app.handle().clone());
            engine::spawn_engine(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running mavisx");
}
