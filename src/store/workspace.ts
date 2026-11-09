import { create } from "zustand";
import { toast, useUiStore } from "@/store/ui";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import type { Project, Session } from "@/types";

/**
 * 侧边栏状态：项目列表、每个项目下的会话、当前展开与选中项。
 *
 * 会话按 projectId 分桶缓存，展开某个项目时才去拉它的会话，
 * 避免一次性请求所有项目的会话。
 */
interface WorkspaceState {
  projects: Project[];
  sessionsByProject: Record<string, Session[]>;
  expanded: string[];
  activeProjectId: string | null;
  activeSessionId: string | null;
  loadingProjects: boolean;

  loadProjects: () => Promise<void>;
  createProject: (input: {
    name: string;
    path: string;
    description?: string;
    color?: string;
  }) => Promise<Project | null>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  toggleExpand: (id: string) => void;
  loadSessions: (projectId: string) => Promise<void>;
  createSession: (projectId: string, title?: string) => Promise<Session | null>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  selectSession: (projectId: string, sessionId: string) => void;
  selectProject: (projectId: string) => void;
  startNewSession: (projectId?: string) => void;
  reset: () => void;
}

const initial = {
  projects: [] as Project[],
  sessionsByProject: {} as Record<string, Session[]>,
  expanded: [] as string[],
  activeProjectId: null as string | null,
  activeSessionId: null as string | null,
  loadingProjects: false,
};

function token(): string | null {
  return useAuthStore.getState().token;
}

/** 统一的错误出口：401 强制登出，其余弹 toast。声明成 never 让调用方不必写 return。 */
function fail(e: unknown, fallback: string): never {
  const err = e as ApiError;
  if (err?.isUnauthorized) {
    useAuthStore.getState().forceLogout();
  }
  toast.error(err?.message || fallback);
  throw err;
}

/** 替换某个桶里的一条会话，桶不存在就原样返回。 */
function patchSession(
  buckets: Record<string, Session[]>,
  id: string,
  fn: (s: Session) => Session,
): Record<string, Session[]> {
  return Object.fromEntries(
    Object.entries(buckets).map(([key, list]) => [
      key,
      list.map((s) => (s.id === id ? fn(s) : s)),
    ]),
  );
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...initial,

  loadProjects: async () => {
    const t = token();
    if (!t) return;
    set({ loadingProjects: true });
    try {
      const projects = await api.listProjects(t);
      if (token() !== t) return;
      set({ projects, loadingProjects: false });

      // 首次进入时自动选中并展开第一个项目
      if (projects.length > 0 && get().activeProjectId === null) {
        const first = projects[0];
        set((s) => ({
          activeProjectId: first.id,
          expanded: s.expanded.includes(first.id)
            ? s.expanded
            : [...s.expanded, first.id],
        }));
        await get().loadSessions(first.id);
      }
    } catch (e) {
      if (token() !== t) return;
      set({ loadingProjects: false });
      fail(e, "加载项目失败");
    }
  },

  createProject: async ({ name, path, description, color }) => {
    const t = token();
    if (!t) return null;
    try {
      const project = await api.createProject(t, {
        name,
        path,
        description,
        color,
      });
      set((s) => ({
        projects: [project, ...s.projects],
        expanded: [...s.expanded, project.id],
        activeProjectId: project.id,
        activeSessionId: null,
      }));
      toast.success(`项目「${project.name}」已创建`);
      return project;
    } catch (e) {
      return fail(e, "创建项目失败");
    }
  },

  updateProject: async (id, patch) => {
    const t = token();
    if (!t) return;
    try {
      const updated = await api.updateProject(t, id, patch);
      set((s) => ({
        projects: s.projects.map((p) =>
          p.id === id ? { ...p, ...updated } : p,
        ),
      }));
      toast.success("项目已更新");
    } catch (e) {
      fail(e, "更新项目失败");
    }
  },

  deleteProject: async (id) => {
    const t = token();
    if (!t) return;
    try {
      await api.deleteProject(t, id);
      set((s) => {
        const projects = s.projects.filter((p) => p.id !== id);
        const sessionsByProject = Object.fromEntries(
          Object.entries(s.sessionsByProject).filter(([key]) => key !== id),
        );
        const wasActive = s.activeProjectId === id;
        return {
          projects,
          sessionsByProject,
          expanded: s.expanded.filter((x) => x !== id),
          activeProjectId: wasActive ? (projects[0]?.id ?? null) : s.activeProjectId,
          activeSessionId: wasActive ? null : s.activeSessionId,
        };
      });
      toast.success("项目已删除");
    } catch (e) {
      fail(e, "删除项目失败");
    }
  },

  toggleExpand: (id) =>
    set((s) => ({
      expanded: s.expanded.includes(id)
        ? s.expanded.filter((x) => x !== id)
        : [...s.expanded, id],
    })),

  loadSessions: async (projectId) => {
    const t = token();
    if (!t) return;
    try {
      const sessions = await api.listSessions(t, projectId);
      if (token() !== t || !get().projects.some(p => p.id === projectId)) return;
      set((s) => ({
        sessionsByProject: { ...s.sessionsByProject, [projectId]: sessions },
      }));
    } catch (e) {
      if (token() !== t) return;
      fail(e, "加载会话失败");
    }
  },

  createSession: async (projectId, title) => {
    const t = token();
    if (!t) return null;
    const previousSessionId = get().activeSessionId;
    try {
      const session = await api.createSession(t, { projectId, title });
      if (token() !== t || !get().projects.some(p => p.id === projectId)) return null;
      set((s) => ({
        sessionsByProject: {
          ...s.sessionsByProject,
          [projectId]: [session, ...(s.sessionsByProject[projectId] ?? [])],
        },
        expanded: s.expanded.includes(projectId)
          ? s.expanded
          : [...s.expanded, projectId],
        activeProjectId: s.activeProjectId === projectId && s.activeSessionId === previousSessionId ? projectId : s.activeProjectId,
        activeSessionId: s.activeProjectId === projectId && s.activeSessionId === previousSessionId ? session.id : s.activeSessionId,
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, sessionCount: p.sessionCount + 1 } : p,
        ),
      }));
      return session;
    } catch (e) {
      if (token() !== t) return null;
      return fail(e, "创建会话失败");
    }
  },

  renameSession: async (id, title) => {
    const t = token();
    if (!t) return;
    try {
      const updated = await api.renameSession(t, id, title);
      set((s) => ({
        sessionsByProject: patchSession(s.sessionsByProject, id, (x) => ({
          ...x,
          ...updated,
        })),
      }));
    } catch (e) {
      fail(e, "重命名失败");
    }
  },

  deleteSession: async (id) => {
    const t = token();
    if (!t) return;
    try {
      await api.deleteSession(t, id);
      set((s) => ({
        sessionsByProject: Object.fromEntries(
          Object.entries(s.sessionsByProject).map(([key, list]) => [
            key,
            list.filter((x) => x.id !== id),
          ]),
        ),
        activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
      }));
      toast.success("会话已删除");
    } catch (e) {
      fail(e, "删除会话失败");
    }
  },

  startNewSession: (projectId) => {
    const id = projectId ?? get().activeProjectId;
    useUiStore.getState().activateComposer(`new:${id ?? "none"}`);
    useUiStore.getState().setComposerDraft("");
    set({ activeProjectId: id, activeSessionId: null });
  },

  selectSession: (projectId, sessionId) => {
    useUiStore.getState().activateComposer(`${projectId}:${sessionId}`);
    set({ activeProjectId: projectId, activeSessionId: sessionId });
  },

  selectProject: (projectId) => {
    const sessions = get().sessionsByProject[projectId] ?? [];
    set({
      activeProjectId: projectId,
      activeSessionId: sessions[0]?.id ?? null,
    });
  },

  reset: () => set({ ...initial, sessionsByProject: {}, expanded: [] }),
}));
