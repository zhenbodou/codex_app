//! 真实后端客户端。所有端点、请求体、响应体与 `docs/API.md` 一一对应。
//!
//! 流式回复走 SSE：`POST /v1/sessions/{id}/messages` 返回 `text/event-stream`，
//! 每帧的 `data:` 是一个 [`StreamEvent`] JSON。

use std::sync::atomic::Ordering;

use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::StatusCode;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tokio::sync::{RwLock, mpsc};

use crate::api::{ApiClient, CancelFlag};
use crate::error::AppError;
use crate::models::*;

pub struct RemoteBackend {
    http: reqwest::Client,
    base_url: RwLock<String>,
}

impl RemoteBackend {
    pub fn with_url(url: String) -> Self {
        let http = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("构建 HTTP 客户端失败");
        RemoteBackend {
            http,
            base_url: RwLock::new(url),
        }
    }

    pub async fn set_base_url(&self, url: &str) {
        *self.base_url.write().await = url.trim_end_matches('/').to_string();
    }

    async fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.read().await, path)
    }

    /// 通用 JSON 请求。`token` 为空时不带 Authorization 头（登录/注册用）。
    async fn send<B: Serialize, T: DeserializeOwned>(
        &self,
        method: reqwest::Method,
        path: &str,
        token: &str,
        body: Option<B>,
    ) -> Result<T, AppError> {
        let url = self.url(path).await;
        let mut req = self
            .http
            .request(method, &url)
            .timeout(std::time::Duration::from_secs(60));
        if !token.is_empty() {
            req = req.bearer_auth(token);
        }
        if let Some(b) = body {
            req = req.json(&b);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| AppError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(map_http(
                resp.status(),
                &resp.text().await.unwrap_or_default(),
            ));
        }
        resp.json::<T>()
            .await
            .map_err(|e| AppError::Internal(format!("解析响应失败: {e}")))
    }

    /// 用于 204 / 空 body 的响应（DELETE、logout 等）。
    async fn send_empty<B: Serialize>(
        &self,
        method: reqwest::Method,
        path: &str,
        token: &str,
        body: Option<B>,
    ) -> Result<(), AppError> {
        let url = self.url(path).await;
        let mut req = self
            .http
            .request(method, &url)
            .timeout(std::time::Duration::from_secs(60));
        if !token.is_empty() {
            req = req.bearer_auth(token);
        }
        if let Some(b) = body {
            req = req.json(&b);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| AppError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(map_http(
                resp.status(),
                &resp.text().await.unwrap_or_default(),
            ));
        }
        Ok(())
    }
}

fn map_http(status: StatusCode, body: &str) -> AppError {
    // 后端错误体格式：{ "kind": "...", "message": "..." }
    if let Ok(v) = serde_json::from_str::<Value>(body) {
        let message = v
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or(body)
            .to_string();
        return match status.as_u16() {
            401 | 403 => AppError::Unauthorized,
            404 => AppError::NotFound(message),
            400 | 422 => AppError::BadRequest(message),
            409 => AppError::Conflict(message),
            _ => AppError::Internal(message),
        };
    }
    match status.as_u16() {
        401 | 403 => AppError::Unauthorized,
        404 => AppError::NotFound(body.to_string()),
        400 | 422 => AppError::BadRequest(body.to_string()),
        409 => AppError::Conflict(body.to_string()),
        _ => AppError::Internal(format!("HTTP {}: {body}", status.as_u16())),
    }
}

/// 把流式事件重新拼装成完整的内容块，用于返回落库后的消息。
#[derive(Default)]
struct Accumulator {
    blocks: Vec<ContentBlock>,
    thinking: String,
    text: String,
    usage: Usage,
}

impl Accumulator {
    fn push(&mut self, ev: &StreamEvent) {
        match ev {
            StreamEvent::ThinkingDelta { text, .. } => {
                self.flush_text();
                self.thinking.push_str(text);
            }
            StreamEvent::ThinkingEnd { duration_ms, .. } => {
                self.flush_text();
                self.flush_thinking(*duration_ms);
            }
            StreamEvent::TextDelta { text, .. } => {
                // 正常情况下 ThinkingEnd 已经关掉了思考块；这里兜底处理漏发结束事件的实现。
                self.flush_thinking(0);
                self.text.push_str(text);
            }
            StreamEvent::ToolStart {
                tool_id,
                name,
                input,
                ..
            } => {
                self.flush_thinking(0);
                self.flush_text();
                self.blocks.push(ContentBlock::ToolUse {
                    id: tool_id.clone(),
                    name: name.clone(),
                    input: input.clone(),
                    status: ToolStatus::Running,
                    result: None,
                    duration_ms: 0,
                });
            }
            StreamEvent::ToolEnd {
                tool_id,
                status,
                result,
                duration_ms,
                ..
            } => {
                let target = self
                    .blocks
                    .iter_mut()
                    .rev()
                    .find(|b| matches!(b, ContentBlock::ToolUse { id, .. } if id == tool_id));
                if let Some(ContentBlock::ToolUse {
                    status: s,
                    result: r,
                    duration_ms: d,
                    ..
                }) = target
                {
                    *s = *status;
                    *r = Some(result.clone());
                    *d = *duration_ms;
                }
            }
            StreamEvent::Done { usage, .. } => self.usage = *usage,
            _ => {}
        }
    }

    fn flush_text(&mut self) {
        if !self.text.is_empty() {
            self.blocks.push(ContentBlock::Text {
                text: std::mem::take(&mut self.text),
            });
        }
    }

    fn flush_thinking(&mut self, duration_ms: u64) {
        if !self.thinking.is_empty() {
            self.blocks.push(ContentBlock::Thinking {
                thinking: std::mem::take(&mut self.thinking),
                duration_ms,
            });
        }
    }

    fn into_blocks(mut self) -> Vec<ContentBlock> {
        self.flush_thinking(0);
        self.flush_text();
        self.blocks
    }
}

#[async_trait]
impl ApiClient for RemoteBackend {
    async fn login(&self, req: LoginRequest) -> Result<AuthResponse, AppError> {
        self.send(reqwest::Method::POST, "/auth/login", "", Some(req))
            .await
    }

    async fn register(&self, req: RegisterRequest) -> Result<AuthResponse, AppError> {
        self.send(reqwest::Method::POST, "/auth/register", "", Some(req))
            .await
    }

    async fn logout(&self, token: &str) -> Result<(), AppError> {
        self.send_empty::<Value>(reqwest::Method::POST, "/auth/logout", token, None)
            .await
    }

    async fn me(&self, token: &str) -> Result<User, AppError> {
        self.send::<Value, User>(reqwest::Method::GET, "/auth/me", token, None)
            .await
    }

    async fn update_profile(
        &self,
        token: &str,
        req: UpdateProfileRequest,
    ) -> Result<User, AppError> {
        self.send(reqwest::Method::PATCH, "/auth/me", token, Some(req))
            .await
    }

    async fn change_password(
        &self,
        token: &str,
        req: ChangePasswordRequest,
    ) -> Result<(), AppError> {
        self.send_empty(reqwest::Method::POST, "/auth/password", token, Some(req))
            .await
    }

    async fn list_projects(&self, token: &str) -> Result<Vec<Project>, AppError> {
        self.send::<Value, _>(reqwest::Method::GET, "/projects", token, None)
            .await
    }

    async fn create_project(
        &self,
        token: &str,
        req: CreateProjectRequest,
    ) -> Result<Project, AppError> {
        self.send(reqwest::Method::POST, "/projects", token, Some(req))
            .await
    }

    async fn get_project(&self, token: &str, id: &str) -> Result<Project, AppError> {
        self.send::<Value, _>(
            reqwest::Method::GET,
            &format!("/projects/{id}"),
            token,
            None,
        )
        .await
    }

    async fn update_project(
        &self,
        token: &str,
        id: &str,
        req: UpdateProjectRequest,
    ) -> Result<Project, AppError> {
        self.send(
            reqwest::Method::PATCH,
            &format!("/projects/{id}"),
            token,
            Some(req),
        )
        .await
    }

    async fn delete_project(&self, token: &str, id: &str) -> Result<(), AppError> {
        self.send_empty::<Value>(
            reqwest::Method::DELETE,
            &format!("/projects/{id}"),
            token,
            None,
        )
        .await
    }

    async fn list_sessions(
        &self,
        token: &str,
        project_id: Option<&str>,
    ) -> Result<Vec<Session>, AppError> {
        let path = match project_id {
            Some(pid) => format!("/sessions?projectId={pid}"),
            None => "/sessions".to_string(),
        };
        self.send::<Value, _>(reqwest::Method::GET, &path, token, None)
            .await
    }

    async fn create_session(
        &self,
        token: &str,
        req: CreateSessionRequest,
    ) -> Result<Session, AppError> {
        self.send(reqwest::Method::POST, "/sessions", token, Some(req))
            .await
    }

    async fn rename_session(
        &self,
        token: &str,
        id: &str,
        title: &str,
    ) -> Result<Session, AppError> {
        self.send(
            reqwest::Method::PATCH,
            &format!("/sessions/{id}"),
            token,
            Some(json!({ "title": title })),
        )
        .await
    }

    async fn delete_session(&self, token: &str, id: &str) -> Result<(), AppError> {
        self.send_empty::<Value>(
            reqwest::Method::DELETE,
            &format!("/sessions/{id}"),
            token,
            None,
        )
        .await
    }

    async fn list_messages(&self, token: &str, session_id: &str) -> Result<Vec<Message>, AppError> {
        self.send::<Value, _>(
            reqwest::Method::GET,
            &format!("/sessions/{session_id}/messages"),
            token,
            None,
        )
        .await
    }

    async fn send_message(
        &self,
        token: &str,
        session_id: &str,
        req: SendMessageRequest,
        tx: mpsc::UnboundedSender<StreamEvent>,
        cancel: CancelFlag,
    ) -> Result<Message, AppError> {
        let url = self.url(&format!("/sessions/{session_id}/messages")).await;
        let resp = self
            .http
            .post(&url)
            .bearer_auth(token)
            .header(reqwest::header::ACCEPT, "text/event-stream")
            .json(&req)
            .send()
            .await
            .map_err(|e| AppError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(map_http(
                resp.status(),
                &resp.text().await.unwrap_or_default(),
            ));
        }

        let mut stream = resp.bytes_stream();
        let mut buf = Vec::<u8>::new();
        let mut acc = Accumulator::default();
        let mut message_id = String::new();
        let mut model = None;
        let mut finished = false;
        let mut cancelled = false;

        'outer: loop {
            let chunk = tokio::select! {
                chunk = stream.next() => match chunk { Some(chunk) => chunk, None => break },
                _ = async { while !cancel.load(Ordering::Relaxed) { tokio::time::sleep(std::time::Duration::from_millis(50)).await; } } => {
                    cancelled = true;
                    break;
                }
            };
            if cancel.load(Ordering::Relaxed) {
                cancelled = true;
                break;
            }
            let bytes = chunk.map_err(|e| AppError::Network(e.to_string()))?;
            buf.extend_from_slice(&bytes);

            // SSE 以空行分帧
            while let Some(pos) = buf.windows(2).position(|w| w == b"\n\n") {
                let frame_bytes: Vec<u8> = buf.drain(..pos + 2).collect();
                let frame = String::from_utf8(frame_bytes)
                    .map_err(|e| AppError::Internal(format!("Invalid SSE UTF-8: {e}")))?;
                for line in frame.lines() {
                    let Some(data) = line.strip_prefix("data:") else {
                        continue;
                    };
                    let data = data.trim();
                    if data == "[DONE]" {
                        finished = true;
                        break 'outer;
                    }
                    let ev: StreamEvent = match serde_json::from_str(data) {
                        Ok(ev) => ev,
                        Err(e) => {
                            eprintln!("[remote] 无法解析 SSE 帧: {e}");
                            continue;
                        }
                    };

                    // 先在借用范围内把需要的信息拷出来，再统一发送/落库。
                    // 直接在 Error 分支里 `tx.send(ev)` 会和 `match &ev` 的借用冲突。
                    let mut fatal: Option<String> = None;
                    match &ev {
                        StreamEvent::Start {
                            message_id: mid,
                            model: m,
                        } => {
                            message_id = mid.clone();
                            model = Some(m.clone());
                        }
                        StreamEvent::Error { message, .. } => fatal = Some(message.clone()),
                        StreamEvent::Done { .. } => finished = true,
                        _ => {}
                    }
                    acc.push(&ev);
                    let _ = tx.send(ev);
                    if let Some(msg) = fatal {
                        return Err(AppError::Internal(msg));
                    }
                }
            }
        }

        if cancelled {
            // 通知后端中断生成（幂等，失败也不影响本地状态）
            let _ = self
                .http
                .post(self.url(&format!("/sessions/{session_id}/cancel")).await)
                .bearer_auth(token)
                .send()
                .await;
        }

        let usage = acc.usage;
        let blocks = acc.into_blocks();
        Ok(Message {
            id: if message_id.is_empty() {
                new_id()
            } else {
                message_id
            },
            session_id: session_id.to_string(),
            role: Role::Assistant,
            blocks,
            status: if cancelled {
                MessageStatus::Cancelled
            } else if finished {
                MessageStatus::Done
            } else {
                MessageStatus::Error
            },
            created_at: now(),
            model,
            usage: Some(usage),
        })
    }

    async fn list_skills(&self, token: &str) -> Result<Vec<Skill>, AppError> {
        self.send::<Value, _>(reqwest::Method::GET, "/skills", token, None)
            .await
    }

    async fn set_skill_enabled(
        &self,
        token: &str,
        id: &str,
        enabled: bool,
    ) -> Result<Skill, AppError> {
        self.send(
            reqwest::Method::PATCH,
            &format!("/skills/{id}"),
            token,
            Some(json!({ "enabled": enabled })),
        )
        .await
    }

    async fn get_settings(&self, token: &str) -> Result<UserSettings, AppError> {
        self.send::<Value, _>(reqwest::Method::GET, "/settings", token, None)
            .await
    }

    async fn update_settings(&self, token: &str, patch: Value) -> Result<UserSettings, AppError> {
        self.send(reqwest::Method::PATCH, "/settings", token, Some(patch))
            .await
    }

    async fn list_models(&self, token: &str) -> Result<Vec<ModelInfo>, AppError> {
        self.send::<Value, _>(reqwest::Method::GET, "/models", token, None)
            .await
    }

    async fn get_stats(&self, token: &str) -> Result<UsageStats, AppError> {
        self.send::<Value, _>(reqwest::Method::GET, "/stats", token, None)
            .await
    }
}
