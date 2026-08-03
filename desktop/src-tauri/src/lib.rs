// No commands yet — the shell is UI-only (feat-004). The WS server, SQLite store,
// pairing, auth and sync modules land in their own features (see FEATURES.md).
pub mod ws;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
