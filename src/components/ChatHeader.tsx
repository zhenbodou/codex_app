import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Folder, PanelLeft, PanelRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useWorkspaceStore } from "@/store/workspace";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { usePopup } from "@/lib/usePopup";
import { desktopTransition } from "@/lib/motion";

export function ChatHeader() {
  const projectId = useWorkspaceStore(s => s.activeProjectId);
  const projectName = useWorkspaceStore(s => s.projects.find(project => project.id === s.activeProjectId)?.name);
  const sessionId = useWorkspaceStore(s => s.activeSessionId);
  const sessions = useWorkspaceStore(s => s.sessionsByProject);
  const session = projectId ? sessions[projectId]?.find(s => s.id === sessionId) : null;
  const toggleSidebar = useUiStore(s => s.toggleSidebar);
  const sidebarCollapsed = useUiStore(s => s.sidebarCollapsed);
  const detailsOpen = useUiStore(s => s.detailsOpen);
  const toggleDetails = useUiStore(s => s.toggleDetails);
  const view = useUiStore(s => s.transcriptView);
  const setView = useUiStore(s => s.setTranscriptView);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const box = useRef<HTMLDivElement>(null);
  usePopup(box, menu, () => setMenu(false));
  useEffect(() => { setMenu(false); setEditing(false); }, [sessionId]);
  const commit = () => {
    setEditing(false);
    if (session && title.trim() && title.trim() !== session.title) void useWorkspaceStore.getState().renameSession(session.id, title.trim());
  };
  return (
    <header className="desktop-header">
      {sidebarCollapsed && <button type="button" className="desktop-icon" onClick={toggleSidebar} aria-label="切换侧边栏" title="切换侧边栏 · Ctrl+B"><PanelLeft size={17} /></button>}
      <div className="thread-context">
        {projectName && <><span className="thread-project" title={projectName}><Folder size={14} aria-hidden="true" /><span className="truncate">{projectName}</span></span><ChevronRight size={13} className="shrink-0 text-faint" aria-hidden="true" /></>}
        {editing ? (
          <input autoFocus aria-label="会话名称" value={title} onChange={e => setTitle(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} className="min-w-0 rounded border bg-surface px-2 py-1 text-[13px] outline-none" />
        ) : (
          <span className="thread-title truncate" title={session?.title}>{session?.title ?? "新建会话"}</span>
        )}
      </div>
      <div className="thread-drag-region" data-tauri-drag-region />
      <button type="button" className={cn("desktop-icon", detailsOpen && "bg-surface-2 text-text")} onClick={toggleDetails} aria-label="会话详情" aria-pressed={detailsOpen} title="会话详情"><PanelRight size={17} /></button>
      <div ref={box} className="relative">
        <button type="button" className="desktop-icon" aria-label="更多会话操作" aria-haspopup="menu" onClick={() => setMenu(!menu)} aria-expanded={menu}><MoreHorizontal size={18} /></button>
        <AnimatePresence>
          {menu && <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={desktopTransition} className="desktop-menu absolute top-full right-0 z-40 mt-2 w-56 p-1">
            <p className="px-3 py-2 text-[11px] text-faint">会话视图 <span className="float-right">Ctrl+O</span></p>
            {(["normal", "thinking", "verbose"] as const).map(v => <button key={v} role="menuitemradio" aria-checked={view === v} className="desktop-menu-item" onClick={() => { setView(v); setMenu(false); }}><span className="flex-1">{{ normal: "正常", thinking: "显示思考", verbose: "详细" }[v]}</span>{view === v && <Check size={14} />}</button>)}
            {session && <div className="mt-1 border-t pt-1">
              <button role="menuitem" className="desktop-menu-item" onClick={() => { setMenu(false); setTitle(session.title); setEditing(true); }}><Pencil size={14} />重命名</button>
              <button role="menuitem" className="desktop-menu-item text-err" onClick={() => { setMenu(false); if (window.confirm(`删除会话「${session.title}」？`)) void useWorkspaceStore.getState().deleteSession(session.id); }}><Trash2 size={14} />删除会话</button>
            </div>}
          </motion.div>}
        </AnimatePresence>
      </div>
    </header>
  );
}

export function ModelMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const models = useSettingsStore(s => s.models);
  const current = useSettingsStore(s => s.settings?.model);
  const selectModel = useSettingsStore(s => s.selectModel);
  const saving = useSettingsStore(s => s.modelSaving);
  const refreshing=useSettingsStore(s=>s.modelListLoading);
  const refreshModels=useSettingsStore(s=>s.refreshModels);
  usePopup(box, open, () => setOpen(false));
  useEffect(() => { const show = () => setOpen(true); window.addEventListener("composer-model-menu", show); return () => window.removeEventListener("composer-model-menu", show); }, []);
  return <div ref={box} className="relative min-w-0">
    <button type="button" disabled={saving} title="模型切换从下一条消息开始生效" onClick={() => setOpen(!open)} aria-label="选择模型" aria-haspopup="listbox" aria-expanded={open} className="composer-control">
      <span className="max-w-[20ch] truncate">{models.find(m => m.id === current)?.name ?? current ?? "选择模型"}</span><ChevronDown size={12} />
    </button>
    <AnimatePresence>{open && <motion.div role="listbox" aria-label="模型" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={desktopTransition} className="desktop-menu absolute bottom-full right-0 z-40 mb-2 w-72 p-1">
      <p className="px-3 py-2 text-[11px] text-faint">{saving?"正在等待后端保存…":"下一条消息使用所选模型；回复中显示执行确认。"}</p>
      <button type="button" className="desktop-menu-item text-[11px]" disabled={refreshing||saving} onClick={()=>void refreshModels()}>{refreshing?"正在刷新模型…":"刷新模型列表"}</button>
      {!models.length && <p className="p-3 text-[12px] text-faint">没有可用模型，请检查设置。</p>}
      {models.map(m => <button key={m.id} role="option" aria-selected={m.id === current} disabled={saving} onClick={() => { void selectModel(m.id).then(ok=>{if(ok)setOpen(false);}); }} className="desktop-menu-item">
        <span className="min-w-0 flex-1"><span className="block truncate">{m.name}</span><span className="block text-[11px] text-faint">{m.contextWindow>0?`${Math.round(m.contextWindow / 1000)}k 上下文`:m.description || "后端可选模型"}</span></span>
        {m.id === current && <Check size={14} />}
      </button>)}
    </motion.div>}</AnimatePresence>
  </div>;
}
