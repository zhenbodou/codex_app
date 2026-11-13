/**
 * 前端类型定义，与 `src-tauri/src/models.rs` 严格对应。
 *
 * Rust 侧所有 struct 都标了 `#[serde(rename_all = "camelCase")]`，
 * 所以字段名在这里是 camelCase；带 `#[serde(tag = "type")]` 的枚举
 * 则是「判别联合」，靠 `type` 字段区分。
 *
 * 改动这里之前先改 Rust 侧，两边必须同步。
 */

export type Plan = "free" | "pro" | "max" | "team";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  plan: Plan;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  expiresAt: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export type ProjectKind = "normal" | "algorithm";

export interface Project {
  kind: ProjectKind;
  id: string;
  name: string;
  path: string;
  description: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
  sessionCount: number;
}

export interface CreateProjectRequest {
  kind?: ProjectKind;
  name: string;
  path: string;
  description?: string | null;
  color?: string | null;
}

export interface UpdateProjectRequest {
  kind?: ProjectKind;
  name?: string;
  path?: string;
  description?: string | null;
  color?: string;
}

export type SessionStatus = "idle" | "streaming" | "error";

export interface Session {
  id: string;
  projectId: string;
  title: string;
  model: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  skills: string[];
}

export interface CreateSessionRequest {
  projectId: string;
  title?: string | null;
  model?: string | null;
}

export type Role = "user" | "assistant";
export type ToolStatus = "pending" | "running" | "success" | "error";
export type MessageStatus =
  | "pending"
  | "streaming"
  | "done"
  | "error"
  | "cancelled";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; durationMs: number }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: ToolStatus;
      result: string | null;
      durationMs: number;
    };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  blocks: ContentBlock[];
  status: MessageStatus;
  createdAt: string;
  model: string | null;
  usage: Usage | null;
}

export interface SendMessageRequest {
  content: string;
  skills?: string[] | null;
  model?: string | null;
}

/** 与 Rust 的 `StreamEvent` 对应，`llm-stream` 事件的载荷。 */
export type StreamEvent =
  | { type: "start"; messageId: string; model: string }
  | { type: "thinking_delta"; messageId: string; text: string }
  | { type: "thinking_end"; messageId: string; durationMs: number }
  | { type: "text_delta"; messageId: string; text: string }
  | {
      type: "tool_start";
      messageId: string;
      index: number;
      toolId: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_end";
      messageId: string;
      index: number;
      toolId: string;
      status: ToolStatus;
      result: string;
      durationMs: number;
    }
  | { type: "done"; messageId: string; usage: Usage }
  | { type: "error"; messageId: string; message: string };

export interface StreamPayload {
  sessionId: string;
  event: StreamEvent;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  enabled: boolean;
  builtin: boolean;
  usageCount: number;
}

export type Theme = "dark" | "light" | "system";
export type BackendMode = "mock" | "remote";

export interface UserSettings {
  theme: Theme;
  accent: string;
  fontSize: number;
  model: string;
  temperature: number;
  maxTokens: number;
  backendMode: BackendMode;
  apiBaseUrl: string;
  notifications: boolean;
  sound: boolean;
  autoCompact: boolean;
  showThinking: boolean;
  streamSpeed: number;
}

export interface UpdateProfileRequest {
  name?: string;
  avatarUrl?: string | null;
  email?: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
}

export interface UsageStats {
  projects: number;
  sessions: number;
  messages: number;
  inputTokens: number;
  outputTokens: number;
}

/** Rust 侧抛出的错误结构。 */
export interface ApiErrorPayload {
  kind:
    | "unauthorized"
    | "not_found"
    | "bad_request"
    | "conflict"
    | "network"
    | "internal";
  message: string;
}

/** 侧边栏项目色块可选值，和 Rust 的调色板保持一致。 */
export const PROJECT_COLORS = [
  "#D97757",
  "#6C9BCF",
  "#7FB069",
  "#C792EA",
  "#E0A458",
  "#56B6C2",
] as const;

/** 强调色可选值。 */
export const ACCENTS = [
  { name: "陶土橘", value: "#D97757" },
  { name: "靛蓝", value: "#6C9BCF" },
  { name: "苔绿", value: "#7FB069" },
  { name: "紫罗兰", value: "#C792EA" },
  { name: "琥珀", value: "#E0A458" },
  { name: "青", value: "#56B6C2" },
] as const;
