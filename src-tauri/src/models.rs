//! 前后端共享的数据契约。
//!
//! 这里所有 struct 都用 `rename_all = "camelCase"` 序列化，
//! 因此 Rust 侧的 `created_at` 到 TypeScript 侧就是 `createdAt`，
//! 与 `docs/API.md` 里描述的 JSON 完全一致。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub type Ts = DateTime<Utc>;

pub fn new_id() -> String {
    Uuid::new_v4().simple().to_string()
}

pub fn now() -> Ts {
    Utc::now()
}

// ─────────────────────────── 用户与鉴权 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Plan {
    #[default]
    Free,
    Pro,
    Max,
    Team,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub plan: Plan,
    pub created_at: Ts,
}

/// 登录/注册成功后返回的凭证。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub token: String,
    pub expires_at: Ts,
    pub user: User,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub name: String,
}

// ─────────────────────────── 项目 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    /// 项目在本地磁盘上的工作目录，等价于 `claude` 命令的 cwd。
    pub path: String,
    pub description: Option<String>,
    /// 侧边栏色块，取值见前端 PROJECT_COLORS。
    pub color: String,
    pub created_at: Ts,
    pub updated_at: Ts,
    /// 由后端聚合返回，创建时无需传。
    #[serde(default)]
    pub session_count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub path: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
}

// ─────────────────────────── 会话 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    #[default]
    Idle,
    Streaming,
    Error,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub model: String,
    pub status: SessionStatus,
    pub created_at: Ts,
    pub updated_at: Ts,
    #[serde(default)]
    pub message_count: u32,
    /// 本会话启用的技能 id。
    #[serde(default)]
    pub skills: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    pub project_id: String,
    pub title: Option<String>,
    pub model: Option<String>,
}

// ─────────────────────────── 消息 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolStatus {
    Pending,
    Running,
    Success,
    Error,
}

/// 一条消息由若干「内容块」组成，跟 Anthropic Messages API 的结构对齐：
/// 正文、思考过程、工具调用各占一块，可以按顺序混排。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ContentBlock {
    Text {
        text: String,
    },
    Thinking {
        thinking: String,
        #[serde(default)]
        duration_ms: u64,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
        status: ToolStatus,
        result: Option<String>,
        #[serde(default)]
        duration_ms: u64,
    },
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    #[serde(default)]
    pub input_tokens: u32,
    #[serde(default)]
    pub output_tokens: u32,
    #[serde(default)]
    pub cache_read_tokens: u32,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Pending,
    #[default]
    Streaming,
    Done,
    Error,
    Cancelled,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: Role,
    pub blocks: Vec<ContentBlock>,
    pub status: MessageStatus,
    pub created_at: Ts,
    pub model: Option<String>,
    pub usage: Option<Usage>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub content: String,
    /// 本次提问临时启用的技能 id，会覆盖会话默认配置。
    #[serde(default)]
    pub skills: Option<Vec<String>>,
    #[serde(default)]
    pub model: Option<String>,
}

// ─────────────────────────── 流式事件 ───────────────────────────

/// 大模型流式回复过程中推送给前端的事件。
///
/// 远程后端走 SSE，Tauri 侧转成 `llm-stream` 事件；两者的 payload 结构完全相同，
/// 详见 docs/API.md 的「流式协议」一节。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum StreamEvent {
    Start {
        message_id: String,
        model: String,
    },
    ThinkingDelta {
        message_id: String,
        text: String,
    },
    ThinkingEnd {
        message_id: String,
        duration_ms: u64,
    },
    TextDelta {
        message_id: String,
        text: String,
    },
    ToolStart {
        message_id: String,
        index: u32,
        tool_id: String,
        name: String,
        input: Value,
    },
    ToolEnd {
        message_id: String,
        index: u32,
        tool_id: String,
        status: ToolStatus,
        result: String,
        duration_ms: u64,
    },
    Done {
        message_id: String,
        usage: Usage,
    },
    Error {
        message_id: String,
        message: String,
    },
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StreamPayload {
    pub session_id: String,
    pub event: StreamEvent,
}

// ─────────────────────────── 技能 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    /// lucide-react 图标名，前端做映射。
    pub icon: String,
    pub enabled: bool,
    pub builtin: bool,
    #[serde(default)]
    pub usage_count: u32,
}

// ─────────────────────────── 设置 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    Dark,
    Light,
    System,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum BackendMode {
    /// 使用内置的本地模拟后端，无需服务器即可体验完整功能。
    #[default]
    Mock,
    /// 使用 `api_base_url` 指向的真实后端。
    Remote,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    pub theme: Theme,
    pub accent: String,
    pub font_size: u32,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub backend_mode: BackendMode,
    pub api_base_url: String,
    pub notifications: bool,
    pub sound: bool,
    pub auto_compact: bool,
    pub show_thinking: bool,
    /// 模拟后端的输出速度（每 tick 字符数），仅 mock 模式生效。
    pub stream_speed: u32,
}

impl Default for UserSettings {
    fn default() -> Self {
        UserSettings {
            theme: Theme::Dark,
            accent: "#D97757".to_string(),
            font_size: 14,
            model: "claude-sonnet-4-5".to_string(),
            temperature: 0.7,
            max_tokens: 8192,
            backend_mode: BackendMode::Mock,
            api_base_url: "https://api.example.com/v1".to_string(),
            notifications: true,
            sound: false,
            auto_compact: true,
            show_thinking: true,
            stream_speed: 3,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

// ─────────────────────────── 模型列表 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub context_window: u32,
}

// ─────────────────────────── 统计 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub projects: u32,
    pub sessions: u32,
    pub messages: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
}
