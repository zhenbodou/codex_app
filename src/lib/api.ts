import { invoke } from "@tauri-apps/api/core";
import type {
  ApiErrorPayload,
  AuthResponse,
  ChangePasswordRequest,
  CreateProjectRequest,
  CreateSessionRequest,
  LoginRequest,
  Message,
  ModelInfo,
  Project,
  RegisterRequest,
  SendMessageRequest,
  Session,
  Skill,
  UpdateProfileRequest,
  UpdateProjectRequest,
  UsageStats,
  User,
  UserSettings,
  BackendMode,
} from "@/types";

/**
 * Rust 侧统一抛出的错误结构。
 * 前端靠 `kind` 做分支（比如 unauthorized 就跳登录页），靠 `message` 直接展示。
 */
export class ApiError extends Error {
  constructor(
    public kind: ApiErrorPayload["kind"] | "timeout" | "unknown",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.kind === "unauthorized";
  }
}

function normalize(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (typeof e === "string") {
    // Rust 的 ErrorDto 经过 IPC 有时会是 JSON 字符串
    try {
      const parsed = JSON.parse(e) as ApiErrorPayload;
      if (parsed && typeof parsed.message === "string") {
        return new ApiError(parsed.kind, parsed.message);
      }
    } catch {
      /* 不是 JSON，按普通字符串处理 */
    }
    return new ApiError("internal", e);
  }
  if (e && typeof e === "object" && "kind" in e && "message" in e) {
    const o = e as ApiErrorPayload;
    return new ApiError(o.kind, o.message);
  }
  return new ApiError("unknown", String(e));
}

/**
 * 带超时和错误归一化的 invoke。
 *
 * 为什么必须有超时：如果 Rust 侧 panic，invoke 返回的 Promise **永远不会 resolve**
 * （这是 Tauri 的已知行为），不加超时界面就会永久卡在 loading。
 */
export async function call<T>(
  cmd: string,
  args?: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<T> {
  try {
    if (!Number.isFinite(timeoutMs)) {
      return await invoke<T>(cmd, args);
    }
    return await Promise.race([
      invoke<T>(cmd, args),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new ApiError("timeout", `${cmd} 超时（${timeoutMs}ms）`)),
          timeoutMs,
        ),
      ),
    ]);
  } catch (e) {
    throw normalize(e);
  }
}

/**
 * 所有 Tauri command 的类型安全封装。
 *
 * 参数名必须和 Rust 侧一致（snake_case → camelCase），命令名保持原样不转换。
 */
export const api = {
  // ── 鉴权 ──
  login: (req: LoginRequest) => call<AuthResponse>("login", { req }),
  register: (req: RegisterRequest) => call<AuthResponse>("register", { req }),
  logout: (token: string) => call<void>("logout", { token }),
  me: (token: string) => call<User>("get_me", { token }),
  updateProfile: (token: string, req: UpdateProfileRequest) =>
    call<User>("update_profile", { token, req }),
  changePassword: (token: string, req: ChangePasswordRequest) =>
    call<void>("change_password", { token, req }),

  // ── 项目 ──
  listProjects: (token: string) => call<Project[]>("list_projects", { token }),
  createProject: (token: string, req: CreateProjectRequest) =>
    call<Project>("create_project", { token, req }),
  getProject: (token: string, id: string) =>
    call<Project>("get_project", { token, id }),
  updateProject: (token: string, id: string, req: UpdateProjectRequest) =>
    call<Project>("update_project", { token, id, req }),
  deleteProject: (token: string, id: string) =>
    call<void>("delete_project", { token, id }),

  // ── 会话 ──
  listSessions: (token: string, projectId?: string) =>
    call<Session[]>("list_sessions", { token, projectId: projectId ?? null }),
  createSession: (token: string, req: CreateSessionRequest) =>
    call<Session>("create_session", { token, req }),
  renameSession: (token: string, id: string, title: string) =>
    call<Session>("rename_session", { token, id, title }),
  deleteSession: (token: string, id: string) =>
    call<void>("delete_session", { token, id }),

  // ── 消息 ──
  listMessages: (token: string, sessionId: string) =>
    call<Message[]>("list_messages", { token, sessionId }),
  /** 流式回复，耗时不可预估，所以不设超时。 */
  sendMessage: (token: string, sessionId: string, req: SendMessageRequest) =>
    call<Message>(
      "send_message",
      { token, sessionId, req },
      Number.POSITIVE_INFINITY,
    ),
  stopGeneration: (sessionId: string) =>
    call<void>("stop_generation", { sessionId }),

  // ── 技能 ──
  listSkills: (token: string) => call<Skill[]>("list_skills", { token }),
  setSkillEnabled: (token: string, id: string, enabled: boolean) =>
    call<Skill>("set_skill_enabled", { token, id, enabled }),

  // ── 设置与元信息 ──
  getSettings: (token: string) => call<UserSettings>("get_settings", { token }),
  updateSettings: (token: string, patch: Partial<UserSettings>) =>
    call<UserSettings>("update_settings", { token, patch }),
  setBackendMode: (mode: BackendMode, baseUrl: string) =>
    call<void>("set_backend_mode", { mode, baseUrl }),
  listModels: (token: string) => call<ModelInfo[]>("list_models", { token }),
  getStats: (token: string) => call<UsageStats>("get_stats", { token }),

  // ── 本地能力 ──
  /** 打开系统文件夹选择器；用户取消时返回 null。 */
  pickDirectory: () => call<string | null>("pick_directory", undefined, 300_000),
};
