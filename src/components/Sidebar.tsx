import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Code2, Keyboard, PanelLeft, Plus, Search, SlidersHorizontal, Folder, ChevronRight, MoreHorizontal, Settings, Sparkles, LogOut, Check, Circle, Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { ClaudeMark } from "@/components/ClaudeMark";
import { initials, relativeTime } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { useUiStore } from "@/store/ui";
import { usePopup } from "@/lib/usePopup";
import { desktopTransition } from "@/lib/motion";
import type { Session } from "@/types";

export function Sidebar() {
  const collapsed = useUiStore(s => s.sidebarCollapsed);
  const toggle = useUiStore(s => s.toggleSidebar);
  const projects = useWorkspaceStore(s => s.projects);
  const buckets = useWorkspaceStore(s => s.sessionsByProject);
  const activeId = useWorkspaceStore(s => s.activeSessionId);
  const activeProject = useWorkspaceStore(s => s.activeProjectId);
  const loading = useWorkspaceStore(s => s.loadingProjects);
  const user = useAuthStore(s => s.user);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [filters, setFilters] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    const ws = useWorkspaceStore.getState();
    for (const p of projects) if (!ws.sessionsByProject[p.id]) void ws.loadSessions(p.id).catch(() => {});
  }, [projects]);
  const visible = useMemo(() => projects.map(p => ({
    project: p,
    sessions: (buckets[p.id] ?? []).filter(s => (status === "all" || s.status === status) && (s.title + " " + p.name).toLowerCase().includes(query.toLowerCase()))
  })).filter(group => !query && status === "all" || group.sessions.length > 0), [projects, buckets, query, status]);
  return <motion.aside initial={false} animate={{ width: collapsed ? 0 : 280, opacity: collapsed ? 0 : 1 }} transition={desktopTransition} className="desktop-sidebar" inert={collapsed}>
    <div className="sidebar-content">
      <div className="flex h-14 items-center px-4">
        <ClaudeMark className="h-8 w-8" />
        <button type="button" onClick={toggle} className="desktop-icon ml-auto" title="收起侧边栏" aria-label="收起侧边栏"><PanelLeft size={17} /></button>
      </div>
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] font-medium"><Code2 size={16} />Code<span className="ml-auto text-[10px] font-normal text-faint">桌面工作区</span></div>
      <button type="button" className="sidebar-new" onClick={() => { useWorkspaceStore.getState().startNewSession(); }}><Plus size={16} />新建会话<span className="ml-auto text-[11px] text-faint">Ctrl+N</span></button>
      <div className="mx-3 mt-4 flex items-center gap-2">
        <div className="sidebar-search"><Search size={14} /><input aria-label="搜索会话" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索会话" /></div>
        <button type="button" className={cn("desktop-icon", filters && "bg-surface-2")} onClick={() => setFilters(!filters)} title="筛选会话" aria-label="筛选会话" aria-expanded={filters}><SlidersHorizontal size={15} /></button>
      </div>
      {filters && <div className="mx-4 mt-2 flex items-center gap-2 text-[11px] text-dim"><label htmlFor="session-status">状态</label><select id="session-status" value={status} onChange={e => setStatus(e.target.value)} className="min-w-0 flex-1 rounded border bg-surface px-2 py-1"><option value="all">所有会话</option><option value="streaming">运行中</option><option value="idle">已完成</option><option value="error">需要关注</option></select></div>}
      <div className="mb-1 mt-5 flex items-center px-5 text-[11px] text-faint"><span>项目与会话</span><button type="button" className="ml-auto rounded p-1 hover:text-text" onClick={() => useUiStore.getState().openProjectDialog(null)} title="添加项目" aria-label="添加项目"><Plus size={13} /></button></div>
      <nav aria-label="项目与会话" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {loading && !projects.length && <div className="flex justify-center p-8"><Loader2 size={16} className="animate-spin text-faint" /></div>}
        {!loading && !projects.length && <button type="button" className="mx-2 mt-3 w-[calc(100%-16px)] rounded-lg border border-dashed p-4 text-[12px] text-dim hover:bg-surface-2" onClick={() => useUiStore.getState().openProjectDialog(null)}>选择项目文件夹，开始工作</button>}
        {projects.length > 0 && !visible.length && <p className="p-5 text-center text-[12px] text-faint">没有匹配的会话</p>}
        {visible.map(({ project, sessions }) => <section key={project.id} className="mb-3">
          <div className="group flex items-center gap-1 px-2 py-1">
            <button type="button" aria-label={hidden.includes(project.id) ? "展开项目 " + project.name : "折叠项目 " + project.name} aria-expanded={!hidden.includes(project.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12px] text-dim" onClick={() => setHidden(h => h.includes(project.id) ? h.filter(id => id !== project.id) : [...h, project.id])}><ChevronRight size={11} className={cn("shrink-0 transition-transform", !hidden.includes(project.id) && "rotate-90")} /><Folder size={13} className="shrink-0" /><span className="truncate">{project.name}</span>{project.kind === "algorithm" && <span className="shrink-0 rounded bg-accent/10 px-1 text-[9px] text-accent">算法仓</span>}</button>
            <button type="button" className="desktop-icon h-6! w-6!" aria-label={"编辑项目 " + project.name} title="编辑项目" onClick={() => useUiStore.getState().openProjectDialog(project.id)}><MoreHorizontal size={14} /></button>
            <button type="button" className="desktop-icon h-6! w-6!" aria-label={"在 " + project.name + " 新建会话"} title="新建会话" onClick={() => { useWorkspaceStore.getState().startNewSession(project.id); }}><Plus size={14} /></button>
          </div>
          {!hidden.includes(project.id) && <div className="mt-1 space-y-0.5">
            {sessions.map(s => <SessionRow key={s.id} session={s} active={s.id === activeId} />)}
            {!sessions.length && <button type="button" className={cn("session-row text-faint", activeProject === project.id && !activeId && "bg-surface-2")} onClick={() => useWorkspaceStore.getState().startNewSession(project.id)}><Plus size={13} /><span>开始新会话</span></button>}
          </div>}
        </section>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="flex items-center"><button type="button" className="sidebar-bottom-link" onClick={() => useUiStore.getState().setSkillsOpen(true)}><Sparkles size={15} />技能</button><button type="button" className="desktop-icon" aria-label="键盘快捷键" onClick={() => useUiStore.getState().setShortcutsOpen(true)}><Keyboard size={16} /></button></div>
        <div className="flex items-center gap-2 px-1 pt-2">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2" onClick={() => useUiStore.getState().setSettingsOpen(true)}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px]">{initials(user?.name ?? "?")}</span><span className="min-w-0 text-left"><span className="block truncate text-[12px]">{user?.name}</span><span className="block text-[10px] text-faint">{user?.plan.toUpperCase()}</span></span></button>
          <button type="button" className="desktop-icon" aria-label="设置" onClick={() => useUiStore.getState().setSettingsOpen(true)}><Settings size={15} /></button>
          <button type="button" className="desktop-icon" aria-label="退出登录" onClick={() => void useAuthStore.getState().logout()}><LogOut size={14} /></button>
        </div>
      </div>
    </div>
  </motion.aside>;
}

function SessionRow({ session, active }: { session: Session; active: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [menu, setMenu] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  usePopup(popup, menu, () => setMenu(false));
  const rename = () => { setEditing(false); if (title.trim() && title.trim() !== session.title) void useWorkspaceStore.getState().renameSession(session.id, title.trim()); };
  return <div ref={popup} className={cn("session-row group/session relative", active && "is-active")}>
    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => useWorkspaceStore.getState().selectSession(session.projectId, session.id)} title={session.title}>
      {session.status === "streaming" ? <Loader2 size={13} className="shrink-0 animate-spin text-accent" /> : session.status === "error" ? <Circle size={12} className="shrink-0 text-err" /> : <Check size={13} className="shrink-0 text-faint" />}
      {!editing && <span className="truncate">{session.title}</span>}
    </button>
    {editing && <input autoFocus aria-label="重命名会话" value={title} onChange={e => setTitle(e.target.value)} onBlur={rename} onKeyDown={e => { if (e.key === "Enter") rename(); if (e.key === "Escape") setEditing(false); }} className="min-w-0 flex-1 rounded border bg-surface px-1 text-[12px]" />}
    <span className="session-time">{relativeTime(session.updatedAt)}</span>
    <button type="button" className="session-more desktop-icon h-5! w-5!" aria-label={"会话操作 " + session.title} aria-expanded={menu} onPointerDown={e => e.stopPropagation()} onClick={() => setMenu(!menu)}><MoreHorizontal size={14} /></button>
    {menu && <div className="desktop-menu absolute right-0 top-full z-40 w-36 p-1" onPointerDown={e => e.stopPropagation()}>
      <button type="button" className="desktop-menu-item" onClick={() => { setMenu(false); setTitle(session.title); setEditing(true); }}><Pencil size={13} />重命名</button>
      <button type="button" className="desktop-menu-item text-err" onClick={() => { setMenu(false); if (window.confirm("删除会话「" + session.title + "」？")) void useWorkspaceStore.getState().deleteSession(session.id); }}><Trash2 size={13} />删除</button>
    </div>}
  </div>;
}
