# 后端接口文档

Megvii Code Desktop（Tauri + React）所需的后端服务约定。

桌面端通过 Rust 侧的 `ApiClient` 抽象访问后端，有两个实现：

| 实现 | 用途 | 数据位置 |
|---|---|---|
| `MockBackend` | 无服务器时的本地模拟，回复由内置脚本生成 | 应用数据目录的 `mock-db.json` |
| `RemoteBackend` | 对接真实服务，即本文档描述的接口 | 远端 |

在「设置 → 后端」里可以随时切换。**本文档描述的就是 `RemoteBackend` 实际发出的请求**，两者严格一一对应，实现后端时可以直接照着写。

---

## 1. 通用约定

### 1.1 基础信息

- **Base URL**：可配置，默认 `https://api.example.com/v1`。下文所有路径都相对于它。
- **编码**：请求与响应一律 `application/json; charset=utf-8`（流式接口除外，见 §3.2）。
- **字段命名**：JSON 全部使用 **camelCase**。Rust 侧结构体是 snake_case，靠 `#[serde(rename_all = "camelCase")]` 转换，所以 `createdAt` 对应 Rust 的 `created_at`。
- **时间格式**：ISO 8601 带时区，例如 `2026-10-22T08:30:00.123456Z`。
- **ID**：字符串。参考实现用 UUID v4 的 simple 形式（32 位十六进制，无连字符），但后端可以用任何全局唯一字符串。

### 1.2 鉴权

除 `/auth/login` 和 `/auth/register` 外，所有接口都需要 Bearer Token：

```http
Authorization: Bearer <token>
```

Token 由登录/注册接口签发，有效期 30 天。过期或无效时返回 **401**，客户端会自动清除本地凭证并跳回登录页。

### 1.3 错误格式

非 2xx 响应的 body 必须是：

```json
{
  "kind": "not_found",
  "message": "会话 abc123 不存在"
}
```

`kind` 取值：

| kind | 语义 | 建议 HTTP 状态码 |
|---|---|---|
| `unauthorized` | 未登录 / token 失效 | 401, 403 |
| `not_found` | 资源不存在 | 404 |
| `bad_request` | 参数校验失败 | 400, 422 |
| `conflict` | 资源冲突（如邮箱已注册） | 409 |
| `network` | 客户端侧网络错误，服务端不会返回 | — |
| `internal` | 服务端内部错误 | 500 |

> **实现提示**：客户端的 `map_http` 主要按 **HTTP 状态码** 分类，`message` 字段直接展示给用户。所以状态码必须准确，`message` 建议写成用户能看懂的中文。若 body 不是合法 JSON，客户端会把整个 body 当作 message 展示。

### 1.4 分页

当前版本不分页 —— 项目/会话/消息量级都在本地可接受范围内。后续需要时约定用游标分页：

```
GET /sessions?projectId=xxx&limit=50&cursor=<opaque>
→ { "items": [...], "nextCursor": "..." | null }
```

---

## 2. 接口清单

| # | 方法 | 路径 | 说明 |
|---|---|---|---|
| 1 | POST | `/auth/login` | 登录 |
| 2 | POST | `/auth/register` | 注册 |
| 3 | POST | `/auth/logout` | 登出 |
| 4 | GET | `/auth/me` | 获取当前用户 |
| 5 | PATCH | `/auth/me` | 更新资料 |
| 6 | POST | `/auth/password` | 修改密码 |
| 7 | GET | `/projects` | 项目列表 |
| 8 | POST | `/projects` | 创建项目 |
| 9 | GET | `/projects/{id}` | 项目详情 |
| 10 | PATCH | `/projects/{id}` | 更新项目 |
| 11 | DELETE | `/projects/{id}` | 删除项目 |
| 12 | GET | `/sessions?projectId=` | 会话列表 |
| 13 | POST | `/sessions` | 创建会话 |
| 14 | GET | `/sessions/{id}` | 会话详情（保留，客户端暂未调用） |
| 15 | PATCH | `/sessions/{id}` | 重命名会话 |
| 16 | DELETE | `/sessions/{id}` | 删除会话 |
| 17 | GET | `/sessions/{id}/messages` | 消息历史 |
| 18 | POST | `/sessions/{id}/messages` | **发送消息（SSE 流式）** |
| 19 | POST | `/sessions/{id}/cancel` | 中断生成 |
| 20 | GET | `/skills` | 技能列表 |
| 21 | PATCH | `/skills/{id}` | 启用/禁用技能 |
| 22 | GET | `/settings` | 获取用户设置 |
| 23 | PATCH | `/settings` | 更新用户设置 |
| 24 | GET | `/models` | 可用模型列表 |
| 25 | GET | `/stats` | 用量统计 |

---

## 3. 鉴权

### 3.1 POST `/auth/login`

**请求**

```json
{ "email": "demo@claude.dev", "password": "demo1234" }
```

**响应 `200`**

```json
{
  "token": "eyJhbGciOi...",
  "expiresAt": "2026-11-21T08:30:00Z",
  "user": {
    "id": "9f1c2a...",
    "email": "demo@claude.dev",
    "name": "演示用户",
    "avatarUrl": null,
    "plan": "max",
    "createdAt": "2026-10-01T02:11:00Z"
  }
}
```

**错误**

| 状态码 | 场景 |
|---|---|
| 401 | 邮箱或密码错误（不要区分是哪一个，避免账号枚举） |
| 400 | 邮箱格式不正确 |

> `plan` 取值：`free` / `pro` / `max` / `team`。
> `avatarUrl` 可为 `null`；客户端在没有头像时用昵称首字母生成占位。

### 3.2 POST `/auth/register`

**请求**

```json
{ "email": "you@example.com", "password": "secret123", "name": "你的名字" }
```

**响应 `200`**：同 `/auth/login`（注册后直接登录）。

**错误**

| 状态码 | 场景 |
|---|---|
| 409 | 邮箱已被注册 |
| 400 | 密码少于 6 位 / 邮箱格式不正确 / 昵称为空 |

> 注册成功后，后端应当为新用户初始化：默认设置（见 §7）、内置技能列表（见 §6）。客户端不会额外调用初始化接口。

### 3.3 POST `/auth/logout`

**请求头**：`Authorization: Bearer <token>`，无 body。

**响应 `204`**（无 body）。

> 服务端应当使该 token 失效。客户端即使收到错误也会清除本地凭证，所以这个接口失败不影响用户体验。

### 3.4 GET `/auth/me`

**响应 `200`**：`User` 对象（同 §3.1 的 `user` 字段）。

**用途**：应用启动时用本地保存的 token 换取用户信息。返回 401 表示 token 已失效，客户端会静默清除凭证并回到登录页 —— 这是正常的会话过期流程，不应当作错误弹窗。

### 3.5 PATCH `/auth/me`

**请求**（所有字段可选，只传要改的）

```json
{ "name": "新昵称", "email": "new@example.com", "avatarUrl": "https://..." }
```

**响应 `200`**：更新后的完整 `User` 对象。

**错误**：400（邮箱格式错）、409（邮箱被占用）。

### 3.6 POST `/auth/password`

**请求**

```json
{ "oldPassword": "demo1234", "newPassword": "newsecret" }
```

**响应 `204`**。

**错误**

| 状态码 | 场景 |
|---|---|
| 401 | 原密码错误 |
| 400 | 新密码少于 6 位 |

> 改密后建议使该用户的其他 token 失效，但**保留当前 token**，否则客户端会被踢出登录。

---

## 4. 项目

### `Project` 对象

```json
{
  "id": "proj_01",
  "kind": "normal",
  "name": "claude-code-desktop",
  "path": "D:\\code\\tauri\\claude-code-desktop",
  "description": "Tauri + React 实现的桌面版 AI 编码助手",
  "color": "#D97757",
  "createdAt": "2026-10-16T03:00:00Z",
  "updatedAt": "2026-10-22T07:12:00Z",
  "sessionCount": 3
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `kind` | `normal` \| `algorithm` | 目录类型，省略时默认为 `normal`；需持久化并在项目列表、详情及创建/更新响应中返回 |
| `path` | string | 本地目录绝对路径。**服务端只做存储，不需要能访问它** —— 文件操作发生在用户机器上 |
| `description` | string \| null | 可选 |
| `color` | string | 侧边栏标记色，`#RRGGBB`。客户端调色板：`#D97757` `#6C9BCF` `#7FB069` `#C792EA` `#E0A458` `#56B6C2`，但应当接受任意合法值 |
| `sessionCount` | number | 该项目下的会话数，用于侧边栏角标 |

### 4.1 GET `/projects`

**响应 `200`**：`Project[]`，建议按 `updatedAt` 倒序。

### 4.2 POST `/projects`

**请求**

```json
{
  "name": "my-app",
  "kind": "algorithm",
  "path": "D:\\code\\my-app",
  "description": "可选",
  "color": "#6C9BCF"
}
```

`kind` 可省略，默认 `normal`。算法仓目录使用 `algorithm`；旧数据应迁移为 `normal`。

`description` 与 `color` 可省略，`color` 省略时服务端应挑一个默认值。

**响应 `200`**：创建后的 `Project`。

**错误**：400（`name` 或 `path` 为空）、409（同用户下重名）。

### 4.3 GET `/projects/{id}`

**响应 `200`**：`Project`。**错误**：404。

### 4.4 PATCH `/projects/{id}`

**请求**：字段同 4.2，全部可选。
**响应 `200`**：更新后的 `Project`（服务端需刷新 `updatedAt`）。

### 4.5 DELETE `/projects/{id}`

**响应 `204`**。

> **必须级联删除该项目下的所有会话与消息**，否则会产生孤儿数据。客户端删除后不再请求确认。

---

## 5. 会话与消息

### `Session` 对象

```json
{
  "id": "sess_01",
  "projectId": "proj_01",
  "title": "修复 remote.rs 里的 unwrap panic",
  "model": "claude-sonnet-4-5",
  "status": "idle",
  "createdAt": "2026-10-22T06:00:00Z",
  "updatedAt": "2026-10-22T07:12:00Z",
  "messageCount": 8,
  "skills": ["debug-profiler", "code-review"]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | `idle` \| `streaming` \| `error` | 会话当前状态。侧边栏对 `streaming` 显示脉冲动画 |
| `model` | string | 该会话使用的模型 id |
| `skills` | string[] | 该会话已启用的技能 id 列表 |
| `title` | string | 新建时可省略，服务端应给个默认值（如「新会话」）。**首轮问答结束后，服务端可以把用户的第一条提问截断成标题**，客户端会重新拉取会话列表以显示新标题 |

### `Message` 对象

```json
{
  "id": "msg_01",
  "sessionId": "sess_01",
  "role": "assistant",
  "blocks": [ /* ContentBlock[]，见下 */ ],
  "status": "done",
  "createdAt": "2026-10-22T07:10:00Z",
  "model": "claude-sonnet-4-5",
  "usage": { "inputTokens": 1840, "outputTokens": 620, "cacheReadTokens": 1024 }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `role` | `user` \| `assistant` | |
| `status` | `pending` \| `streaming` \| `done` \| `error` \| `cancelled` | |
| `model` | string \| null | 用户消息为 `null` |
| `usage` | Usage \| null | 用户消息为 `null` |

### 5.1 `ContentBlock` —— 消息内容块

一条消息由**有序的块数组**组成，块之间可以任意穿插。这个结构和 Anthropic Messages API 的 content blocks 一致。

用 `type` 字段判别：

**文本块**

```json
{ "type": "text", "text": "找到了。问题出在 `remote.rs:88`……" }
```

**思考块**

```json
{ "type": "thinking", "thinking": "先复现，再定位到具体行……", "durationMs": 4200 }
```

**工具调用块**

```json
{
  "type": "tool_use",
  "id": "tool_01",
  "name": "Read",
  "input": { "file_path": "src/api/remote.rs", "offset": 78, "limit": 22 },
  "status": "success",
  "result": "    78 │ async fn request<T>(...)\n    79 │ ...",
  "durationMs": 480
}
```

| 字段 | 说明 |
|---|---|
| `name` | 工具名。客户端对 `Read` `Write` `Edit` `Bash` `Grep` `Glob` 有专门的配色，其他名字用默认色 |
| `input` | 任意 JSON 对象，客户端会把关键字段格式化成 `Read(src/api/remote.rs)` 这样的摘要 |
| `status` | `pending` \| `running` \| `success` \| `error` |
| `result` | string \| null。`status` 为 `error` 时这里放错误信息，客户端会用红色渲染 |

> **顺序很重要**：客户端按数组顺序渲染，思考块折叠、工具块渲染成终端样式的卡片、文本块走 Markdown。请把同一轮回答的所有块按实际发生顺序放进一个 `assistant` 消息里，**不要拆成多条消息**。

### 5.2 GET `/sessions?projectId={id}`

**Query**：`projectId` 可选。省略时返回该用户的所有会话。

**响应 `200`**：`Session[]`，按 `updatedAt` 倒序。

### 5.3 POST `/sessions`

**请求**

```json
{ "projectId": "proj_01", "title": null, "model": null }
```

`title` / `model` 为 `null` 或省略时，服务端用默认值（`model` 取用户设置里的默认模型）。

**响应 `200`**：创建后的 `Session`。同时应当把对应 `Project.sessionCount` +1。

**错误**：404（项目不存在）、400（`projectId` 缺失）。

### 5.4 GET `/sessions/{id}`

**响应 `200`**：`Session`。

> 客户端目前不调用这个接口（侧边栏靠列表刷新），但保留它便于将来做单会话轮询或深链。

### 5.5 PATCH `/sessions/{id}`

**请求**

```json
{ "title": "新的标题" }
```

**响应 `200`**：更新后的 `Session`。

### 5.6 DELETE `/sessions/{id}`

**响应 `204`**。必须级联删除该会话的所有消息，并把 `Project.sessionCount` -1。

### 5.7 GET `/sessions/{id}/messages`

**响应 `200`**：`Message[]`，按 `createdAt` **升序**（客户端直接顺序渲染，不做排序）。

### 5.8 POST `/sessions/{id}/messages` — 流式回复 ⭐

这是整个协议里最关键的接口。

**请求头**

```http
Authorization: Bearer <token>
Content-Type: application/json
Accept: text/event-stream
```

**请求体**

```json
{
  "content": "帮我找出代码里潜在的 panic 点",
  "skills": ["debug-profiler", "security-scan"],
  "model": null
}
```

| 字段 | 说明 |
|---|---|
| `content` | 用户提问文本，必填 |
| `skills` | string[] \| null。本次提问临时挂载的技能 id。**为 `null` 时使用会话的默认技能集** |
| `model` | string \| null。为 `null` 时使用会话的模型 |

**响应**：`200` + `Content-Type: text/event-stream`，以 SSE 推送生成过程。

服务端应当：
1. 立即持久化用户消息；
2. 创建一条 `status: "streaming"` 的助手消息占位；
3. 开始推送事件；
4. 结束时把累积的块写回该助手消息，状态置为 `done`。

---

## 6. 流式协议（SSE）

### 6.1 帧格式

标准 SSE。每帧以 `data:` 开头，以**空行**（`\n\n`）结束：

```
data: {"type":"start","messageId":"msg_01","model":"claude-sonnet-4-5"}

data: {"type":"thinking_delta","messageId":"msg_01","text":"先看现有"}

data: [DONE]

```

**客户端解析规则**（见 `src-tauri/src/api/remote.rs`）：

- 按 `\n\n` 切帧，跨 chunk 的半帧会缓存到下一个 chunk 拼接后再切；
- 只处理 `data:` 前缀的行，其他行（`event:`、`id:`、注释）忽略；
- `data:` 后面的内容 `trim()` 之后再解析；
- `data: [DONE]` 是终止哨兵，收到就断开，**不再解析后续内容**；
- 单帧 JSON 解析失败只打日志并跳过，**不会中断整个流**。

> **注意**：`data:` 与 JSON 之间有没有空格都能解析（客户端会 trim）。但 JSON 内部**不能包含裸换行** —— 文本里的换行必须是 `\n` 转义。

### 6.2 事件类型

所有事件都带 `messageId`，指向那条助手消息。

#### `start` — 流开始

```json
{ "type": "start", "messageId": "msg_01", "model": "claude-sonnet-4-5" }
```

**必须是第一个事件。** 客户端用它确定助手消息的模型标签。

#### `thinking_delta` — 思考增量

```json
{ "type": "thinking_delta", "messageId": "msg_01", "text": "看起来是运行期故障，" }
```

客户端会把连续的 thinking_delta 合并进同一个思考块。

#### `thinking_end` — 思考结束

```json
{ "type": "thinking_end", "messageId": "msg_01", "durationMs": 4200 }
```

收到后思考块折叠成 `Thought for 4.2s`。**如果省略这个事件，思考块会一直保持展开状态**，所以务必发送。

#### `text_delta` — 正文增量

```json
{ "type": "text_delta", "messageId": "msg_01", "text": "找到了。问题出在" }
```

连续的 text_delta 合并成一个文本块。客户端每次收到都会重跑 Markdown 渲染，所以**建议每帧聚合到 ~20-80 字符**再发，太碎会拖累渲染。

#### `tool_start` — 工具调用开始

```json
{
  "type": "tool_start",
  "messageId": "msg_01",
  "index": 0,
  "toolId": "tool_01",
  "name": "Grep",
  "input": { "pattern": "unwrap\\(\\)", "path": "src/", "output_mode": "content" }
}
```

| 字段 | 说明 |
|---|---|
| `index` | 该工具调用在本条消息中的序号，从 0 开始 |
| `toolId` | 工具调用的唯一 id，用来和 `tool_end` 配对 |
| `input` | 任意 JSON 对象 |

客户端此时渲染一个 `status: "running"` 的工具卡片（带旋转动画）。

#### `tool_end` — 工具调用结束

```json
{
  "type": "tool_end",
  "messageId": "msg_01",
  "index": 0,
  "toolId": "tool_01",
  "status": "success",
  "result": "src/state.rs:42:  let guard = self.inner.lock().unwrap();\n\n3 matches",
  "durationMs": 620
}
```

客户端按 `toolId` 找到对应卡片，更新状态、结果和耗时。

> `tool_start` 和 `tool_end` **之间可以穿插 text_delta / thinking_delta** —— 模型常常一边调工具一边解说。客户端按到达顺序追加块，所以顺序天然正确。

#### `done` — 生成完成

```json
{
  "type": "done",
  "messageId": "msg_01",
  "usage": { "inputTokens": 1840, "outputTokens": 620, "cacheReadTokens": 1024 }
}
```

客户端把 usage 显示在消息底部。**发送 `done` 之后仍应发送 `data: [DONE]`** 以显式关闭流。

#### `error` — 生成出错

```json
{ "type": "error", "messageId": "msg_01", "message": "模型服务超时，请重试" }
```

客户端收到后会**立即中断并当作失败处理**（消息状态置 `error`，弹红色提示）。发出 `error` 后应当关闭连接，不需要再发 `[DONE]`。

### 6.3 完整示例

```
data: {"type":"start","messageId":"msg_01","model":"claude-sonnet-4-5"}

data: {"type":"thinking_delta","messageId":"msg_01","text":"看起来是运行期故障，"}

data: {"type":"thinking_delta","messageId":"msg_01","text":"我需要先复现并定位到具体行。"}

data: {"type":"thinking_end","messageId":"msg_01","durationMs":3100}

data: {"type":"tool_start","messageId":"msg_01","index":0,"toolId":"tool_01","name":"Grep","input":{"pattern":"unwrap\\(\\)","path":"src/"}}

data: {"type":"tool_end","messageId":"msg_01","index":0,"toolId":"tool_01","status":"success","result":"src/state.rs:42: ...","durationMs":620}

data: {"type":"text_delta","messageId":"msg_01","text":"找到了。问题出在 "}

data: {"type":"text_delta","messageId":"msg_01","text":"`src/state.rs:42`。\n\n## 根因\n\n"}

data: {"type":"done","messageId":"msg_01","usage":{"inputTokens":1840,"outputTokens":620,"cacheReadTokens":1024}}

data: [DONE]

```

### 6.4 心跳与超时

- 客户端对 SSE 流**不设超时**（生成时长不可预估）。
- 但服务端应当每 15~30 秒发一个注释帧 `: keep-alive\n\n` 保活，避免中间代理掐断连接。客户端会忽略以 `:` 开头的行。
- Tauri 的 WebView 到 Rust 之间走的是本地 IPC，没有代理问题；但 Rust 到远端服务器这一段可能经过 nginx/CDN，**必须关闭这些层的响应缓冲**（nginx: `proxy_buffering off`）。

### 6.5 POST `/sessions/{id}/cancel`

**请求头**：`Authorization`，无 body。
**响应 `204`**。

用户在生成过程中点停止（或按 Esc）时，客户端会：
1. 立即断开 SSE 连接；
2. 调用本接口通知服务端停止生成。

**这个接口必须幂等** —— 客户端不检查返回值，重复调用、对已结束的会话调用都不应报错。服务端应当在这里把那条助手消息的 `status` 落成 `cancelled`，并保存已生成的部分内容。

---

## 7. 技能

### `Skill` 对象

```json
{
  "id": "debug-profiler",
  "name": "调试剖析",
  "description": "复现故障、定位根因、给出最小修复补丁与回归防线",
  "category": "质量",
  "icon": "Bug",
  "enabled": true,
  "builtin": true,
  "usageCount": 12
}
```

| 字段 | 说明 |
|---|---|
| `id` | 稳定标识符，发消息时 `skills` 数组里传的就是它 |
| `name` | 展示名。`/` 菜单里显示成 `/调试剖析`，搜索同时匹配 id、name、description |
| `category` | 分组名，技能面板按它分节显示 |
| `icon` | **lucide-react 组件名（PascalCase）**，见下方对照表 |
| `enabled` | 账户级开关。关闭后 `/` 菜单里搜不到 |
| `builtin` | 内置技能不可删除，界面上不显示「自定义」标签 |
| `usageCount` | 累计使用次数，仅用于展示 |

**`icon` 已支持的取值**（`src/components/SkillIcon.tsx` 的 `REGISTRY`）：

`ShieldCheck` `FlaskConical` `Bug` `Wrench` `Gauge` `Plug` `GitCommitHorizontal` `BookOpenText` `Lock` `Package` `Languages` `Database` `BrainCircuit` `ScrollText`

> 传其他值不会报错，客户端会回落到 `Sparkles` 图标。新增图标需要同时在 `SkillIcon.tsx` 的 `REGISTRY` 里登记。

**内置技能清单**（`src-tauri/src/api/mock.rs` 的 `skill_catalog()`，可直接作为服务端的种子数据）：

| id | name | category | icon | 默认启用 |
|---|---|---|---|---|
| `code-review` | 代码审查 | 质量 | `ShieldCheck` | ✅ |
| `test-gen` | 测试生成 | 质量 | `FlaskConical` | ✅ |
| `debug-profiler` | 调试剖析 | 质量 | `Bug` | ✅ |
| `refactor` | 重构助手 | 工程 | `Wrench` | ❌ |
| `perf-audit` | 性能审计 | 工程 | `Gauge` | ❌ |
| `api-designer` | 接口设计 | 工程 | `Plug` | ❌ |
| `git-commit` | 提交信息 | 协作 | `GitCommitHorizontal` | ✅ |
| `doc-writer` | 文档撰写 | 协作 | `BookOpenText` | ❌ |
| `security-scan` | 安全扫描 | 安全 | `Lock` | ✅ |
| `dep-upgrade` | 依赖升级 | 安全 | `Package` | ❌ |
| `i18n` | 国际化 | 扩展 | `Languages` | ❌ |
| `sql-optimizer` | SQL 优化 | 扩展 | `Database` | ❌ |
| `onnx-runtime` | 模型推理 | 扩展 | `BrainCircuit` | ❌ |
| `changelog` | 变更日志 | 协作 | `ScrollText` | ❌ |

各条目的 `description`：

| id | description |
|---|---|
| `code-review` | 按可读性、正确性、安全性三个维度审查改动，输出分级问题清单 |
| `test-gen` | 为目标模块生成单元/集成测试，覆盖边界条件与错误路径 |
| `debug-profiler` | 复现故障、定位根因、给出最小修复补丁与回归防线 |
| `refactor` | 在保持行为不变的前提下拆分长函数、消除重复、理顺依赖 |
| `perf-audit` | 跑基准测试拿 baseline，定位热点，验证优化收益 |
| `api-designer` | 设计 REST/RPC 契约，产出请求响应示例与错误码表 |
| `git-commit` | 分析暂存区改动，生成符合 Conventional Commits 的提交信息 |
| `doc-writer` | 为模块生成 README、架构说明与上手指南 |
| `security-scan` | 检查依赖漏洞、注入风险、密钥泄漏与权限配置 |
| `dep-upgrade` | 评估 breaking change，逐个升级并跑通测试 |
| `i18n` | 抽取硬编码文案，生成多语言资源文件 |
| `sql-optimizer` | 分析执行计划，补索引、改写查询 |
| `onnx-runtime` | 接入 ONNX Runtime，处理张量布局与预处理管线 |
| `changelog` | 从 git 历史生成版本变更说明 |

### 7.1 GET `/skills`

**响应 `200`**：`Skill[]`。

### 7.2 PATCH `/skills/{id}`

**请求**

```json
{ "enabled": false }
```

**响应 `200`**：更新后的 `Skill`。

**错误**：404（技能不存在或不属于该用户）。

> 客户端对这个接口做**乐观更新**：先改 UI，失败再回滚。所以响应应当尽快返回，且必须是完整的 `Skill` 对象（客户端直接用它覆盖本地状态）。

---

## 8. 用户设置

### `UserSettings` 对象

```json
{
  "theme": "dark",
  "accent": "#D97757",
  "fontSize": 14,
  "model": "claude-sonnet-4-5",
  "temperature": 0.7,
  "maxTokens": 8192,
  "backendMode": "mock",
  "apiBaseUrl": "https://api.example.com/v1",
  "notifications": true,
  "sound": false,
  "autoCompact": true,
  "showThinking": true,
  "streamSpeed": 3
}
```

| 字段 | 类型 | 取值 / 默认 | 说明 |
|---|---|---|---|
| `theme` | string | `dark`(默认) / `light` / `system` | `system` 跟随操作系统 |
| `accent` | string | `#D97757` | 强调色，客户端会覆盖 CSS 变量 |
| `fontSize` | number | `14` | 根元素字号，范围 12~18 |
| `model` | string | `claude-sonnet-4-5` | 新建会话的默认模型 |
| `temperature` | number | `0.7` | 0~1 |
| `maxTokens` | number | `8192` | 单次回复上限 |
| `backendMode` | string | `mock` | `mock` / `remote`，**仅本地生效**，服务端可以原样存回 |
| `apiBaseUrl` | string | `https://api.example.com/v1` | 同上，仅本地生效 |
| `notifications` | boolean | `true` | |
| `sound` | boolean | `false` | |
| `autoCompact` | boolean | `true` | 接近上下文上限时自动摘要 |
| `showThinking` | boolean | `true` | 关闭后不渲染思考块 |
| `streamSpeed` | number | `3` | **仅 mock 后端使用**，1~8，控制模拟输出的速度 |

> `backendMode` / `apiBaseUrl` / `streamSpeed` 是桌面端本地状态，混在设置里只是为了少一个存储位置。真实后端**不需要理解它们的语义**，原样存取即可。

### 8.1 GET `/settings`

**响应 `200`**：完整的 `UserSettings`。

> 新用户注册时服务端必须初始化一份默认设置，否则客户端拿到 404 会弹「加载设置失败」。

### 8.2 PATCH `/settings`

**请求**：任意字段子集。

```json
{ "theme": "light", "fontSize": 15 }
```

**响应 `200`**：合并后的完整 `UserSettings`。

> 客户端同样是**乐观更新**：拖动字号滑块时每变一格就发一次 PATCH。服务端应当能扛住高频小请求，或者做防抖/合并。返回完整对象是必须的。

---

## 9. 元信息

### 9.1 GET `/models`

**响应 `200`**

```json
[
  {
    "id": "claude-sonnet-4-5",
    "name": "Claude Sonnet 4.5",
    "description": "默认选择，速度与能力平衡，适合日常编码",
    "contextWindow": 200000
  },
  {
    "id": "claude-opus-4-1",
    "name": "Claude Opus 4.1",
    "description": "最强推理，适合复杂架构设计与疑难调试",
    "contextWindow": 200000
  },
  {
    "id": "claude-haiku-4-5",
    "name": "Claude Haiku 4.5",
    "description": "最快最省，适合批量简单任务",
    "contextWindow": 200000
  }
]
```

`contextWindow` 单位是 token，客户端会显示成 `200k 上下文`。

> 这个接口失败**不会阻塞应用** —— 客户端会静默回落到只显示当前模型 id。

### 9.2 GET `/stats`

**响应 `200`**

```json
{
  "projects": 2,
  "sessions": 5,
  "messages": 128,
  "inputTokens": 284000,
  "outputTokens": 96000
}
```

用于「设置 → 用量」页面。`inputTokens` / `outputTokens` 是历史累计值。

> 同样是**静默失败**的接口，返回 500 也只是让用量页显示为 0。

---

## 10. 实现清单

按依赖顺序，最小可用后端需要做这些：

- [ ] `POST /auth/register` + `POST /auth/login`，签发 30 天有效的 Bearer Token
- [ ] `GET /auth/me`（客户端启动就依赖它）
- [ ] `GET/POST /projects`，`PATCH/DELETE /projects/{id}`（删除要级联）
- [ ] `GET/POST /sessions`，`PATCH/DELETE /sessions/{id}`
- [ ] `GET /sessions/{id}/messages`
- [ ] `POST /sessions/{id}/messages` —— **SSE 流式，这是核心**
- [ ] `POST /sessions/{id}/cancel`（幂等）
- [ ] `GET /skills` + `PATCH /skills/{id}`（新用户要播种内置技能）
- [ ] `GET/PATCH /settings`（新用户要播种默认设置）
- [ ] `GET /models`、`GET /stats`（可以最后做，失败不阻塞）
- [ ] `POST /auth/logout`、`PATCH /auth/me`、`POST /auth/password`

### 联调步骤

1. 后端起来后，在桌面端「设置 → 后端」切到**远程后端**，填 Base URL；
2. 注册一个新账号（会自动播种技能与设置）；
3. 新建项目 → 新建会话 → 提一个问题；
4. 观察 SSE：思考块是否流式增长、工具卡片是否成对出现、`Thought for Ns` 是否有值、结束后 usage 是否显示；
5. 生成过程中按 Esc，确认服务端收到 `cancel` 且消息落成 `cancelled`；
6. 刷新应用（重启），确认历史消息能完整还原块结构。

### 常见坑

| 现象 | 原因 |
|---|---|
| 前端一直转圈，没有任何输出 | 响应没走 SSE，或者被 nginx 缓冲了整个 body。加 `X-Accel-Buffering: no` 并关闭 `proxy_buffering` |
| 只收到第一个事件就断了 | JSON 里有裸换行，或者帧之间没有空行 |
| 思考块永远展开 | 没发 `thinking_end` |
| 工具卡片一直转 | `tool_end` 的 `toolId` 和 `tool_start` 对不上 |
| 消息历史里块顺序乱了 | `GET messages` 返回的不是升序，或者把一轮回答拆成了多条消息 |
| 设置页报「加载设置失败」 | 新用户注册时没播种 `UserSettings` |
| 技能面板空白 | 新用户注册时没播种内置技能 |
| 一切正常但重启后要求重新登录 | `GET /auth/me` 对有效 token 返回了非 200 |

---

## 附录 A：客户端到 Rust 的命令映射

桌面端前端不直接发 HTTP，而是调用 Tauri command，由 Rust 侧转发。对应关系如下（便于排查问题）：

| Tauri command | HTTP |
|---|---|
| `login` | `POST /auth/login` |
| `register` | `POST /auth/register` |
| `logout` | `POST /auth/logout` |
| `get_me` | `GET /auth/me` |
| `update_profile` | `PATCH /auth/me` |
| `change_password` | `POST /auth/password` |
| `list_projects` | `GET /projects` |
| `create_project` | `POST /projects` |
| `get_project` | `GET /projects/{id}` |
| `update_project` | `PATCH /projects/{id}` |
| `delete_project` | `DELETE /projects/{id}` |
| `list_sessions` | `GET /sessions?projectId=` |
| `create_session` | `POST /sessions` |
| `rename_session` | `PATCH /sessions/{id}` |
| `delete_session` | `DELETE /sessions/{id}` |
| `list_messages` | `GET /sessions/{id}/messages` |
| `send_message` | `POST /sessions/{id}/messages`（SSE） |
| `stop_generation` | `POST /sessions/{id}/cancel` |
| `list_skills` | `GET /skills` |
| `set_skill_enabled` | `PATCH /skills/{id}` |
| `get_settings` | `GET /settings` |
| `update_settings` | `PATCH /settings` |
| `list_models` | `GET /models` |
| `get_stats` | `GET /stats` |
| `set_backend_mode` | — 纯本地，切换 mock/remote |
| `pick_directory` | — 纯本地，打开系统文件夹选择器 |

SSE 事件到达 Rust 后，会通过 Tauri 的 `llm-stream` 事件转发给前端，载荷格式：

```json
{
  "sessionId": "sess_01",
  "event": { "type": "text_delta", "messageId": "msg_01", "text": "..." }
}
```

`event` 字段就是 §6.2 里的那些事件，原样透传。

## 附录 B：类型定义速查

Rust 权威定义在 `src-tauri/src/models.rs`，TypeScript 镜像在 `src/types.ts`。两边必须同步修改。


## 算法仓会话与模型文件

算法仓目录（`Project.kind = "algorithm"`）新建会话前填写算法仓名称、多张卡片与功能、仓类型（视频仓/图片仓）和支持平台（T4/Atlas/MC50/MC40/BW10）。所选平台共用填写的卡片列表。提交时生成中文需求，作为新会话首条 `SendMessageRequest.content` 发送，沿用现有会话及消息接口。

模型支持多选本地文件和多条 HTTP/HTTPS 下载链接，两者可以同时提供，也可留空。客户端原生命令 `pick_model_files` 返回 `{ name, path, size }[]`；`import_model_files({ token, projectId, paths })` 校验项目归属和算法仓类型，将文件流式复制到用户本机项目目录的 `megvii-models/<批次>/<序号>/<原文件名>`，然后返回相同结构（`path` 为导入后的绝对路径）。模型不经过 WebView 读取，不作为 Base64 写进聊天，也不会上传到远程服务。失败批次会清理，不覆盖已有文件。

需求文本列出导入后的模型路径与下载链接。远程服务若负责调用本地编码代理，需要让代理访问该项目工作目录；服务端本身不会因收到路径而获得本地文件。远程项目接口必须保存并返回 `kind` 字段，才能跨端保留算法仓目录类型。
