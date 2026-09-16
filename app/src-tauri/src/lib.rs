mod commands;
mod license;
mod packs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_elevated,
            commands::open_site,
            commands::relaunch_elevated,
            commands::restart_windows,
            commands::get_inventory,
            commands::get_machine_record,
            commands::get_latency_info,
            commands::apply_optimization,
            commands::revert_optimization,
            commands::get_metrics,
            commands::list_processes,
            commands::kill_process,
            commands::hide_to_tray,
            commands::scan_cleanup,
            commands::execute_cleanup,
            commands::scan_debloat,
            commands::prepare_debloat_restore,
            commands::remove_debloat_item,
            commands::scan_games,
            commands::clean_game_cache,
            commands::scan_game_configs,
            commands::apply_game_config,
            commands::restore_game_config,
            commands::scan_fivem,
            commands::clean_fivem_cache,
            commands::isolate_fivem_folder,
            commands::scan_sounds,
            commands::install_sound_pack,
            commands::restore_sounds,
            commands::preview_sound_pack,
            packs::manifest_baixar,
            packs::baixar_pack,
            packs::remover_pack,
            commands::scan_startup,
            commands::toggle_startup,
            commands::scan_tweaks,
            commands::set_tweak,
            commands::scan_fpsboost,
            commands::set_fpsboost,
            commands::scan_runtimes,
            commands::install_runtime,
            commands::export_log_file,
            license::license_check,
            license::license_activate,
            license::license_heartbeat,
            license::license_forget,
            license::close_license_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
