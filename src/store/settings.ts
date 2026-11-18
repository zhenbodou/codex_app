import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import type { ModelInfo, UsageStats, UserSettings } from "@/types";

interface SettingsState {
  settings: UserSettings | null;
  models: ModelInfo[];
  stats: UsageStats | null;
  loading: boolean;
  modelSaving: boolean;
  modelListLoading: boolean;
  refreshModels: () => Promise<void>;
  selectModel: (id: string) => Promise<boolean>;

  load: () => Promise<void>;
  loadStats: () => Promise<void>;
  patch: (p: Partial<UserSettings>) => Promise<void>;
  /** 纯本地切换后端模式，远程后端挂掉时的逃生通道 */
  setBackendMode: (mode: "mock" | "remote", baseUrl: string) => Promise<void>;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  models: [],
  stats: null,
  loading: false,
  modelSaving: false,
  modelListLoading:false,

  load: async () => {
    const t = useAuthStore.getState().token;
    if (!t) return;
    set({ loading: true });
    try {
      const [settings, models] = await Promise.all([
        api.getSettings(t),
        api.listModels(t).catch(() => [] as ModelInfo[]),
      ]);
      if (useAuthStore.getState().token !== t) return;
      set({ settings, models, loading: false });
      applyTheme(settings);
    } catch (e) {
      if (useAuthStore.getState().token !== t) return;
      const err = e as ApiError;
      if (err?.isUnauthorized) useAuthStore.getState().forceLogout();
      set({ loading: false });
      toast.error("加载设置失败", err?.message);
    }
  },

  loadStats: async () => {
    const t = useAuthStore.getState().token;
    if (!t) return;
    try {
      const stats = await api.getStats(t);
      if (useAuthStore.getState().token === t) set({ stats });
    } catch {
      // 统计是锦上添花，失败就静默
    }
  },

  refreshModels: async () => {
    const token=useAuthStore.getState().token;
    if (!token || get().modelListLoading) return;
    set({modelListLoading:true});
    try {
      const models=await api.listModels(token);
      if (useAuthStore.getState().token===token) set({models});
    } catch(error) {if (useAuthStore.getState().token===token) toast.error("刷新模型列表失败",(error as Error).message);}
    finally {set({modelListLoading:false});}
  },

  selectModel: async (id) => {
    const token=useAuthStore.getState().token;
    if (!token || get().modelSaving || !get().models.some(m=>m.id===id)) return false;
    const previous=get().settings;
    set({modelSaving:true});
    try {
      const saved=await api.updateSettings(token,{model:id});
      if (useAuthStore.getState().token!==token || get().settings?.apiBaseUrl!==previous?.apiBaseUrl) return false;
      if (saved.model!==id) throw new Error("后端未确认所选模型，请更新后端后重试");
      set({settings:saved});applyTheme(saved);
      toast.success("模型选择已保存",`${id} · 从下一条消息开始使用，执行确认会显示在回复中`);
      return true;
    } catch(error) {
      if (useAuthStore.getState().token===token) toast.error("切换模型失败",(error as Error).message);
      return false;
    } finally {set({modelSaving:false});}
  },

  patch: async (p) => {
    if (p.model!==undefined) {
      if (!await get().selectModel(p.model)) return;
      const {model:_model,...other}=p;
      if (!Object.keys(other).length) return;
      p=other;
    }
    const t = useAuthStore.getState().token;
    if (!t) return;

    const prev = get().settings;
    if (prev) set({ settings: { ...prev, ...p } });

    try {
      const settings = await api.updateSettings(t, p);
      if (useAuthStore.getState().token !== t) return;
      set({ settings });
      applyTheme(settings);
    } catch (e) {
      if (useAuthStore.getState().token !== t) return;
      if (prev) set({ settings: prev });
      toast.error("保存设置失败", (e as ApiError)?.message);
    }
  },

  setBackendMode: async (mode, baseUrl) => {
    try {
      await api.setBackendMode(mode, baseUrl);
      const prev = get().settings;
      if (prev) set({ settings: { ...prev, backendMode: mode, apiBaseUrl: baseUrl } });
      toast.success(
        mode === "mock" ? "已切换到本地模拟后端" : "已切换到远程后端",
        mode === "remote" ? baseUrl : undefined,
      );
    } catch (e) {
      toast.error("切换失败", (e as ApiError)?.message);
    }
  },

  reset: () => set({ settings: null, models: [], stats: null, loading: false, modelSaving:false, modelListLoading:false }),
}));

/**
 * 把设置里的主题与强调色写到根元素上。
 *
 * 主题靠 `data-theme` 切换整套 CSS 变量；强调色直接覆盖 `--accent` 系列，
 * 所以换色不需要重新编译任何样式。
 */
export function applyTheme(settings: UserSettings) {
  const root = document.documentElement;

  const resolved =
    settings.theme === "system" ? systemTheme() : settings.theme;
  root.dataset.theme = resolved;

  const base = settings.accent || "#D97757";
  // 内联样式优先级高于 [data-theme] 里的整套变量，所以强调色必须按当前主题换算：
  // 浅色底上若照用深色主题的亮橘，填充和文字都会糊掉，这里统一压暗一档。
  const light = resolved === "light";
  const accent = light ? darken(base, 0.14) : base;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-soft", `${accent}${light ? "14" : "24"}`);
  root.style.setProperty(
    "--accent-text",
    light ? darken(base, 0.24) : lighten(base, 0.16),
  );

  root.style.fontSize = `${settings.fontSize}px`;
}

/** 把 #rrggbb 朝黑色方向压暗 amount（0~1）。 */
function darken(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c * (1 - amount)),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** 把 #rrggbb 朝白色方向提亮 amount（0~1）。 */
function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(c + (255 - c) * amount),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function systemTheme(): "dark" | "light" {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/** 订阅系统主题变化，仅在设置为 system 时生效。 */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  if (!mq) return () => {};

  const onChange = () => {
    const s = useSettingsStore.getState().settings;
    if (s?.theme === "system") applyTheme(s);
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
