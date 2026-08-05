pub mod auth;
pub mod auth_session;
pub mod test_case;
pub mod test_plan;
pub mod workbook;
pub mod ws;

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
            ws::pairing::mint_pairing_invite
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
