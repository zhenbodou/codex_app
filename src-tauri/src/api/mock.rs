//! 内置的本地模拟后端。
//!
//! 数据存在 `app_data_dir/mock-db.json`，进程内用 `RwLock` 保护。
//! 它实现了和真实后端一样的 [`ApiClient`]，所以前端代码无需任何改动就能切换。
//!
//! ⚠️ 密码是明文存储的 —— 这个模块只用于本地演示，**不要**照搬到生产环境。

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use async_trait::async_trait;
use chrono::Duration as ChronoDuration;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::{RwLock, mpsc};

use crate::api::{ApiClient, CancelFlag, llm};
use crate::error::AppError;
use crate::models::*;

// ─────────────────────────── 存储结构 ───────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
struct UserRecord {
    password: String,
    user: User,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ProjectRow {
    owner: String,
    data: Project,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SessionRow {
    owner: String,
    data: Session,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct SkillRow {
    owner: String,
    data: Skill,
}

#[derive(Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
struct Db {
    users: Vec<UserRecord>,
    /// token -> (user_id, expires_at)
    tokens: HashMap<String, (String, Ts)>,
    projects: Vec<ProjectRow>,
    sessions: Vec<SessionRow>,
    messages: Vec<Message>,
    skills: Vec<SkillRow>,
    settings: HashMap<String, UserSettings>,
    /// 已经播种过演示数据的用户，避免每次启动重复写入。
    seeded: Vec<String>,
}

pub struct MockBackend {
    file: PathBuf,
    db: RwLock<Db>,
}

impl MockBackend {
    pub fn new(data_dir: PathBuf) -> Self {
        let file = data_dir.join("mock-db.json");
        let mut db = load(&file).unwrap_or_default();

        // 预置演示账号，让登录页的「填入演示账号」按钮开箱可用。
        // 这里还没进 RwLock，所以可以直接写盘，不需要在同步上下文里 block_on。
        if ensure_demo_user(&mut db) {
            write(&file, &db);
        }

        MockBackend {
            file,
            db: RwLock::new(db),
        }
    }

    /// 写回磁盘。失败只记录，不打断主流程。
    fn persist(&self, db: &Db) {
        write(&self.file, db);
    }

    /// 校验 token，返回 user_id。
    fn auth(db: &Db, token: &str) -> Result<String, AppError> {
        let (uid, expires) = db.tokens.get(token).ok_or(AppError::Unauthorized)?;
        if *expires < now() {
            return Err(AppError::Unauthorized);
        }
        Ok(uid.clone())
    }

    fn find_user<'a>(db: &'a Db, id: &str) -> Option<&'a User> {
        db.users.iter().find(|u| u.user.id == id).map(|u| &u.user)
    }
}

fn load(file: &Path) -> Option<Db> {
    let text = std::fs::read_to_string(file).ok()?;
    serde_json::from_str(&text).ok()
}

fn write(file: &Path, db: &Db) {
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match serde_json::to_string_pretty(db) {
        Ok(text) => {
            if let Err(e) = std::fs::write(file, text) {
                eprintln!("[mock] 写入 {} 失败: {e}", file.display());
            }
        }
        Err(e) => eprintln!("[mock] 序列化失败: {e}"),
    }
}

/// 演示账号，和前端登录页上的「填入演示账号」按钮保持一致。
pub const DEMO_EMAIL: &str = "demo@claude.dev";
const DEMO_PASSWORD: &str = "demo1234";

/// 首次启动时建好演示账号。返回 true 表示数据有变化、需要落盘。
///
/// 注意：这里**故意不播种项目/会话**，`seed_if_needed` 会在首次登录时补上，
/// 这样演示账号的 id 才能正确关联到那些数据行。
fn ensure_demo_user(db: &mut Db) -> bool {
    if db
        .users
        .iter()
        .any(|u| u.user.email.eq_ignore_ascii_case(DEMO_EMAIL))
    {
        return false;
    }

    db.users.push(UserRecord {
        // 明文存密码，仅限本地 mock 演示；接真实后端后由服务端做哈希
        password: DEMO_PASSWORD.into(),
        user: User {
            id: new_id(),
            email: DEMO_EMAIL.into(),
            name: "演示用户".into(),
            avatar_url: None,
            plan: Plan::Max,
            created_at: now(),
        },
    });
    true
}

// ─────────────────────────── 技能目录 ───────────────────────────

fn skill_catalog() -> Vec<Skill> {
    let s = |id: &str, name: &str, desc: &str, cat: &str, icon: &str, enabled: bool| Skill {
        id: id.into(),
        name: name.into(),
        description: desc.into(),
        category: cat.into(),
        icon: icon.into(),
        enabled,
        builtin: true,
        usage_count: 0,
    };

    vec![
        s("code-review", "代码审查", "按可读性、正确性、安全性三个维度审查改动，输出分级问题清单", "质量", "ShieldCheck", true),
        s("test-gen", "测试生成", "为目标模块生成单元/集成测试，覆盖边界条件与错误路径", "质量", "FlaskConical", true),
        s("debug-profiler", "调试剖析", "复现故障、定位根因、给出最小修复补丁与回归防线", "质量", "Bug", true),
        s("refactor", "重构助手", "在保持行为不变的前提下拆分长函数、消除重复、理顺依赖", "工程", "Wrench", false),
        s("perf-audit", "性能审计", "跑基准测试拿 baseline，定位热点，验证优化收益", "工程", "Gauge", false),
        s("api-designer", "接口设计", "设计 REST/RPC 契约，产出请求响应示例与错误码表", "工程", "Plug", false),
        s("git-commit", "提交信息", "分析暂存区改动，生成符合 Conventional Commits 的提交信息", "协作", "GitCommitHorizontal", true),
        s("doc-writer", "文档撰写", "为模块生成 README、架构说明与上手指南", "协作", "BookOpenText", false),
        s("security-scan", "安全扫描", "检查依赖漏洞、注入风险、密钥泄漏与权限配置", "安全", "Lock", true),
        s("dep-upgrade", "依赖升级", "评估 breaking change，逐个升级并跑通测试", "安全", "Package", false),
        s("i18n", "国际化", "抽取硬编码文案，生成多语言资源文件", "扩展", "Languages", false),
        s("sql-optimizer", "SQL 优化", "分析执行计划，补索引、改写查询", "扩展", "Database", false),
        s("onnx-runtime", "模型推理", "接入 ONNX Runtime，处理张量布局与预处理管线", "扩展", "BrainCircuit", false),
        s("changelog", "变更日志", "从 git 历史生成版本变更说明", "协作", "ScrollText", false),
    ]
}

// ─────────────────────────── 演示数据 ───────────────────────────

fn seed_if_needed(db: &mut Db, user_id: &str) {
    if db.seeded.contains(&user_id.to_string()) {
        return;
    }
    db.seeded.push(user_id.to_string());

    if !db.skills.iter().any(|s| s.owner == user_id) {
        for skill in skill_catalog() {
            db.skills.push(SkillRow {
                owner: user_id.to_string(),
                data: skill,
            });
        }
    }

    let p1 = Project {
        kind: ProjectKind::Normal,
        id: new_id(),
        name: "claude-code-desktop".into(),
        path: "D:\\code\\tauri\\claude-code-desktop".into(),
        description: Some("Tauri + React 实现的桌面版 AI 编码助手".into()),
        color: "#D97757".into(),
        created_at: now() - ChronoDuration::days(6),
        updated_at: now() - ChronoDuration::hours(2),
        session_count: 0,
    };
    let p2 = Project {
        kind: ProjectKind::Normal,
        id: new_id(),
        name: "tauri-bible".into(),
        path: "D:\\code\\tauri\\tauri-bible".into(),
        description: Some("从 HTML 到 Tauri 2 的中文教程（mdBook）".into()),
        color: "#6C9BCF".into(),
        created_at: now() - ChronoDuration::days(20),
        updated_at: now() - ChronoDuration::days(3),
        session_count: 0,
    };
    db.projects.push(ProjectRow {
        owner: user_id.to_string(),
        data: p1.clone(),
    });
    db.projects.push(ProjectRow {
        owner: user_id.to_string(),
        data: p2.clone(),
    });

    let s1 = Session {
        id: new_id(),
        project_id: p1.id.clone(),
        title: "流式渲染的性能优化".into(),
        model: "claude-sonnet-4-5".into(),
        status: SessionStatus::Idle,
        created_at: now() - ChronoDuration::hours(5),
        updated_at: now() - ChronoDuration::hours(2),
        message_count: 0,
        skills: vec!["perf-audit".into(), "refactor".into()],
    };
    let s2 = Session {
        id: new_id(),
        project_id: p1.id.clone(),
        title: "IPC 错误处理统一封装".into(),
        model: "claude-sonnet-4-5".into(),
        status: SessionStatus::Idle,
        created_at: now() - ChronoDuration::days(2),
        updated_at: now() - ChronoDuration::days(1),
        message_count: 0,
        skills: vec!["code-review".into()],
    };
    let s3 = Session {
        id: new_id(),
        project_id: p2.id.clone(),
        title: "Tauri 权限系统章节校订".into(),
        model: "claude-opus-4-1".into(),
        status: SessionStatus::Idle,
        created_at: now() - ChronoDuration::days(4),
        updated_at: now() - ChronoDuration::days(3),
        message_count: 0,
        skills: vec![],
    };
    for s in [&s1, &s2, &s3] {
        db.sessions.push(SessionRow {
            owner: user_id.to_string(),
            data: s.clone(),
        });
    }

    push_demo_conversation(db, &s1.id);
}

fn push_demo_conversation(db: &mut Db, session_id: &str) {
    let q = Message {
        id: new_id(),
        session_id: session_id.to_string(),
        role: Role::User,
        blocks: vec![ContentBlock::Text {
            text: "会话里有一万条消息时滚动很卡，帮我优化一下".into(),
        }],
        status: MessageStatus::Done,
        created_at: now() - ChronoDuration::hours(5),
        model: None,
        usage: None,
    };

    let a = Message {
        id: new_id(),
        session_id: session_id.to_string(),
        role: Role::Assistant,
        blocks: vec![
            ContentBlock::Thinking {
                thinking: "先量再改。没有 baseline 的优化都是猜。".into(),
                duration_ms: 2100,
            },
            ContentBlock::ToolUse {
                id: format!("toolu_{}", &new_id()[..16]),
                name: "Bash".into(),
                input: json!({ "command": "cargo bench --bench render", "description": "跑基准测试拿 baseline" }),
                status: ToolStatus::Success,
                result: Some("rendering/10k_messages\n    time:   [1.2843 s 1.3021 s 1.3198 s]".into()),
                duration_ms: 2100,
            },
            ContentBlock::Text {
                text: "瓶颈是全量渲染 + 没有 memo。\n\n换成虚拟滚动后，10k 消息从 **1.30s 降到 87ms**：\n\n```tsx\nconst Row = memo(function Row({ message }: { message: Message }) {\n  return <MessageItem message={message} />\n})\n\nexport function MessageList({ messages }: Props) {\n  return (\n    <Virtuoso\n      data={messages}\n      itemContent={(_, m) => <Row key={m.id} message={m} />}\n      followOutput=\"smooth\"\n    />\n  )\n}\n```\n\n注意 `Row` 必须提到模块顶层，写在 `itemContent` 里的匿名组件会让 memo 失效。".into(),
            },
        ],
        status: MessageStatus::Done,
        created_at: now() - ChronoDuration::hours(5) + ChronoDuration::minutes(1),
        model: Some("claude-sonnet-4-5".into()),
        usage: Some(Usage {
            input_tokens: 1842,
            output_tokens: 623,
            cache_read_tokens: 3120,
        }),
    };

    db.messages.push(q);
    db.messages.push(a);
}

// ─────────────────────────── ApiClient 实现 ───────────────────────────

#[async_trait]
impl ApiClient for MockBackend {
    async fn login(&self, req: LoginRequest) -> Result<AuthResponse, AppError> {
        let mut db = self.db.write().await;
        let email = req.email.trim().to_lowercase();

        let rec = db
            .users
            .iter()
            .find(|u| u.user.email.to_lowercase() == email)
            .ok_or_else(|| AppError::Unauthorized)?;

        if rec.password != req.password {
            return Err(AppError::Unauthorized);
        }

        // 借用检查：先把 user 克隆出来再改 db
        let user = rec.user.clone();
        seed_if_needed(&mut db, &user.id);

        let token = format!("mock_{}", new_id());
        let expires_at = now() + ChronoDuration::days(30);
        db.tokens.insert(token.clone(), (user.id.clone(), expires_at));
        db.settings.entry(user.id.clone()).or_default();
        self.persist(&db);

        Ok(AuthResponse {
            token,
            expires_at,
            user,
        })
    }

    async fn register(&self, req: RegisterRequest) -> Result<AuthResponse, AppError> {
        let mut db = self.db.write().await;
        let email = req.email.trim().to_lowercase();

        if email.is_empty() || !email.contains('@') {
            return Err(AppError::BadRequest("邮箱格式不正确".into()));
        }
        if req.password.len() < 6 {
            return Err(AppError::BadRequest("密码至少 6 位".into()));
        }
        if db.users.iter().any(|u| u.user.email.to_lowercase() == email) {
            return Err(AppError::Conflict("该邮箱已被注册".into()));
        }

        let user = User {
            id: new_id(),
            email,
            name: if req.name.trim().is_empty() {
                "新用户".into()
            } else {
                req.name.trim().into()
            },
            avatar_url: None,
            plan: Plan::Pro,
            created_at: now(),
        };
        db.users.push(UserRecord {
            password: req.password,
            user: user.clone(),
        });
        seed_if_needed(&mut db, &user.id);

        let token = format!("mock_{}", new_id());
        let expires_at = now() + ChronoDuration::days(30);
        db.tokens.insert(token.clone(), (user.id.clone(), expires_at));
        db.settings.insert(user.id.clone(), UserSettings::default());
        self.persist(&db);

        Ok(AuthResponse {
            token,
            expires_at,
            user,
        })
    }

    async fn logout(&self, token: &str) -> Result<(), AppError> {
        let mut db = self.db.write().await;
        db.tokens.remove(token);
        self.persist(&db);
        Ok(())
    }

    async fn me(&self, token: &str) -> Result<User, AppError> {
        let db = self.db.read().await;
        let uid = Self::auth(&db, token)?;
        Self::find_user(&db, &uid).cloned().ok_or(AppError::Unauthorized)
    }

    async fn update_profile(
        &self,
        token: &str,
        req: UpdateProfileRequest,
    ) -> Result<User, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;
        let rec = db
            .users
            .iter_mut()
            .find(|u| u.user.id == uid)
            .ok_or(AppError::Unauthorized)?;

        if let Some(name) = req.name
            && !name.trim().is_empty()
        {
            rec.user.name = name.trim().into();
        }
        if let Some(email) = req.email
            && !email.trim().is_empty()
        {
            rec.user.email = email.trim().to_lowercase();
        }
        if let Some(url) = req.avatar_url {
            rec.user.avatar_url = if url.is_empty() { None } else { Some(url) };
        }

        let user = rec.user.clone();
        self.persist(&db);
        Ok(user)
    }

    async fn change_password(
        &self,
        token: &str,
        req: ChangePasswordRequest,
    ) -> Result<(), AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;
        let rec = db
            .users
            .iter_mut()
            .find(|u| u.user.id == uid)
            .ok_or(AppError::Unauthorized)?;

        if rec.password != req.old_password {
            return Err(AppError::BadRequest("原密码不正确".into()));
        }
        if req.new_password.len() < 6 {
            return Err(AppError::BadRequest("新密码至少 6 位".into()));
        }
        rec.password = req.new_password;
        self.persist(&db);
        Ok(())
    }

    async fn list_projects(&self, token: &str) -> Result<Vec<Project>, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;
        seed_if_needed(&mut db, &uid);

        let mut out: Vec<Project> = db
            .projects
            .iter()
            .filter(|p| p.owner == uid)
            .map(|p| p.data.clone())
            .collect();
        for p in out.iter_mut() {
            p.session_count = db
                .sessions
                .iter()
                .filter(|s| s.data.project_id == p.id)
                .count() as u32;
        }
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        self.persist(&db);
        Ok(out)
    }

    async fn create_project(
        &self,
        token: &str,
        req: CreateProjectRequest,
    ) -> Result<Project, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;

        let name = req.name.trim();
        if name.is_empty() {
            return Err(AppError::BadRequest("项目名不能为空".into()));
        }
        if db
            .projects
            .iter()
            .any(|p| p.owner == uid && p.data.name.eq_ignore_ascii_case(name))
        {
            return Err(AppError::Conflict("同名项目已存在".into()));
        }

        let palette = ["#D97757", "#6C9BCF", "#7FB069", "#C792EA", "#E0A458", "#56B6C2"];
        let color = req.color.unwrap_or_else(|| {
            palette[db.projects.len() % palette.len()].to_string()
        });

        let project = Project {
            kind: req.kind,
            id: new_id(),
            name: name.into(),
            path: req.path.trim().into(),
            description: req.description.filter(|d| !d.trim().is_empty()),
            color,
            created_at: now(),
            updated_at: now(),
            session_count: 0,
        };
        db.projects.push(ProjectRow {
            owner: uid,
            data: project.clone(),
        });
        self.persist(&db);
        Ok(project)
    }

    async fn get_project(&self, token: &str, id: &str) -> Result<Project, AppError> {
        let db = self.db.read().await;
        let uid = Self::auth(&db, token)?;
        db.projects
            .iter()
            .find(|p| p.owner == uid && p.data.id == id)
            .map(|p| p.data.clone())
            .ok_or_else(|| AppError::NotFound(format!("项目 {id}")))
    }

    async fn update_project(
        &self,
        token: &str,
        id: &str,
        req: UpdateProjectRequest,
    ) -> Result<Project, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;
        let row = db
            .projects
            .iter_mut()
            .find(|p| p.owner == uid && p.data.id == id)
            .ok_or_else(|| AppError::NotFound(format!("项目 {id}")))?;

        if let Some(name) = req.name
            && !name.trim().is_empty()
        {
            row.data.name = name.trim().into();
        }
        if let Some(path) = req.path {
            row.data.path = path;
        }
        if let Some(desc) = req.description {
            row.data.description = if desc.trim().is_empty() {
                None
            } else {
                Some(desc)
            };
        }
        if let Some(kind) = req.kind {
            row.data.kind = kind;
        }
        if let Some(color) = req.color {
            row.data.color = color;
        }
        row.data.updated_at = now();

        let out = row.data.clone();
        self.persist(&db);
        Ok(out)
    }

    async fn delete_project(&self, token: &str, id: &str) -> Result<(), AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;

        let before = db.projects.len();
        db.projects.retain(|p| !(p.owner == uid && p.data.id == id));
        if db.projects.len() == before {
            return Err(AppError::NotFound(format!("项目 {id}")));
        }

        // 级联删除会话与消息
        let doomed: Vec<String> = db
            .sessions
            .iter()
            .filter(|s| s.owner == uid && s.data.project_id == id)
            .map(|s| s.data.id.clone())
            .collect();
        db.sessions.retain(|s| !doomed.contains(&s.data.id));
        db.messages.retain(|m| !doomed.contains(&m.session_id));

        self.persist(&db);
        Ok(())
    }

    async fn list_sessions(
        &self,
        token: &str,
        project_id: Option<&str>,
    ) -> Result<Vec<Session>, AppError> {
        let db = self.db.read().await;
        let uid = Self::auth(&db, token)?;

        let mut out: Vec<Session> = db
            .sessions
            .iter()
            .filter(|s| s.owner == uid)
            .filter(|s| project_id.is_none_or(|pid| s.data.project_id == pid))
            .map(|s| s.data.clone())
            .collect();

        for s in out.iter_mut() {
            s.message_count = db
                .messages
                .iter()
                .filter(|m| m.session_id == s.id)
                .count() as u32;
        }
        out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(out)
    }

    async fn create_session(
        &self,
        token: &str,
        req: CreateSessionRequest,
    ) -> Result<Session, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;

        let project_exists = db
            .projects
            .iter()
            .any(|p| p.owner == uid && p.data.id == req.project_id);
        if !project_exists {
            return Err(AppError::NotFound(format!("项目 {}", req.project_id)));
        }

        let model = req.model.unwrap_or_else(|| {
            db.settings
                .get(&uid)
                .map(|s| s.model.clone())
                .unwrap_or_else(|| UserSettings::default().model)
        });

        let index = db
            .sessions
            .iter()
            .filter(|s| s.data.project_id == req.project_id)
            .count()
            + 1;

        let session = Session {
            id: new_id(),
            project_id: req.project_id.clone(),
            title: req
                .title
                .filter(|t| !t.trim().is_empty())
                .unwrap_or_else(|| format!("新会话 {index}")),
            model,
            status: SessionStatus::Idle,
            created_at: now(),
            updated_at: now(),
            message_count: 0,
            skills: vec![],
        };

        if let Some(p) = db
            .projects
            .iter_mut()
            .find(|p| p.owner == uid && p.data.id == req.project_id)
        {
            p.data.updated_at = now();
        }
        db.sessions.push(SessionRow {
            owner: uid,
            data: session.clone(),
        });
        self.persist(&db);
        Ok(session)
    }

    async fn rename_session(&self, token: &str, id: &str, title: &str) -> Result<Session, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;
        let title = title.trim();
        if title.is_empty() {
            return Err(AppError::BadRequest("标题不能为空".into()));
        }
        let row = db
            .sessions
            .iter_mut()
            .find(|s| s.owner == uid && s.data.id == id)
            .ok_or_else(|| AppError::NotFound(format!("会话 {id}")))?;

        row.data.title = title.into();
        row.data.updated_at = now();
        let out = row.data.clone();
        self.persist(&db);
        Ok(out)
    }

    async fn delete_session(&self, token: &str, id: &str) -> Result<(), AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;

        let before = db.sessions.len();
        db.sessions.retain(|s| !(s.owner == uid && s.data.id == id));
        if db.sessions.len() == before {
            return Err(AppError::NotFound(format!("会话 {id}")));
        }
        db.messages.retain(|m| m.session_id != id);
        self.persist(&db);
        Ok(())
    }

    async fn list_messages(&self, token: &str, session_id: &str) -> Result<Vec<Message>, AppError> {
        let db = self.db.read().await;
        let uid = Self::auth(&db, token)?;

        if !db
            .sessions
            .iter()
            .any(|s| s.owner == uid && s.data.id == session_id)
        {
            return Err(AppError::NotFound(format!("会话 {session_id}")));
        }

        let mut out: Vec<Message> = db
            .messages
            .iter()
            .filter(|m| m.session_id == session_id)
            .cloned()
            .collect();
        out.sort_by_key(|m| m.created_at);
        Ok(out)
    }

    async fn send_message(
        &self,
        token: &str,
        session_id: &str,
        req: SendMessageRequest,
        tx: mpsc::UnboundedSender<StreamEvent>,
        cancel: CancelFlag,
    ) -> Result<Message, AppError> {
        let content = req.content.trim();
        if content.is_empty() {
            return Err(AppError::BadRequest("消息内容不能为空".into()));
        }

        // 阶段一：加锁写入用户消息 + 创建助手消息占位，然后立刻释放锁。
        // 绝不能在持锁状态下 await 流式输出，否则整个应用的数据访问都会被堵住。
        let (message_id, model, skills, speed) = {
            let mut db = self.db.write().await;
            let uid = Self::auth(&db, token)?;

            // ── 只读阶段 ──
            // 先把要用的数据全部取出来再做写入。如果先 `iter_mut()` 拿到 row，
            // 后面再读 `db.settings` / `db.skills` 就会和那个可变借用冲突（E0502）。
            let exists = db
                .sessions
                .iter()
                .any(|s| s.owner == uid && s.data.id == session_id);
            if !exists {
                return Err(AppError::NotFound(format!("会话 {session_id}")));
            }

            let settings = db.settings.get(&uid).cloned().unwrap_or_default();
            let model = req.model.clone().unwrap_or(settings.model.clone());
            let speed = settings.stream_speed.max(1);
            let skills = req.skills.clone().unwrap_or_else(|| {
                db.skills
                    .iter()
                    .filter(|s| s.owner == uid && s.data.enabled)
                    .map(|s| s.data.name.clone())
                    .collect()
            });
            // 首条提问自动作为会话标题
            let is_first = !db
                .messages
                .iter()
                .any(|m| m.session_id == session_id);
            let message_id = new_id();

            // ── 写入阶段 ──
            if let Some(row) = db
                .sessions
                .iter_mut()
                .find(|s| s.owner == uid && s.data.id == session_id)
            {
                row.data.status = SessionStatus::Streaming;
                row.data.updated_at = now();
                if is_first {
                    row.data.title = content.chars().take(28).collect();
                }
            }

            db.messages.push(Message {
                id: new_id(),
                session_id: session_id.to_string(),
                role: Role::User,
                blocks: vec![ContentBlock::Text {
                    text: content.to_string(),
                }],
                status: MessageStatus::Done,
                created_at: now(),
                model: None,
                usage: None,
            });

            db.messages.push(Message {
                id: message_id.clone(),
                session_id: session_id.to_string(),
                role: Role::Assistant,
                blocks: vec![],
                status: MessageStatus::Streaming,
                created_at: now(),
                model: Some(model.clone()),
                usage: None,
            });

            self.persist(&db);
            (message_id, model, skills, speed)
        };

        let _ = tx.send(StreamEvent::Start {
            message_id: message_id.clone(),
            model: model.clone(),
        });

        // 阶段二：无锁推流
        let steps = llm::plan(content, &skills);
        let outcome = llm::run(steps, &message_id, &model, speed, &tx, &cancel).await;

        // 阶段三：加锁落库
        let mut db = self.db.write().await;
        let status = if outcome.cancelled {
            MessageStatus::Cancelled
        } else {
            MessageStatus::Done
        };

        if let Some(m) = db.messages.iter_mut().find(|m| m.id == message_id) {
            m.blocks = outcome.blocks;
            m.status = status;
            m.usage = Some(outcome.usage);
        }
        if let Some(s) = db.sessions.iter_mut().find(|s| s.data.id == session_id) {
            s.data.status = SessionStatus::Idle;
            s.data.updated_at = now();
        }
        let final_message = db
            .messages
            .iter()
            .find(|m| m.id == message_id)
            .cloned()
            .ok_or_else(|| AppError::Internal("消息丢失".into()))?;
        self.persist(&db);

        if outcome.cancelled {
            let _ = tx.send(StreamEvent::Error {
                message_id: message_id.clone(),
                message: "已停止生成".into(),
            });
        } else {
            let _ = tx.send(StreamEvent::Done {
                message_id,
                usage: outcome.usage,
            });
        }

        Ok(final_message)
    }

    async fn list_skills(&self, token: &str) -> Result<Vec<Skill>, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;
        seed_if_needed(&mut db, &uid);
        self.persist(&db);

        Ok(db
            .skills
            .iter()
            .filter(|s| s.owner == uid)
            .map(|s| s.data.clone())
            .collect())
    }

    async fn set_skill_enabled(
        &self,
        token: &str,
        id: &str,
        enabled: bool,
    ) -> Result<Skill, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;
        let row = db
            .skills
            .iter_mut()
            .find(|s| s.owner == uid && s.data.id == id)
            .ok_or_else(|| AppError::NotFound(format!("技能 {id}")))?;

        row.data.enabled = enabled;
        let out = row.data.clone();
        self.persist(&db);
        Ok(out)
    }

    async fn get_settings(&self, token: &str) -> Result<UserSettings, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;
        let settings = db.settings.entry(uid).or_default().clone();
        self.persist(&db);
        Ok(settings)
    }

    async fn update_settings(&self, token: &str, patch: Value) -> Result<UserSettings, AppError> {
        let mut db = self.db.write().await;
        let uid = Self::auth(&db, token)?;

        let current = db.settings.get(&uid).cloned().unwrap_or_default();
        let merged = merge_json(serde_json::to_value(&current)?, patch);
        let settings: UserSettings = serde_json::from_value(merged)?;

        db.settings.insert(uid, settings.clone());
        self.persist(&db);
        Ok(settings)
    }

    async fn list_models(&self, _token: &str) -> Result<Vec<ModelInfo>, AppError> {
        Ok(vec![
            ModelInfo {
                id: "claude-sonnet-4-5".into(),
                name: "Claude Sonnet 4.5".into(),
                description: "默认选择，速度与能力平衡，适合日常编码".into(),
                context_window: 200_000,
            },
            ModelInfo {
                id: "claude-opus-4-1".into(),
                name: "Claude Opus 4.1".into(),
                description: "最强推理，适合复杂架构设计与疑难调试".into(),
                context_window: 200_000,
            },
            ModelInfo {
                id: "claude-haiku-4-5".into(),
                name: "Claude Haiku 4.5".into(),
                description: "最快最省，适合批量简单任务".into(),
                context_window: 200_000,
            },
        ])
    }

    async fn get_stats(&self, token: &str) -> Result<UsageStats, AppError> {
        let db = self.db.read().await;
        let uid = Self::auth(&db, token)?;

        let project_ids: Vec<String> = db
            .projects
            .iter()
            .filter(|p| p.owner == uid)
            .map(|p| p.data.id.clone())
            .collect();
        let session_ids: Vec<String> = db
            .sessions
            .iter()
            .filter(|s| project_ids.contains(&s.data.project_id))
            .map(|s| s.data.id.clone())
            .collect();

        let mut input = 0u64;
        let mut output = 0u64;
        let mut count = 0u32;
        for m in db.messages.iter().filter(|m| session_ids.contains(&m.session_id)) {
            count += 1;
            if let Some(u) = m.usage {
                input += u.input_tokens as u64;
                output += u.output_tokens as u64;
            }
        }

        Ok(UsageStats {
            projects: project_ids.len() as u32,
            sessions: session_ids.len() as u32,
            messages: count,
            input_tokens: input,
            output_tokens: output,
        })
    }
}

/// 浅合并两个 JSON 对象，`patch` 里的键覆盖 `base`。
fn merge_json(base: Value, patch: Value) -> Value {
    match (base, patch) {
        (Value::Object(mut b), Value::Object(p)) => {
            for (k, v) in p {
                b.insert(k, v);
            }
            Value::Object(b)
        }
        (_, p) => p,
    }
}

// ─────────────────────────── 集成测试 ───────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use tokio::sync::mpsc;

    /// 每个用例用独立的临时目录，避免互相污染 mock-db.json。
    fn backend() -> MockBackend {
        let dir = std::env::temp_dir().join(format!("cc-mock-test-{}", new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        MockBackend::new(dir)
    }

    /// 建好账号 + 项目 + 会话，返回 (token, project_id, session_id)。
    async fn scaffold(b: &MockBackend) -> (String, String, String) {
        let auth = b
            .register(RegisterRequest {
                email: format!("{}@test.dev", new_id()),
                password: "secret123".into(),
                name: "测试用户".into(),
            })
            .await
            .unwrap();

        let project = b
            .create_project(
                &auth.token,
                CreateProjectRequest {
                    kind: ProjectKind::Normal,
                    name: "test-project".into(),
                    path: "/tmp/test-project".into(),
                    description: None,
                    color: None,
                },
            )
            .await
            .unwrap();

        let session = b
            .create_session(
                &auth.token,
                CreateSessionRequest {
                    project_id: project.id.clone(),
                    title: None,
                    model: None,
                },
            )
            .await
            .unwrap();

        (auth.token, project.id, session.id)
    }

    #[tokio::test]
    async fn algorithm_project_kind_is_created_updated_and_persisted() {
        let b = backend();
        let (token, normal_id, _) = scaffold(&b).await;
        assert_eq!(b.get_project(&token, &normal_id).await.unwrap().kind, ProjectKind::Normal);
        let project = b.create_project(&token, CreateProjectRequest {
            kind: ProjectKind::Algorithm, name: "algorithm-workspace".into(),
            path: "D:/algorithms".into(), description: None, color: None,
        }).await.unwrap();
        assert_eq!(project.kind, ProjectKind::Algorithm);
        b.update_project(&token, &normal_id, UpdateProjectRequest {
            kind: Some(ProjectKind::Algorithm), ..Default::default()
        }).await.unwrap();
        let reloaded = MockBackend::new(b.file.parent().unwrap().to_path_buf());
        assert_eq!(reloaded.get_project(&token, &project.id).await.unwrap().kind, ProjectKind::Algorithm);
        assert_eq!(reloaded.get_project(&token, &normal_id).await.unwrap().kind, ProjectKind::Algorithm);
        let mut legacy = serde_json::to_value(&project).unwrap();
        legacy.as_object_mut().unwrap().remove("kind");
        assert_eq!(serde_json::from_value::<Project>(legacy).unwrap().kind, ProjectKind::Normal);
    }

    fn kind_of(e: &StreamEvent) -> &'static str {
        match e {
            StreamEvent::Start { .. } => "start",
            StreamEvent::ThinkingDelta { .. } => "thinking_delta",
            StreamEvent::ThinkingEnd { .. } => "thinking_end",
            StreamEvent::TextDelta { .. } => "text_delta",
            StreamEvent::ToolStart { .. } => "tool_start",
            StreamEvent::ToolEnd { .. } => "tool_end",
            StreamEvent::Done { .. } => "done",
            StreamEvent::Error { .. } => "error",
        }
    }

    /// 演示账号必须在构造时就存在，登录页的「填入演示账号」才有效。
    /// 首次登录还要播种项目、会话、技能与设置。
    #[tokio::test]
    async fn demo_user_can_log_in_and_is_seeded() {
        let b = backend();
        let res = b
            .login(LoginRequest {
                email: DEMO_EMAIL.into(),
                password: "demo1234".into(),
            })
            .await;
        assert!(res.is_ok(), "演示账号登录失败: {res:?}");

        let token = &res.unwrap().token;
        assert!(!b.list_projects(token).await.unwrap().is_empty());
        assert!(!b.list_skills(token).await.unwrap().is_empty());
        assert!(b.get_settings(token).await.is_ok());

        // 错误密码必须被拒绝
        let err = b
            .login(LoginRequest {
                email: DEMO_EMAIL.into(),
                password: "wrong".into(),
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Unauthorized));
    }

    /// 完整走一遍「提问 -> 流式回复 -> 落库」，这是整个应用的主干路径。
    ///
    /// 这里断言的都是 `docs/API.md` §6 里对后端的硬性要求：事件顺序、
    /// 工具调用配对、thinking_end 不能漏。mock 后端不满足的话，
    /// 换成真实后端时前端一样会出问题。
    #[tokio::test]
    async fn send_message_streams_and_persists() {
        let b = backend();
        let (token, project, session) = scaffold(&b).await;

        let (tx, mut rx) = mpsc::unbounded_channel::<StreamEvent>();
        let cancel: CancelFlag = Arc::new(AtomicBool::new(false));

        let final_message = b
            .send_message(
                &token,
                &session,
                SendMessageRequest {
                    content: "这段代码报错了，帮我看看".into(),
                    skills: None,
                    model: None,
                },
                tx,
                cancel,
            )
            .await
            .unwrap();

        let mut events = Vec::new();
        while let Ok(ev) = rx.try_recv() {
            events.push(ev);
        }
        let kinds: Vec<&str> = events.iter().map(kind_of).collect();

        assert_eq!(kinds.first(), Some(&"start"), "第一个事件必须是 start");
        assert_eq!(kinds.last(), Some(&"done"), "最后一个事件必须是 done");
        assert!(!kinds.contains(&"error"), "不应出现 error 事件");
        assert!(kinds.contains(&"text_delta"), "必须有正文增量");

        // 工具调用必须成对且按序，否则前端卡片会一直转
        let tool_ids = |want_start: bool| -> Vec<String> {
            events
                .iter()
                .filter_map(|e| match e {
                    StreamEvent::ToolStart { tool_id, .. } if want_start => {
                        Some(tool_id.clone())
                    }
                    StreamEvent::ToolEnd { tool_id, .. } if !want_start => {
                        Some(tool_id.clone())
                    }
                    _ => None,
                })
                .collect()
        };
        assert_eq!(tool_ids(true), tool_ids(false), "tool_start/tool_end 必须按序配对");

        // 漏掉 thinking_end 会让前端思考块永远展开
        if kinds.contains(&"thinking_delta") {
            assert!(kinds.contains(&"thinking_end"), "有 delta 就必须有 end");
        }

        assert_eq!(final_message.role, Role::Assistant);
        assert_eq!(final_message.status, MessageStatus::Done);
        assert!(!final_message.blocks.is_empty());
        assert!(final_message.usage.is_some());

        // 历史消息 = 用户 + 助手，且块结构与流式累积结果一致
        let history = b.list_messages(&token, &session).await.unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].role, Role::User);
        assert_eq!(history[1].role, Role::Assistant);
        assert_eq!(history[1].blocks.len(), final_message.blocks.len());

        // 会话回到 idle，且首条提问被用作标题
        let sessions = b.list_sessions(&token, Some(&project)).await.unwrap();
        assert_eq!(sessions[0].status, SessionStatus::Idle);
        assert_ne!(sessions[0].title, "新会话");
    }

    /// 取消标志置位后，流必须停下来并把消息落成 cancelled。
    #[tokio::test]
    async fn cancel_stops_the_stream() {
        let b = backend();
        let (token, _project, session) = scaffold(&b).await;

        let (tx, mut rx) = mpsc::unbounded_channel::<StreamEvent>();
        let cancel: CancelFlag = Arc::new(AtomicBool::new(false));

        // 收到第一个事件后立刻取消
        let flag = Arc::clone(&cancel);
        let watcher = tokio::spawn(async move {
            let _ = rx.recv().await;
            flag.store(true, Ordering::Relaxed);
        });

        let msg = b
            .send_message(
                &token,
                &session,
                SendMessageRequest {
                    content: "帮我重构这个模块并解释原理".into(),
                    skills: None,
                    model: None,
                },
                tx,
                cancel,
            )
            .await
            .unwrap();

        watcher.await.unwrap();
        assert_eq!(msg.status, MessageStatus::Cancelled);
    }

    /// 删除项目必须级联删掉会话；设置更新必须是浅合并。
    #[tokio::test]
    async fn project_cascade_and_settings_merge() {
        let b = backend();
        let (token, project, _session) = scaffold(&b).await;

        let updated = b
            .update_settings(&token, serde_json::json!({ "theme": "light", "fontSize": 16 }))
            .await
            .unwrap();
        assert_eq!(updated.theme, Theme::Light);
        assert_eq!(updated.font_size, 16);
        assert_eq!(updated.model, UserSettings::default().model);

        b.delete_project(&token, &project).await.unwrap();
        // 注册时 seed_if_needed 还建了两个演示项目，所以只断言目标项目消失
        assert!(!b
            .list_projects(&token)
            .await
            .unwrap()
            .iter()
            .any(|p| p.id == project));
        assert!(b
            .list_sessions(&token, Some(&project))
            .await
            .unwrap()
            .is_empty());
    }

    /// 无效 token 在任何接口上都必须是 Unauthorized，不能 panic。
    #[tokio::test]
    async fn invalid_token_is_rejected() {
        let b = backend();
        let bogus = "mock_not-a-real-token";
        assert!(matches!(
            b.list_projects(bogus).await.unwrap_err(),
            AppError::Unauthorized
        ));
        assert!(matches!(
            b.get_settings(bogus).await.unwrap_err(),
            AppError::Unauthorized
        ));
        assert!(matches!(
            b.list_skills(bogus).await.unwrap_err(),
            AppError::Unauthorized
        ));
    }
}
