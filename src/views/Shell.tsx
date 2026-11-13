import { useEffect, useLayoutEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { SessionDetails } from "@/components/SessionDetails";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { ChatHeader } from "@/components/ChatHeader";
import { MessageList } from "@/components/MessageList";
import { Composer } from "@/components/Composer";
import { AlgorithmSessionDialog } from "@/components/AlgorithmSessionDialog";
import { ProjectDialog } from "@/components/ProjectDialog";
import { SkillsPanel } from "@/components/SkillsPanel";
import { Settings } from "@/components/Settings";
import { Toasts } from "@/components/Toasts";
import { CommandPalette } from "@/components/CommandPalette";
import { initStreamSubscription, useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { useSkillsStore } from "@/store/skills";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

/**
 * 登录后的主界面骨架。
 *
 * 这里负责三件事：拉取初始数据、订阅流式事件、挂全局快捷键。
 * 桌面布局包含会话侧栏、聊天区和可调整宽度的会话详情。
 */
export function Shell() {
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const activeProjectId = useWorkspaceStore(s => s.activeProjectId);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const clear = useChatStore((s) => s.clear);
  const empty = useChatStore(s => s.messages.length === 0 && !s.loading);
  const setDraft = useUiStore(s => s.setComposerDraft);

  /* 初始数据 */
  useEffect(() => {
    void useWorkspaceStore.getState().loadProjects().catch(() => {});
    void useSkillsStore.getState().load();
    void useSettingsStore.getState().load();
  }, []);

  /* 流式事件订阅，整个应用生命周期只订阅一次 */
  useEffect(() => initStreamSubscription(), []);

  /* 切会话时重新拉消息；没有会话就清空 */
  useEffect(() => {
    if (!activeSessionId) { clear(); return; }
    void loadMessages(activeSessionId);
  }, [activeSessionId, loadMessages, clear]);

  useLayoutEffect(() => {
    useUiStore.getState().activateComposer(activeSessionId ? `${activeProjectId}:${activeSessionId}` : `new:${activeProjectId ?? "none"}`);
  }, [activeProjectId, activeSessionId]);

  /* 全局快捷键 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const ui = useUiStore.getState();
      const overlayOpen =
        ui.commandPaletteOpen ||
        ui.shortcutsOpen ||
        ui.settingsOpen ||
        ui.skillsOpen ||
        ui.projectDialog.open ||
        !!ui.algorithmDialog.projectId;

      if (e.key === "Escape") {
        if (!ui.closeTopmost()) void useChatStore.getState().stop();
        return;
      }

      if (!mod || overlayOpen) return;

      if (e.key === "Tab" || (e.shiftKey && (e.code === "BracketLeft" || e.code === "BracketRight"))) {
        const ws = useWorkspaceStore.getState();
        const sessions = Object.values(ws.sessionsByProject).flat();
        if (sessions.length) {
          e.preventDefault();
          const previous = e.key === "Tab" ? e.shiftKey : e.code === "BracketLeft";
          const index = sessions.findIndex(s => s.id === ws.activeSessionId);
          const next = sessions[(index + (previous ? -1 : 1) + sessions.length) % sessions.length];
          ws.selectSession(next.projectId, next.id);
        }
        return;
      }
      if (e.shiftKey && (e.code === "KeyM" || e.code === "KeyI")) {
        e.preventDefault();
        window.dispatchEvent(new Event(e.code === "KeyM" ? "composer-mode-menu" : "composer-model-menu"));
        return;
      }

      switch (e.key.toLowerCase()) {
        case "/":
          e.preventDefault();
          ui.setShortcutsOpen(true);
          break;
        case "\\":
          if (ui.detailsOpen) { e.preventDefault(); ui.toggleDetails(); }
          break;
        case "o":
          e.preventDefault();
          ui.setTranscriptView(ui.transcriptView === "normal" ? "thinking" : ui.transcriptView === "thinking" ? "verbose" : "normal");
          break;
        case "k":
          e.preventDefault();
          ui.setCommandPaletteOpen(!ui.commandPaletteOpen);
          break;
        case ",":
          e.preventDefault();
          ui.setSettingsOpen(true);
          break;
        case "b":
          e.preventDefault();
          ui.toggleSidebar();
          break;
        case "n": {
          e.preventDefault();
          useWorkspaceStore.getState().startNewSession();
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="desktop-shell flex h-screen w-screen overflow-hidden bg-bg">
      <Sidebar />

      <main className={empty ? "chat-workspace is-empty" : "chat-workspace"}>
        <ChatHeader />
        <div className="conversation-body"><MessageList onSend={setDraft} /><Composer /></div>
      </main>
      <SessionDetails />

      {/* 浮层 */}
      <ProjectDialog />
      <AlgorithmSessionDialog />
      <SkillsPanel />
      <Settings />
      <CommandPalette />
      <KeyboardShortcuts />
      <Toasts />
    </div>
  );
}
