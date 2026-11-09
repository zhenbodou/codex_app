import { create } from "zustand";
import { nanoid } from "nanoid";
import { isTauri } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { api, ApiError } from "@/lib/api";
import { applyStreamEvent } from "@/lib/blocks";
import { subscribeStream } from "@/lib/stream";
import { toast } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import type { Message, StreamPayload, Usage } from "@/types";

interface Conversation {
  messages: Message[];
  loading: boolean;
  streamingId: string | null;
  isStreaming: boolean;
  error: string | null;
  lastUsage: Usage | null;
}
interface ChatState extends Conversation {
  activeChatId: string | null;
  threads: Record<string, Conversation>;
  loadMessages: (sessionId: string, refresh?: boolean) => Promise<void>;
  send: (content: string, skillIds?: string[]) => Promise<void>;
  stop: () => Promise<void>;
  applyEvent: (payload: StreamPayload) => void;
  clear: () => void;
  reset: () => void;
}
const blank = (): Conversation => ({ messages: [], loading: false, streamingId: null, isStreaming: false, error: null, lastUsage: null });
let loadSeq = 0;
let generation = 0;
let unlisten: UnlistenFn | null = null;

export function initStreamSubscription(): () => void {
  if (!isTauri() || unlisten) return () => {};
  let disposed = false;
  subscribeStream(payload => useChatStore.getState().applyEvent(payload))
    .then(fn => { if (disposed) fn(); else unlisten = fn; })
    .catch(e => console.warn("[chat] 流式事件订阅失败:", e));
  return () => { disposed = true; unlisten?.(); unlisten = null; };
}

export const useChatStore = create<ChatState>((set, get) => {
  const update = (id: string, change: (view: Conversation) => Conversation) => {
    set(s => {
      const previous = s.threads[id];
      if (!previous) return s;
      const next = change(previous);
      return { threads: { ...s.threads, [id]: next }, ...(s.activeChatId === id ? next : {}) };
    });
  };
  const status = (id: string, next: "idle" | "streaming" | "error", count?: number) => {
    useWorkspaceStore.setState(s => ({
      sessionsByProject: Object.fromEntries(Object.entries(s.sessionsByProject).map(([pid, sessions]) => [pid, sessions.map(session =>
        session.id === id ? { ...session, status: next, ...(count === undefined ? {} : { messageCount: count }) } : session
      )])),
    }));
  };
  return {
    ...blank(), activeChatId: null, threads: {},
    loadMessages: async (sessionId, refresh = false) => {
      const token = useAuthStore.getState().token;
      if (!token) return;
      const seq = ++loadSeq;
      const epoch = generation;
      let cached = get().threads[sessionId];
      const ws = useWorkspaceStore.getState();
      const session = Object.values(ws.sessionsByProject).flat().find(s => s.id === sessionId);
      if (!cached && session?.messageCount === 0) {
        cached = blank();
        set(s => ({ threads: { ...s.threads, [sessionId]: cached! } }));
      }
      if (cached && (!refresh || cached.isStreaming)) {
        set({ ...cached, activeChatId: sessionId });
        return;
      }
      set({ ...blank(), activeChatId: sessionId, loading: true });
      try {
        const messages = await api.listMessages(token, sessionId);
        if (seq !== loadSeq || epoch !== generation || useAuthStore.getState().token !== token) return;
        const view = { ...blank(), messages, lastUsage: [...messages].reverse().find(m => m.usage)?.usage ?? null };
        set(s => ({ ...view, threads: { ...s.threads, [sessionId]: view } }));
      } catch (e) {
        if (seq !== loadSeq || epoch !== generation || useAuthStore.getState().token !== token) return;
        const err = e as ApiError;
        set({ loading: false, error: err?.message ?? "加载消息失败" });
        if (err?.isUnauthorized) useAuthStore.getState().forceLogout();
      }
    },
    send: async (content, skillIds) => {
      const token = useAuthStore.getState().token;
      const ws = useWorkspaceStore.getState();
      const sessionId = ws.activeSessionId;
      const projectId = ws.activeProjectId;
      if (!token || !sessionId || !content.trim()) return;
      const previous = get().threads[sessionId] ?? (get().activeChatId === sessionId ? get() : blank());
      if (previous.isStreaming) { toast.info("这个会话正在生成回复"); return; }
      if (get().activeChatId === sessionId && get().loading) return;
      const epoch = generation;
      ++loadSeq;
      const stamp = new Date().toISOString();
      const assistantId = "local-a-" + nanoid(8);
      const user: Message = { id: "local-u-" + nanoid(8), sessionId, role: "user", blocks: [{ type: "text", text: content.trim() }], status: "done", createdAt: stamp, model: null, usage: null };
      const assistant: Message = { id: assistantId, sessionId, role: "assistant", blocks: [], status: "streaming", createdAt: stamp, model: null, usage: null };
      const view: Conversation = { ...previous, loading: false, messages: [...previous.messages, user, assistant], streamingId: assistantId, isStreaming: true, error: null };
      set(s => ({ ...view, activeChatId: sessionId, threads: { ...s.threads, [sessionId]: view } }));
      status(sessionId, "streaming");
      try {
        const final = await api.sendMessage(token, sessionId, { content: content.trim(), skills: skillIds ?? null });
        if (epoch !== generation || useAuthStore.getState().token !== token) return;
        update(sessionId, current => ({ ...current, messages: current.messages.map(m => m.id === assistantId ? { ...final, id: assistantId } : m), streamingId: null, isStreaming: false, lastUsage: final.usage }));
        status(sessionId, final.status === "error" ? "error" : "idle", get().threads[sessionId]?.messages.length);
        if (projectId) void useWorkspaceStore.getState().loadSessions(projectId).catch(() => {});
      } catch (e) {
        if (epoch !== generation || useAuthStore.getState().token !== token) return;
        const err = e as ApiError;
        const message = err?.message || "请求失败";
        update(sessionId, current => ({ ...current, messages: current.messages.map(m => m.id === assistantId ? {
          ...m, status: "error", blocks: m.blocks.length ? m.blocks : [{ type: "text", text: message }],
        } : m), streamingId: null, isStreaming: false, error: message }));
        status(sessionId, "error");
        if (err?.isUnauthorized) useAuthStore.getState().forceLogout();
      }
    },
    stop: async () => {
      const sessionId = get().activeChatId;
      if (!sessionId || !get().threads[sessionId]?.isStreaming) return;
      try { await api.stopGeneration(sessionId); }
      catch (e) { toast.error("停止失败", (e as ApiError)?.message); }
    },
    applyEvent: ({ sessionId, event }) => {
      const view = get().threads[sessionId];
      if (!view?.streamingId) return;
      update(sessionId, current => ({
        ...current,
        messages: current.messages.map(m => m.id !== current.streamingId ? m : {
          ...m, blocks: applyStreamEvent(m.blocks, event),
          ...(event.type === "start" ? { model: event.model } : {}),
          ...(event.type === "done" ? { usage: event.usage } : {}),
          ...(event.type === "error" ? { status: "error" as const } : {}),
        }),
        lastUsage: event.type === "done" ? event.usage : current.lastUsage,
      }));
    },
    clear: () => { ++loadSeq; set({ ...blank(), activeChatId: null }); },
    reset: () => { ++loadSeq; ++generation; set({ ...blank(), activeChatId: null, threads: {} }); },
  };
});
