use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use tokio::sync::RwLock;

use crate::api::{Api, CancelFlag};

/// 全局应用状态。
///
/// 内部全是 `Arc`，所以 `Clone` 很便宜 —— 每个 async command 进来先克隆一份，
/// 就能避免 `tauri::State` 的借用跨 `await` 带来的生命周期麻烦。
#[derive(Clone)]
pub struct AppState {
    pub api: Arc<Api>,
    /// session_id -> 该会话当前流式回复的取消开关。
    /// 前端点「停止」时把对应 flag 置 true，生成循环会在下一个 tick 退出。
    pub cancels: Arc<RwLock<HashMap<String, CancelFlag>>>,
}

impl AppState {
    pub fn new(data_dir: std::path::PathBuf) -> Self {
        AppState {
            api: Arc::new(Api::new(data_dir)),
            cancels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn register_cancel(&self, session_id: &str) -> CancelFlag {
        let flag: CancelFlag = Arc::new(AtomicBool::new(false));
        self.cancels
            .write()
            .await
            .insert(session_id.to_string(), flag.clone());
        flag
    }

    pub async fn unregister_cancel(&self, session_id: &str) {
        self.cancels.write().await.remove(session_id);
    }
}
