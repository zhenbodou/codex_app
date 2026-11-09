//! Tauri 命令层。
//!
//! 这一层只做三件事：从 `AppState` 拿到当前后端、转发调用、把错误转成前端能读的 `ErrorDto`。
//! 业务逻辑全在 `api/` 里，所以切换 mock / remote 时这里一行都不用改。
//!
//! 命名约定：Rust 侧参数是 snake_case，前端调用时要用 camelCase
//! （Tauri 默认 `rename_all = "camelCase"`）。命令名本身不转换。

use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::error::{AppError, AppResult, ErrorDto};
use crate::models::*;
use crate::state::AppState;

/// 流式事件通道名。前端用 `listen('llm-stream', ...)` 订阅。
pub const STREAM_EVENT: &str = "llm-stream";

macro_rules! client {
    ($state:expr) => {
        $state.api.client().await
    };
}

// ─────────────────────────── 鉴权 ───────────────────────────

#[tauri::command]
pub async fn login(state: tauri::State<'_, AppState>, req: LoginRequest) -> AppResult<AuthResponse> {
    let state = state.inner().clone();
    let auth = client!(state).login(req).await?;
    // 登录后同步该用户保存的后端模式（mock / remote）与 API 地址
    auth_settings_mode(&state, &auth.token).await;
    Ok(auth)
}

/// 读取该用户的设置并应用其 backend_mode。失败时保持当前模式，
/// 保证远程后端不可达也不会卡住登录流程。
async fn auth_settings_mode(state: &AppState, token: &str) {
    if let Ok(s) = state.api.client().await.get_settings(token).await {
        state.api.set_mode(s.backend_mode, &s.api_base_url).await;
    }
}

#[tauri::command]
pub async fn register(
    state: tauri::State<'_, AppState>,
    req: RegisterRequest,
) -> AppResult<AuthResponse> {
    let state = state.inner().clone();
    client!(state).register(req).await.map_err(ErrorDto::from)
}

#[tauri::command]
pub async fn logout(state: tauri::State<'_, AppState>, token: String) -> AppResult<()> {
    let state = state.inner().clone();
    client!(state).logout(&token).await.map_err(ErrorDto::from)
}

#[tauri::command]
pub async fn get_me(state: tauri::State<'_, AppState>, token: String) -> AppResult<User> {
    let state = state.inner().clone();
    client!(state).me(&token).await.map_err(ErrorDto::from)
}

#[tauri::command]
pub async fn update_profile(
    state: tauri::State<'_, AppState>,
    token: String,
    req: UpdateProfileRequest,
) -> AppResult<User> {
    let state = state.inner().clone();
    client!(state)
        .update_profile(&token, req)
        .await
        .map_err(ErrorDto::from)
}

#[tauri::command]
pub async fn change_password(
    state: tauri::State<'_, AppState>,
    token: String,
    req: ChangePasswordRequest,
) -> AppResult<()> {
    let state = state.inner().clone();
    client!(state)
        .change_password(&token, req)
        .await
        .map_err(ErrorDto::from)
}

// ─────────────────────────── 项目 ───────────────────────────

#[tauri::command]
pub async fn list_projects(
    state: tauri::State<'_, AppState>,
    token: String,
) -> AppResult<Vec<Project>> {
    let state = state.inner().clone();
    client!(state).list_projects(&token).await.map_err(Into::into)
}

#[tauri::command]
pub async fn create_project(
    state: tauri::State<'_, AppState>,
    token: String,
    req: CreateProjectRequest,
) -> AppResult<Project> {
    let state = state.inner().clone();
    client!(state)
        .create_project(&token, req)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn get_project(
    state: tauri::State<'_, AppState>,
    token: String,
    id: String,
) -> AppResult<Project> {
    let state = state.inner().clone();
    client!(state)
        .get_project(&token, &id)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn update_project(
    state: tauri::State<'_, AppState>,
    token: String,
    id: String,
    req: UpdateProjectRequest,
) -> AppResult<Project> {
    let state = state.inner().clone();
    client!(state)
        .update_project(&token, &id, req)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_project(
    state: tauri::State<'_, AppState>,
    token: String,
    id: String,
) -> AppResult<()> {
    let state = state.inner().clone();
    client!(state)
        .delete_project(&token, &id)
        .await
        .map_err(Into::into)
}

// ─────────────────────────── 会话 ───────────────────────────

#[tauri::command]
pub async fn list_sessions(
    state: tauri::State<'_, AppState>,
    token: String,
    project_id: Option<String>,
) -> AppResult<Vec<Session>> {
    let state = state.inner().clone();
    client!(state)
        .list_sessions(&token, project_id.as_deref())
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn create_session(
    state: tauri::State<'_, AppState>,
    token: String,
    req: CreateSessionRequest,
) -> AppResult<Session> {
    let state = state.inner().clone();
    client!(state)
        .create_session(&token, req)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn rename_session(
    state: tauri::State<'_, AppState>,
    token: String,
    id: String,
    title: String,
) -> AppResult<Session> {
    let state = state.inner().clone();
    client!(state)
        .rename_session(&token, &id, &title)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_session(
    state: tauri::State<'_, AppState>,
    token: String,
    id: String,
) -> AppResult<()> {
    let state = state.inner().clone();
    client!(state)
        .delete_session(&token, &id)
        .await
        .map_err(Into::into)
}

// ─────────────────────────── 消息与流式回复 ───────────────────────────

#[tauri::command]
pub async fn list_messages(
    state: tauri::State<'_, AppState>,
    token: String,
    session_id: String,
) -> AppResult<Vec<Message>> {
    let state = state.inner().clone();
    client!(state)
        .list_messages(&token, &session_id)
        .await
        .map_err(Into::into)
}

/// 提交提问。
///
/// 工作方式：
/// 1. 建一个 unbounded channel，把发送端交给后端；
/// 2. `tokio::spawn` 一个任务跑生成（不阻塞主线程，界面照常响应）；
/// 3. 本函数在循环里把 channel 收到的每个事件 `emit` 给前端；
/// 4. channel 关闭（后端 drop 掉发送端）后，取回任务结果作为完整消息返回。
#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    token: String,
    session_id: String,
    req: SendMessageRequest,
) -> AppResult<Message> {
    let state = state.inner().clone();
    let client = state.api.client().await;
    let cancel = state.register_cancel(&session_id).await;

    let (tx, mut rx) = mpsc::unbounded_channel::<StreamEvent>();

    let work_session = session_id.clone();
    let work = tokio::spawn(async move {
        client
            .send_message(&token, &work_session, req, tx, cancel)
            .await
    });

    while let Some(event) = rx.recv().await {
        let _ = app.emit(
            STREAM_EVENT,
            StreamPayload {
                session_id: session_id.clone(),
                event,
            },
        );
    }

    let result = work
        .await
        .map_err(|e| ErrorDto::from(AppError::Internal(format!("生成任务异常终止: {e}"))))?;

    state.unregister_cancel(&session_id).await;
    result.map_err(Into::into)
}

/// 停止当前会话的生成。
#[tauri::command]
pub async fn stop_generation(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> AppResult<()> {
    let state = state.inner().clone();
    if let Some(flag) = state.cancels.read().await.get(&session_id) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

// ─────────────────────────── 技能 ───────────────────────────

#[tauri::command]
pub async fn list_skills(
    state: tauri::State<'_, AppState>,
    token: String,
) -> AppResult<Vec<Skill>> {
    let state = state.inner().clone();
    client!(state).list_skills(&token).await.map_err(Into::into)
}

#[tauri::command]
pub async fn set_skill_enabled(
    state: tauri::State<'_, AppState>,
    token: String,
    id: String,
    enabled: bool,
) -> AppResult<Skill> {
    let state = state.inner().clone();
    client!(state)
        .set_skill_enabled(&token, &id, enabled)
        .await
        .map_err(Into::into)
}

// ─────────────────────────── 设置与元信息 ───────────────────────────

#[tauri::command]
pub async fn get_settings(
    state: tauri::State<'_, AppState>,
    token: String,
) -> AppResult<UserSettings> {
    let state = state.inner().clone();
    let settings = client!(state).get_settings(&token).await?;
    state
        .api
        .set_mode(settings.backend_mode, &settings.api_base_url)
        .await;
    Ok(settings)
}

#[tauri::command]
pub async fn update_settings(
    state: tauri::State<'_, AppState>,
    token: String,
    patch: Value,
) -> AppResult<UserSettings> {
    let state = state.inner().clone();
    let settings = client!(state).update_settings(&token, patch).await?;
    state
        .api
        .set_mode(settings.backend_mode, &settings.api_base_url)
        .await;
    Ok(settings)
}

/// 纯本地操作：强制切换后端模式。
/// 即使远程后端挂了、`get_settings` 拿不到数据，也能靠它切回 Mock。
#[tauri::command]
pub async fn set_backend_mode(
    state: tauri::State<'_, AppState>,
    mode: BackendMode,
    base_url: String,
) -> AppResult<()> {
    let state = state.inner().clone();
    state.api.set_mode(mode, &base_url).await;
    Ok(())
}

#[tauri::command]
pub async fn get_backend_mode(state: tauri::State<'_, AppState>) -> AppResult<Value> {
    let state = state.inner().clone();
    let mode = state.api.mode().await;
    Ok(serde_json::json!({ "mode": mode }))
}

#[tauri::command]
pub async fn list_models(
    state: tauri::State<'_, AppState>,
    token: String,
) -> AppResult<Vec<ModelInfo>> {
    let state = state.inner().clone();
    client!(state).list_models(&token).await.map_err(Into::into)
}

#[tauri::command]
pub async fn get_stats(state: tauri::State<'_, AppState>, token: String) -> AppResult<UsageStats> {
    let state = state.inner().clone();
    client!(state).get_stats(&token).await.map_err(Into::into)
}

// ─────────────────────────── 本地能力 ───────────────────────────

/// 打开系统原生的「选择文件夹」对话框，用于创建项目时挑选工作目录。
///
/// 插件的回调是同步风格的，这里用 oneshot channel 把它桥接成 async，
/// 避免在命令里阻塞 Tauri 的异步运行时。
#[tauri::command]
pub async fn pick_directory(app: AppHandle) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |picked| {
        let _ = tx.send(picked.map(|p| p.to_string()));
    });

    rx.await
        .map_err(|e| ErrorDto::from(AppError::Internal(format!("对话框已关闭: {e}"))))
}
