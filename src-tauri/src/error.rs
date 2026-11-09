use serde::Serialize;

/// 后端错误。Tauri 的 command 返回值要求错误类型实现 `Serialize`，
/// 所以统一转成 `ErrorDto` 再抛给前端。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("未登录或登录已过期")]
    Unauthorized,
    #[error("不存在: {0}")]
    NotFound(String),
    #[error("参数错误: {0}")]
    BadRequest(String),
    #[error("冲突: {0}")]
    Conflict(String),
    #[error("网络错误: {0}")]
    Network(String),
    #[error("{0}")]
    Internal(String),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Unauthorized => "unauthorized",
            AppError::NotFound(_) => "not_found",
            AppError::BadRequest(_) => "bad_request",
            AppError::Conflict(_) => "conflict",
            AppError::Network(_) => "network",
            AppError::Internal(_) => "internal",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorDto {
    pub kind: String,
    pub message: String,
}

impl From<AppError> for ErrorDto {
    fn from(e: AppError) -> Self {
        ErrorDto {
            kind: e.kind().to_string(),
            message: e.to_string(),
        }
    }
}

impl From<serde_json::Error> for ErrorDto {
    fn from(e: serde_json::Error) -> Self {
        AppError::Internal(e.to_string()).into()
    }
}

impl From<std::io::Error> for ErrorDto {
    fn from(e: std::io::Error) -> Self {
        AppError::Internal(e.to_string()).into()
    }
}

// 让 api 层可以直接用 `?` 传播底层错误，不必到处写 map_err
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Internal(format!("JSON 处理失败: {e}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Internal(format!("IO 失败: {e}"))
    }
}

pub type AppResult<T> = Result<T, ErrorDto>;
