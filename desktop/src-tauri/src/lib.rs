pub mod auth;
pub mod auth_session;
pub mod device;
pub mod test_case;
pub mod test_plan;
pub mod workbook;
pub mod ws;

/// Every local store is one JSON file in the app data dir, so they all resolve their path the same
/// way. ponytail: named here rather than copied per module — feat-023 replaces one function.
pub(crate) fn store_path(
    app: &tauri::AppHandle,
    file: &str,
) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No app data directory: {e}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir.join(file))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(auth::AuthState::default())
        .manage(ws::pairing::PairingState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auth::sign_in_with_google,
            auth_session::cached_account,
            auth_session::sign_out,
            test_case::list_test_cases,
            test_case::save_test_case,
            test_case::delete_test_case,
            test_plan::list_test_plans,
            test_plan::save_test_plan,
            test_plan::archive_test_plan,
            test_plan::duplicate_test_plan,
            workbook::read_workbook,
            ws::pairing::mint_pairing_invite,
            device::list_devices,
            device::rename_device,
            device::set_device_enabled,
            device::remove_device,
            device::set_device_policy
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
