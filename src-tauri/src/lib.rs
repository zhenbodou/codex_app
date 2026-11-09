mod api;
mod commands;
mod error;
mod models;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 模拟后端的数据文件放在系统的应用数据目录，不污染项目目录
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            app.manage(AppState::new(data_dir));

            // 配置里的初始尺寸可能比小屏幕的工作区还大，那样窗口会被摆到屏外。
            // 启动时按当前显示器收一次尺寸并居中，保证开箱可见。
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = win.current_monitor() {
                    let area = monitor.work_area().size;
                    if let Ok(outer) = win.outer_size() {
                        if outer.width > area.width || outer.height > area.height {
                            let size = tauri::Size::Physical(tauri::PhysicalSize::new(
                                outer.width.min(area.width),
                                outer.height.min(area.height),
                            ));
                            let _ = win.set_size(size);
                            let _ = win.center();
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 鉴权
            commands::login,
            commands::register,
            commands::logout,
            commands::get_me,
            commands::update_profile,
            commands::change_password,
            // 项目
            commands::list_projects,
            commands::create_project,
            commands::get_project,
            commands::update_project,
            commands::delete_project,
            // 会话
            commands::list_sessions,
            commands::create_session,
            commands::rename_session,
            commands::delete_session,
            // 消息
            commands::list_messages,
            commands::send_message,
            commands::stop_generation,
            // 技能
            commands::list_skills,
            commands::set_skill_enabled,
            // 设置与元信息
            commands::get_settings,
            commands::update_settings,
            commands::set_backend_mode,
            commands::get_backend_mode,
            commands::list_models,
            commands::get_stats,
            // 本地能力
            commands::pick_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
