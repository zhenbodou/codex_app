import { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Folder, Activity, X, Layers } from "lucide-react";
import { useUiStore } from "@/store/ui";
import { useWorkspaceStore } from "@/store/workspace";
import { useChatStore } from "@/store/chat";
import { useSettingsStore } from "@/store/settings";
import { desktopTransition } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function SessionDetails() {
  const open = useUiStore(s => s.detailsOpen);
  const toggle = useUiStore(s => s.toggleDetails);
  const project = useWorkspaceStore(s => s.projects.find(p => p.id === s.activeProjectId));
  const messages = useChatStore(s => s.messages);
  const model = useSettingsStore(s => s.settings?.model);
  const models = useSettingsStore(s => s.models);
  const [width, setWidth] = useState(300);
  const [contextOpen, setContextOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(true);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const usage = [...messages].reverse().find(m => m.usage)?.usage;
  const used = usage ? usage.inputTokens + usage.cacheReadTokens + usage.outputTokens : 0;
  const total = models.find(m => m.id === model)?.contextWindow ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;
  const tools = messages.flatMap(m => m.blocks.filter(b => b.type === "tool_use"));
  return <AnimatePresence initial={false}>{open && <motion.aside aria-label="会话详情" initial={{ width: 0, opacity: 0 }} animate={{ width, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={desktopTransition} className="session-details">
    <div role="separator" aria-label="调整详情面板宽度" aria-orientation="vertical" aria-valuemin={260} aria-valuemax={460} aria-valuenow={width} tabIndex={0} className="pane-resizer"
      onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setWidth(w => Math.max(260, Math.min(460, w + (e.key === "ArrowLeft" ? 20 : -20)))); } }}
      onPointerDown={e => { drag.current = { x: e.clientX, width }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { if (drag.current) setWidth(Math.max(260, Math.min(460, drag.current.width + drag.current.x - e.clientX))); }}
      onPointerUp={e => { drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }} onPointerCancel={() => { drag.current = null; }} />
    <div className="flex h-12 shrink-0 items-center justify-between border-b px-4"><span className="text-[12px] font-medium">会话详情</span><button type="button" className="desktop-icon" onClick={toggle} aria-label="关闭会话详情"><X size={15} /></button></div>
    <div className="min-h-0 overflow-y-auto p-3">
      <section className="details-card">
        <div className="flex items-center gap-2 text-[12px] text-dim"><Folder size={14} />项目</div>
        <p className="mt-3 truncate text-[13px]">{project?.name ?? "尚未选择项目"}</p>
        <p className="mt-1 break-all text-[11px] text-faint" data-selectable>{project?.path ?? "在输入区选择一个项目文件夹。"}</p>
      </section>
      <section className="details-card">
        <button type="button" className="flex w-full items-center gap-2 text-[12px] text-dim" onClick={() => setContextOpen(!contextOpen)} aria-expanded={contextOpen}><Layers size={14} />上下文<span className="ml-auto">{total ? `${percent}%` : "—"}</span><ChevronDown size={13} className={cn("transition-transform", !contextOpen && "-rotate-90")} /></button>
        {contextOpen && <div className="mt-4"><div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-[11px] text-faint">{used.toLocaleString()} / {total ? total.toLocaleString() : "未知"} tokens</p><p className="mt-3 text-[11px] text-faint">{models.find(m => m.id === model)?.name ?? model ?? "尚未选择模型"}</p></div>}
      </section>
      <section className="details-card">
        <button type="button" className="flex w-full items-center gap-2 text-[12px] text-dim" onClick={() => setToolsOpen(!toolsOpen)} aria-expanded={toolsOpen}><Activity size={14} />工具活动<span className="ml-auto text-faint">{tools.length}</span><ChevronDown size={13} className={cn("transition-transform", !toolsOpen && "-rotate-90")} /></button>
        {toolsOpen && <div className="mt-3 space-y-2">{!tools.length ? <p className="text-[11px] text-faint">工具运行后，活动会显示在这里。</p> : tools.map(t => <div key={t.id} className="flex items-center gap-2 text-[12px]"><span className={cn("h-1.5 w-1.5 rounded-full", t.status === "error" ? "bg-err" : t.status === "success" ? "bg-ok" : "bg-accent")} /><span className="truncate">{t.name}</span><span className="ml-auto text-[10px] text-faint">{{ success: "已完成", error: "失败", pending: "等待中", running: "运行中" }[t.status]}</span></div>)}</div>}
      </section>
    </div>
  </motion.aside>}</AnimatePresence>;
}
