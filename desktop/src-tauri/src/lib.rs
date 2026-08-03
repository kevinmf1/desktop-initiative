pub mod auth;
pub mod auth_session;
pub mod ws;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(auth::AuthState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auth::sign_in_with_google,
            auth_session::cached_account,
            auth_session::sign_out
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
