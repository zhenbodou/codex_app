import { create } from "zustand";
import { nanoid } from "nanoid";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

/** 权限模式，对应终端里 shift+tab 循环的那三档。 */
export type UiMode = import("@/types").PermissionMode;
export const MODE_ORDER: UiMode[] = ["full-access", "request-approval", "auto-review"];
export const MODE_LABEL: Record<UiMode, string> = {
  "full-access": "完全权限",
  "request-approval": "请求审批",
  "auto-review": "帮我审批",
};
export const MODE_DESCRIPTION: Record<UiMode, string> = {
  "full-access": "直接执行，可读写远程容器内当前用户可访问的文件并访问网络。",
  "request-approval": "使用项目沙箱，需要授权的操作等待你允许或拒绝。",
  "auto-review": "使用项目沙箱，需要授权的操作交给 Codex 自动审查，可批准或拒绝。",
};
function savedMode(): UiMode {
  try { const mode = localStorage.getItem("megvii-permission-mode") as UiMode; if (MODE_ORDER.includes(mode)) return mode; } catch { /* Use the safe default. */ }
  return "request-approval";
}

interface UiState {
  toasts: ToastItem[];
  sidebarCollapsed: boolean;
  uiMode: UiMode;
  /** ctrl+r：把工具调用的完整输出就地展开，对应终端的 verbose transcript */
  verbose: boolean;
  transcriptView: "normal" | "thinking" | "verbose";
  setTranscriptView: (view: "normal" | "thinking" | "verbose") => void;
  detailsOpen: boolean;
  toggleDetails: () => void;
  composerDraft: string;
  draftKey: string | null;
  drafts: Record<string, string>;
  activateComposer: (key: string) => void;
  setComposerDraft: (text: string) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  // 弹层开关。用集中管理而不是散在各组件里，方便快捷键和联动关闭。
  projectDialog: { open: boolean; editingId: string | null };
  algorithmDialog: { projectId: string | null; busy: boolean };
  openAlgorithmDialog: (projectId: string) => void;
  closeAlgorithmDialog: () => void;
  skillsOpen: boolean;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;

  pushToast: (kind: ToastKind, title: string, description?: string) => void;
  dismissToast: (id: string) => void;
  toggleSidebar: () => void;
  cycleMode: () => void;
  setPermissionMode: (mode: UiMode) => void;
  toggleVerbose: () => void;

  openProjectDialog: (editingId?: string | null) => void;
  closeProjectDialog: () => void;
  setSkillsOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  /** Esc 或点击遮罩时统一关闭最上层的弹层 */
  closeTopmost: () => boolean;
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  sidebarCollapsed: false,
  uiMode: savedMode(),
  verbose: false,
  transcriptView: "normal",
  setTranscriptView: (view) => set({ transcriptView: view, verbose: view === "verbose" }),
  detailsOpen: false,
  toggleDetails: () => set(s => ({ detailsOpen: !s.detailsOpen })),
  composerDraft: "",
  draftKey: null,
  drafts: {},
  activateComposer: (key) => set(s => {
    if (s.draftKey === key) return s;
    const drafts = s.draftKey ? { ...s.drafts, [s.draftKey]: s.composerDraft } : s.drafts;
    return { drafts, draftKey: key, composerDraft: drafts[key] ?? "" };
  }),
  setComposerDraft: (text) => set({ composerDraft: text }),
  shortcutsOpen: false,
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  projectDialog: { open: false, editingId: null },
  algorithmDialog: { projectId: null, busy: false },
  openAlgorithmDialog: (projectId) => set({ algorithmDialog: { projectId, busy: false } }),
  closeAlgorithmDialog: () => {
    if (!get().algorithmDialog.busy) set({ algorithmDialog: { projectId: null, busy: false } });
  },
  skillsOpen: false,
  settingsOpen: false,
  commandPaletteOpen: false,

  pushToast: (kind, title, description) => {
    const id = nanoid(8);
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, title, description }] }));
    // 自动消失；错误停留久一点，方便读完
    setTimeout(() => get().dismissToast(id), kind === "error" ? 6000 : 3200);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setPermissionMode: (mode) => {
    if (!MODE_ORDER.includes(mode)) return;
    try { localStorage.setItem("megvii-permission-mode", mode); } catch { /* Session selection still works. */ }
    set({ uiMode: mode });
  },

  cycleMode: () => {
    const next =
      MODE_ORDER[(MODE_ORDER.indexOf(get().uiMode) + 1) % MODE_ORDER.length];
    get().setPermissionMode(next);
  },

  toggleVerbose: () => set((s) => ({ verbose: !s.verbose, transcriptView: s.verbose ? "normal" : "verbose" })),

  openProjectDialog: (editingId = null) =>
    set({ projectDialog: { open: true, editingId } }),
  closeProjectDialog: () => set({ projectDialog: { open: false, editingId: null } }),
  setSkillsOpen: (v) => set({ skillsOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),

  closeTopmost: () => {
    const s = get();
    if (s.algorithmDialog.projectId) {
      s.closeAlgorithmDialog();
      return true;
    }
    if (s.shortcutsOpen) {
      s.setShortcutsOpen(false);
      return true;
    }
    if (s.commandPaletteOpen) {
      s.setCommandPaletteOpen(false);
      return true;
    }
    if (s.projectDialog.open) {
      s.closeProjectDialog();
      return true;
    }
    if (s.skillsOpen) {
      s.setSkillsOpen(false);
      return true;
    }
    if (s.settingsOpen) {
      s.setSettingsOpen(false);
      return true;
    }
    return false;
  },
}));

/** 命令式的 toast 调用，store 外部也能直接用。 */
export const toast = {
  success: (title: string, description?: string) =>
    useUiStore.getState().pushToast("success", title, description),
  error: (title: string, description?: string) =>
    useUiStore.getState().pushToast("error", title, description),
  info: (title: string, description?: string) =>
    useUiStore.getState().pushToast("info", title, description),
};
