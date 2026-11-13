import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Square, Plus, X, Folder, Monitor, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useChatStore } from "@/store/chat";
import { useSkillsStore } from "@/store/skills";
import { useWorkspaceStore } from "@/store/workspace";
import { MODE_LABEL, useUiStore, type UiMode } from "@/store/ui";
import { SkillIcon } from "@/components/SkillIcon";
import { ModelMenu } from "@/components/ChatHeader";
import { StatusLine } from "@/components/StatusLine";
import { usePopup } from "@/lib/usePopup";
import { desktopTransition } from "@/lib/motion";

export function Composer() {
  const value = useUiStore(s => s.composerDraft);
  const setValue = useUiStore(s => s.setComposerDraft);
  const uiMode = useUiStore(s => s.uiMode);
  const openProjectDialog = useUiStore(s => s.openProjectDialog);
  const setSkillsOpen = useUiStore(s => s.setSkillsOpen);
  const project = useWorkspaceStore(s => s.projects.find(p => p.id === s.activeProjectId));
  const projects = useWorkspaceStore(s => s.projects);
  const streaming = useChatStore(s => s.isStreaming);
  const loading = useChatStore(s => s.loading);
  const usage = useChatStore(s => s.lastUsage);
  const skills = useSkillsStore(s => s.skills);
  const selected = useSkillsStore(s => s.selected);
  const toggleSelected = useSkillsStore(s => s.toggleSelected);
  const [menu, setMenu] = useState<"folder" | "mode" | null>(null);
  const [creating, setCreating] = useState(false);
  const [slashClosed, setSlashClosed] = useState(false);
  const [cursor, setCursor] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const query = value.startsWith("/") ? value.slice(1).split(/\s/)[0].toLowerCase() : null;
  const matches = query === null ? [] : skills.filter(s => s.enabled && (s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query))).slice(0, 8);
  const slashOpen = !slashClosed && matches.length > 0;
  useEffect(() => { setSlashClosed(false); setCursor(0); }, [query]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(96, Math.min(el.scrollHeight, 280)) + "px";
    el.style.overflowY = el.scrollHeight > 280 ? "auto" : "hidden";
  }, [value]);
  useEffect(() => { if (value) ta.current?.focus(); }, [value]);
  usePopup(popup, menu !== null, () => setMenu(null));
  useEffect(() => { const show = () => setMenu("mode"); window.addEventListener("composer-mode-menu", show); return () => window.removeEventListener("composer-mode-menu", show); }, []);
  const pick = (id: string) => {
    toggleSelected(id);
    setValue(value.replace(/^\/\S*\s*/, ""));
    setSlashClosed(true);
    ta.current?.focus();
  };
  const submit = async () => {
    const text = value.trim();
    if (!text || streaming || loading || sending.current) return;
    const ws = useWorkspaceStore.getState();
    if (!ws.activeProjectId) { openProjectDialog(null); return; }
    if (!ws.activeSessionId && project?.kind === "algorithm") {
      ws.startNewSession(ws.activeProjectId);
      return;
    }
    sending.current = true;
    setCreating(true);
    try {
      if (!ws.activeSessionId) {
        const session = await ws.createSession(ws.activeProjectId);
        if (!session) return;
        const current = useWorkspaceStore.getState();
        if (current.activeProjectId !== ws.activeProjectId || current.activeSessionId !== session.id) return;
      }
      setValue("");
      setSlashClosed(true);
      void useChatStore.getState().send(text, selected.length ? selected : undefined);
    } catch { /* The workspace and chat stores report errors. */ }
    finally { sending.current = false; setCreating(false); }
  };
  const keyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (slashOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setCursor(c => (c + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length); return; }
      if (e.key === "Enter" && !e.shiftKey || e.key === "Tab" && !e.shiftKey) { e.preventDefault(); pick(matches[Math.min(cursor, matches.length - 1)].id); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSlashClosed(true); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
  };
  return <div ref={box} className="composer-wrap">
    <div className="composer-inner">
      <AnimatePresence>{streaming && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={desktopTransition} className="overflow-hidden"><StatusLine tokens={usage ? usage.inputTokens + usage.outputTokens : 0} /></motion.div>}</AnimatePresence>
      <div className="relative">
        <AnimatePresence>{slashOpen && <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={desktopTransition} className="desktop-menu absolute bottom-full left-0 right-0 z-30 mb-2 p-1" role="listbox" aria-label="技能">
          {matches.map((s, i) => <button key={s.id} type="button" role="option" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => pick(s.id)} className={cn("desktop-menu-item", i === cursor && "bg-surface-2")}><SkillIcon name={s.icon} size={14} /><span>/{s.name}</span><span className="min-w-0 flex-1 truncate text-[11px] text-faint">{s.description}</span>{selected.includes(s.id) && <Check size={13} />}</button>)}
        </motion.div>}</AnimatePresence>
        <div className="desktop-composer">
          {selected.length > 0 && <div className="flex flex-wrap gap-1.5 px-4 pt-3">{skills.filter(s => selected.includes(s.id)).map(s => <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border bg-surface-2 px-2 py-1 text-[11px] text-dim"><SkillIcon name={s.icon} size={12} />{s.name}<button type="button" onClick={() => toggleSelected(s.id)} aria-label={"移除技能 " + s.name}><X size={12} /></button></span>)}</div>}
          <textarea ref={ta} value={value} onChange={e => setValue(e.target.value)} onKeyDown={keyDown} rows={3} spellCheck={false} aria-label="给 Megvii Code 的任务" placeholder="你想要完成什么？" data-selectable className="composer-textarea" />
          <div className="composer-toolbar">
            <button type="button" className="desktop-icon" onClick={() => setSkillsOpen(true)} aria-label="添加技能" title="添加技能"><Plus size={18} /></button>
            <div ref={menu === "folder" ? popup : undefined} className="relative min-w-0">
              <button type="button" className="composer-control" onClick={() => setMenu(menu === "folder" ? null : "folder")} aria-expanded={menu === "folder"} aria-haspopup="menu" title={project?.path}><Folder size={14} /><span className="max-w-[16ch] truncate">{project?.name ?? "选择文件夹"}</span><ChevronDown size={11} /></button>
              {menu === "folder" && <div role="menu" className="desktop-menu absolute bottom-full left-0 z-40 mb-2 w-64 p-1">{projects.map(p => <button key={p.id} type="button" role="menuitem" className="desktop-menu-item" onClick={() => { useWorkspaceStore.getState().startNewSession(p.id); setMenu(null); }}><Folder size={14} /><span className="truncate">{p.name}</span></button>)}<button type="button" role="menuitem" className="desktop-menu-item border-t" onClick={() => { setMenu(null); openProjectDialog(null); }}><Plus size={14} />添加项目文件夹…</button></div>}
            </div>
            <div ref={menu === "mode" ? popup : undefined} className="relative">
              <button type="button" className="composer-control" onClick={() => setMenu(menu === "mode" ? null : "mode")} aria-expanded={menu === "mode"} aria-haspopup="menu">{MODE_LABEL[uiMode]}<ChevronDown size={11} /></button>
              {menu === "mode" && <div role="menu" className="desktop-menu absolute bottom-full left-0 z-40 mb-2 w-48 p-1">{(["normal", "auto-accept", "plan"] as UiMode[]).map(mode => <button type="button" key={mode} role="menuitemradio" aria-checked={uiMode === mode} className="desktop-menu-item" onClick={() => { useUiStore.setState({ uiMode: mode }); setMenu(null); }}><span className="flex-1">{MODE_LABEL[mode]}</span>{uiMode === mode && <Check size={14} />}</button>)}</div>}
            </div>
            <div className="ml-auto min-w-0"><ModelMenu /></div>
            <motion.button type="button" whileTap={{ scale: 0.95 }} disabled={!streaming && (!value.trim() || creating)} onClick={() => streaming ? void useChatStore.getState().stop() : void submit()} aria-label={streaming ? "停止生成" : "发送"} className={cn("composer-send", streaming && "is-streaming")}>{streaming ? <Square size={12} fill="currentColor" /> : <ArrowUp size={17} strokeWidth={2.2} />}</motion.button>
          </div>
        </div>
      </div>
      <div className="composer-footer"><span className="inline-flex items-center gap-1.5"><Monitor size={12} />本地</span><span className="ml-auto">Megvii Code 可能会出错，请检查重要信息。</span></div>
    </div>
  </div>;
}
