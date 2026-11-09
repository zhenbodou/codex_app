import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/types";

/**
 * 凭证持久化用的 localStorage key。
 *
 * 说明：localStorage 在 Tauri 里存在 WebView 的本地存储中，只有本机能读。
 * 生产环境更稳妥的做法是交给 Rust 侧用系统 keychain（如 `keyring` crate）保存，
 * 这里为了让示例保持简单先用 localStorage。
 */
const TOKEN_KEY = "cc.token";
let authEpoch = 0;

interface AuthState {
  token: string | null;
  user: User | null;
  /** 启动时正在用本地 token 换取用户信息 */
  restoring: boolean;
  error: string | null;

  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: { name?: string; email?: string; avatarUrl?: string }) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  /** token 失效时由任意 store 调用 */
  forceLogout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  restoring: true,
  error: null,

  restore: async () => {
    const epoch = authEpoch;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ restoring: false });
      return;
    }
    try {
      const user = await api.me(token);
      if (epoch !== authEpoch) return;
      set({ token, user, restoring: false, error: null });
    } catch (e) {
      if (epoch !== authEpoch) return;
      // token 过期或后端数据被清空，直接丢弃本地凭证
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, user: null, restoring: false, error: null });
      if (e instanceof ApiError && !e.isUnauthorized) {
        console.warn("[auth] 恢复会话失败:", e.message);
      }
    }
  },

  login: async (email, password) => {
    const epoch = ++authEpoch;
    set({ error: null });
    try {
      const res = await api.login({ email, password });
      if (epoch !== authEpoch) return;
      localStorage.setItem(TOKEN_KEY, res.token);
      set({ token: res.token, user: res.user });
    } catch (e) {
      if (epoch !== authEpoch) return;
      const err = e as ApiError;
      set({
        error:
          err.kind === "unauthorized"
            ? "邮箱或密码不正确"
            : err.message || "登录失败",
      });
      throw err;
    }
  },

  register: async (email, password, name) => {
    const epoch = ++authEpoch;
    set({ error: null });
    try {
      const res = await api.register({ email, password, name });
      if (epoch !== authEpoch) return;
      localStorage.setItem(TOKEN_KEY, res.token);
      set({ token: res.token, user: res.user });
    } catch (e) {
      if (epoch !== authEpoch) return;
      const err = e as ApiError;
      set({ error: err.message || "注册失败" });
      throw err;
    }
  },

  logout: async () => {
    ++authEpoch;
    const token = get().token;
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null, error: null });
    if (token) {
      // 登出失败也要清本地状态，否则用户会被卡在已登录界面
      await api.logout(token).catch(() => {});
    }
  },

  updateProfile: async (patch) => {
    const token = get().token;
    if (!token) return;
    const user = await api.updateProfile(token, patch);
    if (get().token !== token) return;
    set({ user });
  },

  changePassword: async (oldPassword, newPassword) => {
    const token = get().token;
    if (!token) return;
    await api.changePassword(token, { oldPassword, newPassword });
  },

  forceLogout: () => {
    ++authEpoch;
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null });
  },

  clearError: () => set({ error: null }),
}));
