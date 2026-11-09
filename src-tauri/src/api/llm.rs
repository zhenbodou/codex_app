//! 模拟大模型的流式输出。
//!
//! 真实后端是 SSE 推流，这里用同样的事件结构在本地生成，
//! 让应用在没有服务器的情况下也能演示完整的对话体验。
//!
//! 生成逻辑：根据提问里的关键词挑一个「剧本」，剧本由若干 [`SimStep`] 组成
//! （思考 / 工具调用 / 正文），再由 [`run`] 按 token 粒度推流出去。

use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::sync::mpsc;

use crate::models::{ContentBlock, StreamEvent, ToolStatus, Usage};

/// 极小的 xorshift64* 伪随机源。
///
/// 这里只需要「让输出节奏看起来自然」的抖动，不需要密码学强度，
/// 所以自己写 20 行比引入 rand 更省事，也避开各版本 API 改名的问题。
struct Rng(u64);

impl Rng {
    fn new() -> Self {
        let seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() ^ (d.subsec_nanos() as u64) << 16)
            .unwrap_or(0x9E37_79B9_7F4A_7C15);
        Rng(seed | 1)
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// 返回 `[0, n)` 区间内的值。n 为 0 时返回 0。
    fn below(&mut self, n: u64) -> u64 {
        if n == 0 {
            0
        } else {
            self.next_u64() % n
        }
    }
}

pub enum SimStep {
    Think(String),
    Tool {
        name: String,
        input: Value,
        result: String,
        delay_ms: u64,
    },
    Text(String),
}

/// 一次模拟回复的产物：既能推流给前端，也能落库成完整消息。
pub struct SimOutcome {
    pub blocks: Vec<ContentBlock>,
    pub usage: Usage,
    /// 被用户中途停止。
    pub cancelled: bool,
}

fn has(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| haystack.contains(n))
}

/// 根据提问内容生成回复剧本。
pub fn plan(question: &str, skills: &[String]) -> Vec<SimStep> {
    let q = question.to_lowercase();
    let topic = topic_of(question);
    let skill_note = if skills.is_empty() {
        String::new()
    } else {
        format!("\n用户挂载了技能：{}，回复里要体现它们的产出。", skills.join("、"))
    };

    let think = |s: &str| {
        SimStep::Think(format!(
            "用户在问「{topic}」。{s}{skill_note}\n\n先确认代码库的实际状态，不要凭记忆回答。"
        ))
    };

    if has(&q, &["bug", "报错", "error", "错误", "异常", "失败", "crash", "panic", "fail", "不了", "无法"])
    {
        return vec![
            think("看起来是运行期故障，我需要先复现并定位到具体行。"),
            SimStep::Tool {
                name: "Grep".into(),
                input: json!({ "pattern": "unwrap\\(\\)|expect\\(", "path": "src/", "output_mode": "content", "-n": true }),
                result: "src/state.rs:42:    let guard = self.inner.lock().unwrap();\nsrc/api/remote.rs:88:    let body = resp.json::<Value>().await.unwrap();\nsrc/commands.rs:15:    .expect(\"error while running tauri application\");\n\n3 matches across 3 files".into(),
                delay_ms: 620,
            },
            SimStep::Tool {
                name: "Read".into(),
                input: json!({ "file_path": "src/api/remote.rs", "offset": 78, "limit": 22 }),
                result: r#"    78 │ async fn request<T: DeserializeOwned>(&self, path: &str) -> Result<T, AppError> {
    79 │     let url = format!("{}{}", self.base_url.read().await, path);
    80 │     let resp = self.http.get(&url).send().await.map_err(net_err)?;
    81 │
    82 │     if !resp.status().is_success() {
    83 │         let code = resp.status().as_u16();
    84 │         let text = resp.text().await.unwrap_or_default();
    85 │         return Err(map_http(code, &text));
    86 │     }
    87 │
    88 │     let body = resp.json::<Value>().await.unwrap();
    89 │     serde_json::from_value(body).map_err(|e| AppError::Internal(e.to_string()))
    90 │ }"#.into(),
                delay_ms: 480,
            },
            SimStep::Text(
                r#"找到了。问题出在 `src/api/remote.rs:88` —— 这里对响应体调了 `.unwrap()`。

## 根因

后端返回 **非 JSON** 内容时（比如网关 502 的 HTML 错误页、或者空 body），`resp.json()` 会返回 `Err`，`.unwrap()` 直接 panic。因为 panic 发生在 Tauri 的异步任务里，前端只会看到一个永远不 resolve 的 Promise，表现就是「界面卡住，没有任何报错」。

这是典型的**错误被吞掉**：panic 没有跨 IPC 边界传回来。

## 修复

把 `unwrap` 换成带上下文的错误映射：

```rust
let body = resp.json::<Value>().await.map_err(|e| {
    AppError::Internal(format!("响应不是合法 JSON ({}): {}", path, e))
})?;
```

顺手把上面第 82 行的分支也补上 body 内容，方便排查：

```rust
if !resp.status().is_success() {
    let code = resp.status().as_u16();
    let text = resp.text().await.unwrap_or_default();
    tracing::warn!(code, path, body = %text, "backend error");
    return Err(map_http(code, &text));
}
```

## 建议加的防线

| 位置 | 措施 |
|---|---|
| `request<T>` | 所有 `unwrap` 改 `map_err` |
| command 层 | 用 `catch_unwind` 或 `JoinHandle` 的 `Err` 分支兜住 panic |
| 前端 | `invoke` 加超时，避免 Promise 永久悬挂 |

要我把这三处一起改掉吗？"#
                .into(),
            ),
        ];
    }

    if has(&q, &["测试", "test", "单测", "覆盖率", "coverage", "spec"]) {
        return vec![
            think("用户想要测试。先看现有测试结构，再补关键路径。"),
            SimStep::Tool {
                name: "Bash".into(),
                input: json!({ "command": "npm test -- --run", "description": "运行现有测试套件" }),
                result: " Test Files  2 passed (2)\n      Tests  14 passed (14)\n   Start at  10:24:31\n  Duration  1.82s\n\n------------------|---------|----------|---------\nFile              | % Stmts | % Branch | % Funcs\n------------------|---------|----------|---------\nAll files         |   38.21 |    22.14 |   31.05\n store/auth.ts    |   71.42 |    50.00 |   66.66\n store/session.ts |   18.03 |     8.33 |   12.50\n------------------|---------|----------|---------".into(),
                delay_ms: 1400,
            },
            SimStep::Tool {
                name: "Write".into(),
                input: json!({ "file_path": "src/store/__tests__/session.test.ts", "content": "import { describe, it, expect, vi } from 'vitest'\nimport { useSessionStore } from '../session'\n\nvi.mock('@tauri-apps/api/core', () => ({\n  invoke: vi.fn(async (cmd: string) => {\n    if (cmd === 'list_sessions') return [mockSession()]\n    throw new Error(`unexpected ${cmd}`)\n  }),\n}))\n\ndescribe('session store', () => {\n  it('loads sessions for the active project', async () => {\n    await useSessionStore.getState().load('p1')\n    expect(useSessionStore.getState().items).toHaveLength(1)\n  })\n\n  it('appends streaming deltas to the tail message', () => {\n    const s = useSessionStore.getState()\n    s.beginAssistant('m1')\n    s.appendText('m1', 'hello')\n    s.appendText('m1', ' world')\n    expect(s.tailText('m1')).toBe('hello world')\n  })\n})" }),
                result: "Successfully wrote to src/store/__tests__/session.test.ts (+24 lines)".into(),
                delay_ms: 520,
            },
            SimStep::Tool {
                name: "Bash".into(),
                input: json!({ "command": "npm test -- --run src/store", "description": "验证新增测试" }),
                result: " ✓ src/store/__tests__/session.test.ts (2 tests) 41ms\n\n Test Files  1 passed (1)\n      Tests  2 passed (2)\n   Duration  0.94s".into(),
                delay_ms: 1100,
            },
            SimStep::Text(
                r#"补了两个测试，都过了。

## 做了什么

`src/store/__tests__/session.test.ts` 覆盖了两条最容易回归的路径：

1. **加载会话列表** —— mock 掉 `@tauri-apps/api/core` 的 `invoke`，验证 store 正确写入 `items`。这里刻意让 mock 对未知 command 抛错，这样命令名写错时测试会立刻失败，而不是静默通过。
2. **流式增量拼接** —— 这是聊天界面最容易出 bug 的地方（delta 顺序错乱、拼到错误的消息上），直接对 store 做单元测试，不用渲染组件，跑得快。

## 覆盖率从 38% 到多少

`session.ts` 之前只有 18%，加完这两个 case 大概能到 45% 左右。想继续拉高的话，优先级建议：

- `store/auth.ts`（71%）→ 补 token 过期和 401 自动登出
- `lib/stream.ts` → 补 `tool_start` / `tool_end` 事件的状态机转换
- 组件层用 `@testing-library/react` 补 MessageList 的快照

要我接着补哪一块？"#
                    .to_string(),
            ),
        ];
    }

    if has(&q, &["重构", "优化", "refactor", "性能", "慢", "performance", "简化", "卡顿", "内存"]) {
        return vec![
            think("先量再改。没有 baseline 的优化都是猜。"),
            SimStep::Tool {
                name: "Bash".into(),
                input: json!({ "command": "cargo bench --bench render 2>&1 | tail -20", "description": "跑基准测试拿 baseline" }),
                result: "rendering/1k_messages\n                        time:   [42.183 ms 42.906 ms 43.712 ms]\n                        change: [+0.1234% +0.4521% +0.7845%] (p = 0.31 > 0.05)\nrendering/10k_messages\n                        time:   [1.2843 s 1.3021 s 1.3198 s]\n                        change: [+18.234% +19.102% +20.014%] (p = 0.00 < 0.05)\n                        Performance has regressed.".into(),
                delay_ms: 2100,
            },
            SimStep::Tool {
                name: "Read".into(),
                input: json!({ "file_path": "src/components/MessageList.tsx" }),
                result: r#"    18 │ export function MessageList({ messages }: Props) {
    19 │   return (
    20 │     <div className="flex flex-col gap-4">
    21 │       {messages.map((m) => (
    22 │         <MessageItem key={m.id} message={m} />
    23 │       ))}
    24 │     </div>
    25 │   )
    26 │ }"#.into(),
                delay_ms: 430,
            },
            SimStep::Tool {
                name: "Edit".into(),
                input: json!({
                    "file_path": "src/components/MessageList.tsx",
                    "old_string": "export function MessageList({ messages }: Props) {\n  return (\n    <div className=\"flex flex-col gap-4\">\n      {messages.map((m) => (\n        <MessageItem key={m.id} message={m} />\n      ))}\n    </div>\n  )\n}",
                    "new_string": "const Row = memo(function Row({ message }: { message: Message }) {\n  return <MessageItem message={message} />\n})\n\nexport function MessageList({ messages }: Props) {\n  return (\n    <Virtuoso\n      data={messages}\n      itemContent={(_, m) => <Row key={m.id} message={m} />}\n      followOutput=\"smooth\"\n      initialTopMostItemIndex={messages.length - 1}\n    />\n  )\n}"
                }),
                result: "Successfully replaced 1 occurrence(s) in src/components/MessageList.tsx".into(),
                delay_ms: 560,
            },
            SimStep::Tool {
                name: "Bash".into(),
                input: json!({ "command": "cargo bench --bench render 2>&1 | tail -8", "description": "复测确认改进" }),
                result: "rendering/10k_messages\n                        time:   [86.412 ms 87.003 ms 87.641 ms]\n                        change: [-93.412% -93.318% -93.201%] (p = 0.00 < 0.05)\n                        Performance has improved.".into(),
                delay_ms: 1900,
            },
            SimStep::Text(
                r#"10k 消息的渲染从 **1.30s 降到 87ms**，提升约 15 倍。

## 瓶颈在哪

原来的 `MessageList` 有两个叠加问题：

1. **全量渲染** —— 一万条消息就是一万个 DOM 节点。Markdown 渲染本身很重（`react-markdown` 要走 unified 的解析管线），一次性渲染直接卡死主线程。
2. **没有 memo** —— 流式输出时每来一个 delta，父组件 re-render，所有 `MessageItem` 跟着重跑。只有最后一条在变，前面 9999 条纯属浪费。

## 改法

- 换 **虚拟滚动**（`react-virtuoso`），只渲染视口内约 20 条。`followOutput="smooth"` 保证流式输出时自动跟随滚动。
- `Row` 包 `memo`，配合消息对象引用不变（store 里用 immer 做结构共享），未变化的行直接跳过。

## 一个坑

`Virtuoso` 的 `itemContent` 回调里**不要**再包一层匿名组件，那样每次 render 都是新的组件类型，memo 直接失效。上面的写法把 `Row` 提到模块顶层就是这个原因。

要不要我把 `followOutput` 换成「用户往上滚就停止跟随」的逻辑？现在这样在回看历史消息时会被强行拽回底部。"#
                    .to_string(),
            ),
        ];
    }

    if has(&q, &["什么是", "解释", "原理", "怎么", "如何", "为什么", "what is", "explain", "why", "how", "区别", "讲讲", "介绍"])
    {
        return vec![
            think("这是概念性问题，不需要读代码，直接讲清楚原理和取舍。"),
            SimStep::Text(format!(
                r#"## {topic}

先把结论放前面，再展开原理。

### 一句话版本

它本质上是一层**契约**：调用方不关心实现细节，只关心「我给你什么，你还我什么」。所有复杂度都被压到了边界上。

### 拆开看

**1. 为什么需要它**

如果两侧直接耦合，任何一边的改动都会传导到另一边。中间加一层稳定接口后，两边可以独立演化 —— 这是可维护性的来源，不是过度设计。

**2. 运行时发生了什么**

```
调用方                     实现方
  │                          │
  ├─ 序列化参数 ─────────────▶│
  │                          ├─ 校验 / 反序列化
  │                          ├─ 执行业务逻辑
  │◀───────── 序列化返回值 ──┤
  ├─ 反序列化                 │
  └─ 拿到结果                 └─
```

关键点是**边界上必须序列化**。这意味着：
- 传大对象有成本（CPU + 内存），不是免费的
- 类型信息在边界处丢失，靠 schema 约束
- 错误必须能被序列化，否则传不回来

**3. 常见取舍**

| 方案 | 优点 | 代价 |
|---|---|---|
| 直接函数调用 | 零开销、类型安全 | 强耦合、不能跨进程 |
| 消息传递 | 解耦、可跨进程/网络 | 序列化开销、异步复杂度 |
| 共享内存 | 零拷贝、极快 | 要自己处理同步，容易数据竞争 |

### 什么时候不该用

- 两侧永远不会独立演化 → 直接调用，别加抽象
- 数据量大且高频 → 序列化会成为瓶颈，考虑共享内存或批处理
- 只有一个实现，且短期内不会有第二个 → 接口是纯负担

> 三个相似的实现好过一个提前设计的抽象。

想更深入的话，告诉我你具体的使用场景，我可以针对性地给方案。"#
            )),
        ];
    }

    if has(&q, &["写", "实现", "创建", "帮我", "生成", "加个", "做一个", "add", "implement", "create", "build", "make", "feature"])
    {
        return vec![
            think("需要新增功能。先摸清现有结构，避免和已有约定冲突。"),
            SimStep::Tool {
                name: "Glob".into(),
                input: json!({ "pattern": "src/**/*.{ts,tsx}" }),
                result: "src/main.tsx\nsrc/App.tsx\nsrc/lib/api.ts\nsrc/lib/cn.ts\nsrc/store/auth.ts\nsrc/store/projects.ts\nsrc/store/sessions.ts\nsrc/store/settings.ts\nsrc/components/Sidebar.tsx\nsrc/components/ChatView.tsx\nsrc/components/MessageList.tsx\nsrc/components/Composer.tsx\nsrc/views/Login.tsx\nsrc/views/Settings.tsx\n\n14 files".into(),
                delay_ms: 380,
            },
            SimStep::Tool {
                name: "Read".into(),
                input: json!({ "file_path": "src/lib/api.ts" }),
                result: r#"     8 │ export async function invoke<T>(cmd: string, args?: Record<string, unknown>) {
     9 │   try {
    10 │     return await tauriInvoke<T>(cmd, args)
    11 │   } catch (e) {
    12 │     throw normalizeError(e)
    13 │   }
    14 │ }"#.into(),
                delay_ms: 350,
            },
            SimStep::Tool {
                name: "Write".into(),
                input: json!({
                    "file_path": "src/lib/invoke.ts",
                    "content": "import { invoke as tauriInvoke } from '@tauri-apps/api/core'\n\nexport class ApiError extends Error {\n  constructor(\n    public kind: string,\n    message: string,\n  ) {\n    super(message)\n    this.name = 'ApiError'\n  }\n}\n\nfunction normalize(e: unknown): ApiError {\n  if (typeof e === 'string') return new ApiError('internal', e)\n  if (e && typeof e === 'object' && 'kind' in e && 'message' in e) {\n    const o = e as { kind: string; message: string }\n    return new ApiError(o.kind, o.message)\n  }\n  return new ApiError('internal', String(e))\n}\n\n/** 带超时和统一错误包装的 invoke。 */\nexport async function call<T>(\n  cmd: string,\n  args?: Record<string, unknown>,\n  timeoutMs = 30_000,\n): Promise<T> {\n  try {\n    return await Promise.race([\n      tauriInvoke<T>(cmd, args),\n      new Promise<never>((_, rej) =>\n        setTimeout(() => rej(new ApiError('timeout', `${cmd} 超时`)), timeoutMs),\n      ),\n    ])\n  } catch (e) {\n    throw normalize(e)\n  }\n}"
                }),
                result: "Successfully wrote to src/lib/invoke.ts (+38 lines)".into(),
                delay_ms: 640,
            },
            SimStep::Tool {
                name: "Bash".into(),
                input: json!({ "command": "npx tsc --noEmit", "description": "类型检查" }),
                result: "(no output — 0 errors)".into(),
                delay_ms: 2600,
            },
            SimStep::Text(
                r#"实现好了，类型检查通过。

## 新增文件

**`src/lib/invoke.ts`** —— 统一的 IPC 调用封装，解决三个实际问题：

1. **错误类型归一化**：Tauri 抛出的错误可能是 string、也可能是我们定义的 `{ kind, message }` 对象。`normalize` 把它们统一成 `ApiError`，上层可以直接 `instanceof` 判断和读 `kind`。
2. **超时兜底**：如果 Rust 侧 panic 了，`invoke` 返回的 Promise **永远不会 resolve**（这是 Tauri 的已知行为）。不加超时的话界面就永久卡在 loading。默认 30s，可以按命令覆盖。
3. **可测试**：mock 掉这一个模块就能测所有 store，不用每个测试文件重复 mock `@tauri-apps/api/core`。

## 用法

```ts
import { call, ApiError } from '@/lib/invoke'

try {
  const sessions = await call<Session[]>('list_sessions', { projectId })
} catch (e) {
  if (e instanceof ApiError && e.kind === 'unauthorized') {
    useAuthStore.getState().logout()
    return
  }
  toast.error(e.message)
}
```

## 下一步

现在还有 14 个文件在直接用裸 `invoke`。要我全部替换过来吗？替换是纯机械操作，但 `send_message` 那个是长连接，超时要设成 `Infinity`，我会单独处理。"#
                    .to_string(),
            ),
        ];
    }

    // 默认剧本
    vec![
        think("先看一下相关代码，再给出有针对性的答复。"),
        SimStep::Tool {
            name: "Read".into(),
            input: json!({ "file_path": "src/App.tsx" }),
            result: r#"    1 │ import { useEffect } from 'react'
    2 │ import { useAuthStore } from '@/store/auth'
    3 │ import { Login } from '@/views/Login'
    4 │ import { Shell } from '@/views/Shell'
    5 │
    6 │ export default function App() {
    7 │   const { user, restore } = useAuthStore()
    8 │   useEffect(() => { void restore() }, [])
    9 │   if (!user) return <Login />
   10 │   return <Shell />
   11 │ }"#.into(),
            delay_ms: 420,
        },
        SimStep::Text(format!(
            r#"我看了一下当前代码，针对「{topic}」说说我的判断。

## 现状

`src/App.tsx` 的结构很干净：认证态决定渲染 `Login` 还是 `Shell`，`restore()` 在挂载时尝试恢复上次的登录会话。这个模式没问题，可以直接在上面扩展。

## 建议

**1. 先明确边界**

这个需求会影响哪几层？按现在的分层：

- `store/` —— 状态和 IPC 调用，纯逻辑，最好测
- `components/` —— 展示，不直接调 `invoke`
- `views/` —— 页面级组合

保持「组件不碰 IPC」这条线，后面加功能不会乱。

**2. 数据流向**

```
用户操作 → store action → invoke(Rust command) → 后端
                                     ↓
界面更新 ← store 状态变更 ←───── 返回/事件
```

流式数据走的是 event 通道而不是 command 返回值，这两条路要分清：
- **command**：请求-响应，适合 CRUD
- **event**：服务端主动推，适合流式和长任务

**3. 需要注意的点**

| 风险 | 应对 |
|---|---|
| Rust 侧 panic 导致 Promise 悬挂 | `invoke` 包一层超时 |
| 事件监听器泄漏 | `useEffect` 返回清理函数 |
| 并发修改同一状态 | Rust 侧用 `Mutex`，前端 store 单一入口 |

想让我直接动手实现吗？告诉我具体要什么效果，我可以先写 store 再写 UI。"#
        )),
    ]
}

fn topic_of(q: &str) -> String {
    let t: String = q.chars().take(36).collect();
    if q.chars().count() > 36 {
        format!("{t}…")
    } else {
        t
    }
}

/// 按剧本推流，返回可落库的内容块和 token 用量。
pub async fn run(
    steps: Vec<SimStep>,
    message_id: &str,
    model: &str,
    speed: u32,
    tx: &mpsc::UnboundedSender<StreamEvent>,
    cancel: &AtomicBool,
) -> SimOutcome {
    let _ = model;
    let mut blocks: Vec<ContentBlock> = Vec::new();
    let mut output_chars = 0usize;
    let mut tool_index = 0u32;
    let mut rng = Rng::new();

    for step in steps {
        if cancel.load(Ordering::Relaxed) {
            return finish(blocks, output_chars, true, &mut rng);
        }

        match step {
            SimStep::Think(text) => {
                output_chars += text.chars().count();
                let started = std::time::Instant::now();
                let mut streamed = false;
                for piece in chunk(&text, speed, &mut rng) {
                    if cancel.load(Ordering::Relaxed) {
                        blocks.push(ContentBlock::Thinking {
                            thinking: text.clone(),
                            duration_ms: started.elapsed().as_millis() as u64,
                        });
                        return finish(blocks, output_chars, true, &mut rng);
                    }
                    streamed = true;
                    if tx
                        .send(StreamEvent::ThinkingDelta {
                            message_id: message_id.to_string(),
                            text: piece,
                        })
                        .is_err()
                    {
                        break;
                    }
                    sleep_jittered(&mut rng, 10).await;
                }
                let duration_ms = started.elapsed().as_millis() as u64;
                if streamed {
                    let _ = tx.send(StreamEvent::ThinkingEnd {
                        message_id: message_id.to_string(),
                        duration_ms,
                    });
                }
                blocks.push(ContentBlock::Thinking {
                    thinking: text,
                    duration_ms,
                });
            }

            SimStep::Tool {
                name,
                input,
                result,
                delay_ms,
            } => {
                let tool_id = format!("toolu_{}", &crate::models::new_id()[..16]);
                let _ = tx.send(StreamEvent::ToolStart {
                    message_id: message_id.to_string(),
                    index: tool_index,
                    tool_id: tool_id.clone(),
                    name: name.clone(),
                    input: input.clone(),
                });

                // 工具执行期间也要能取消
                let waited = tokio::time::sleep(Duration::from_millis(delay_ms));
                tokio::pin!(waited);
                loop {
                    tokio::select! {
                        _ = &mut waited => break,
                        _ = tokio::time::sleep(Duration::from_millis(60)) => {
                            if cancel.load(Ordering::Relaxed) {
                                blocks.push(ContentBlock::ToolUse {
                                    id: tool_id,
                                    name,
                                    input,
                                    status: ToolStatus::Error,
                                    result: Some("已取消".into()),
                                    duration_ms: 0,
                                });
                                return finish(blocks, output_chars, true, &mut rng);
                            }
                        }
                    }
                }

                output_chars += result.chars().count();
                let _ = tx.send(StreamEvent::ToolEnd {
                    message_id: message_id.to_string(),
                    index: tool_index,
                    tool_id: tool_id.clone(),
                    status: ToolStatus::Success,
                    result: result.clone(),
                    duration_ms: delay_ms,
                });
                blocks.push(ContentBlock::ToolUse {
                    id: tool_id,
                    name,
                    input,
                    status: ToolStatus::Success,
                    result: Some(result),
                    duration_ms: delay_ms,
                });
                tool_index += 1;
            }

            SimStep::Text(text) => {
                output_chars += text.chars().count();
                for piece in chunk(&text, speed, &mut rng) {
                    if cancel.load(Ordering::Relaxed) {
                        blocks.push(ContentBlock::Text { text });
                        return finish(blocks, output_chars, true, &mut rng);
                    }
                    if tx
                        .send(StreamEvent::TextDelta {
                            message_id: message_id.to_string(),
                            text: piece,
                        })
                        .is_err()
                    {
                        break;
                    }
                    sleep_jittered(&mut rng, 16).await;
                }
                blocks.push(ContentBlock::Text { text });
            }
        }
    }

    finish(blocks, output_chars, false, &mut rng)
}

fn finish(
    blocks: Vec<ContentBlock>,
    output_chars: usize,
    cancelled: bool,
    rng: &mut Rng,
) -> SimOutcome {
    SimOutcome {
        blocks,
        cancelled,
        usage: Usage {
            input_tokens: (1200 + rng.below(800)) as u32,
            output_tokens: (output_chars as u32) / 3,
            cache_read_tokens: rng.below(4000) as u32,
        },
    }
}

/// 把文本切成流式增量。中英混排时按字符切，视觉上接近真实模型的输出节奏。
fn chunk(s: &str, speed: u32, rng: &mut Rng) -> Vec<String> {
    let chars: Vec<char> = s.chars().collect();
    let base = speed.max(1) as usize;
    let mut out = Vec::with_capacity(chars.len() / base + 1);
    let mut i = 0;
    while i < chars.len() {
        let n = (base + rng.below(2) as usize).min(chars.len() - i);
        out.push(chars[i..i + n].iter().collect());
        i += n;
    }
    out
}

async fn sleep_jittered(rng: &mut Rng, base_ms: u64) {
    tokio::time::sleep(Duration::from_millis(base_ms + rng.below(8))).await;
}
