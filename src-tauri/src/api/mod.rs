//! 后端抽象层。
//!
//! 应用有两种后端实现，通过设置里的「后端模式」切换：
//! - [`mock::MockBackend`]：内置本地模拟服务，数据落在 app data 目录的 JSON 文件里，
//!   并用 [`llm`] 模块模拟大模型的流式输出。开箱即用，不需要服务器。
//! - [`remote::RemoteBackend`]：用 reqwest 调用真实后端，接口定义见 `docs/API.md`。
//!
//! 两者都实现 [`ApiClient`]，上层 command 完全不感知差异。

pub mod llm;
pub mod mock;
pub mod remote;

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;
use tokio::sync::{RwLock, mpsc};

use crate::error::AppError;
use crate::models::*;

/// 一次流式回复的取消开关。前端点「停止」时置为 true。
pub type CancelFlag = Arc<std::sync::atomic::AtomicBool>;

#[async_trait]
pub trait ApiClient: Send + Sync {
    // ── 鉴权 ──
    async fn login(&self, req: LoginRequest) -> Result<AuthResponse, AppError>;
    async fn register(&self, req: RegisterRequest) -> Result<AuthResponse, AppError>;
    async fn logout(&self, token: &str) -> Result<(), AppError>;
    async fn me(&self, token: &str) -> Result<User, AppError>;
    async fn update_profile(
        &self,
        token: &str,
        req: UpdateProfileRequest,
    ) -> Result<User, AppError>;
    async fn change_password(
        &self,
        token: &str,
        req: ChangePasswordRequest,
    ) -> Result<(), AppError>;

    // ── 项目 ──
    async fn list_projects(&self, token: &str) -> Result<Vec<Project>, AppError>;
    async fn create_project(
        &self,
        token: &str,
        req: CreateProjectRequest,
    ) -> Result<Project, AppError>;
    async fn get_project(&self, token: &str, id: &str) -> Result<Project, AppError>;
    async fn update_project(
        &self,
        token: &str,
        id: &str,
        req: UpdateProjectRequest,
    ) -> Result<Project, AppError>;
    async fn delete_project(&self, token: &str, id: &str) -> Result<(), AppError>;

    // ── 会话 ──
    async fn list_sessions(
        &self,
        token: &str,
        project_id: Option<&str>,
    ) -> Result<Vec<Session>, AppError>;
    async fn create_session(
        &self,
        token: &str,
        req: CreateSessionRequest,
    ) -> Result<Session, AppError>;
    async fn rename_session(&self, token: &str, id: &str, title: &str)
    -> Result<Session, AppError>;
    async fn delete_session(&self, token: &str, id: &str) -> Result<(), AppError>;

    // ── 消息 ──
    async fn list_messages(&self, token: &str, session_id: &str) -> Result<Vec<Message>, AppError>;
    /// 发送提问并流式接收回复。过程中的增量事件通过 `tx` 推出，
    /// 函数返回时得到落库后的完整消息。
    async fn send_message(
        &self,
        token: &str,
        session_id: &str,
        req: SendMessageRequest,
        tx: mpsc::UnboundedSender<StreamEvent>,
        cancel: CancelFlag,
    ) -> Result<Message, AppError>;

    // ── 技能 ──
    async fn list_skills(&self, token: &str) -> Result<Vec<Skill>, AppError>;
    async fn set_skill_enabled(
        &self,
        token: &str,
        id: &str,
        enabled: bool,
    ) -> Result<Skill, AppError>;

    // ── 设置与元信息 ──
    async fn get_settings(&self, token: &str) -> Result<UserSettings, AppError>;
    async fn update_settings(&self, token: &str, patch: Value) -> Result<UserSettings, AppError>;
    async fn list_models(&self, token: &str) -> Result<Vec<ModelInfo>, AppError>;
    async fn get_stats(&self, token: &str) -> Result<UsageStats, AppError>;
}

/// 持有两个后端实现，按当前模式派发。
pub struct Api {
    pub mock: Arc<mock::MockBackend>,
    pub remote: Arc<remote::RemoteBackend>,
    connection_path: std::path::PathBuf,
    mode: RwLock<BackendMode>,
    base_url: RwLock<String>,
}

impl Api {
    pub fn new(data_dir: std::path::PathBuf) -> Self {
        let connection_path = data_dir.join("connection.json");
        let saved = std::fs::read(&connection_path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok());
        let mode = saved
            .as_ref()
            .and_then(|v| serde_json::from_value(v["mode"].clone()).ok())
            .unwrap_or(BackendMode::Remote);
        let url = saved
            .as_ref()
            .and_then(|v| v["baseUrl"].as_str())
            .unwrap_or("http://127.0.0.1:8080/v1")
            .to_string();
        Api {
            connection_path,
            mock: Arc::new(mock::MockBackend::new(data_dir)),
            remote: Arc::new(remote::RemoteBackend::with_url(url.clone())),
            mode: RwLock::new(mode),
            base_url: RwLock::new(url.clone()),
        }
    }

    pub async fn client(&self) -> Arc<dyn ApiClient> {
        match *self.mode.read().await {
            BackendMode::Mock => self.mock.clone(),
            BackendMode::Remote => self.remote.clone(),
        }
    }

    pub async fn set_mode(&self, mode: BackendMode, base_url: &str) {
        *self.mode.write().await = mode;
        *self.base_url.write().await = base_url.to_string();
        self.remote.set_base_url(base_url).await;
        if let Some(parent) = self.connection_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        let value = serde_json::json!({"mode":mode,"baseUrl":base_url});
        if let Err(e) = tokio::fs::write(&self.connection_path, value.to_string()).await {
            eprintln!("Could not save connection: {e}");
        }
    }
    pub async fn connection_settings(&self, mut settings: UserSettings) -> UserSettings {
        settings.backend_mode = *self.mode.read().await;
        settings.api_base_url = self.base_url.read().await.clone();
        settings
    }

    pub async fn mode(&self) -> BackendMode {
        *self.mode.read().await
    }
}
