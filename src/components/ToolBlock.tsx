import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, X, FileText, Terminal, Search, Wrench, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { duration } from "@/lib/format";
import { toolHeadline, toolInputText } from "@/lib/blocks";
import { useUiStore } from "@/store/ui";
import { desktopTransition } from "@/lib/motion";
import type { ContentBlock } from "@/types";

type ToolData = Extract<ContentBlock, { type: "tool_use" }>;
const ICONS = { Read: FileText, Write: FileText, Edit: Wrench, Bash: Terminal, Grep: Search, Glob: Search };

export function ToolBlock({ tool }: { tool: ToolData }) {
  const [open, setOpen] = useState(false);
  const verbose = useUiStore(s => s.verbose);
  const expanded = open || verbose;
  const running = tool.status === "running" || tool.status === "pending";
  const Icon = ICONS[tool.name as keyof typeof ICONS] ?? Wrench;
  const summary = tool.result?.split("\n").find(l => l.trim()) ?? (running ? "运行中…" : tool.status === "error" ? "执行失败" : "已完成");
  return <div className="my-2 overflow-hidden rounded-lg border border-line bg-surface/40">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={expanded} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-2">
      <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={desktopTransition} className="shrink-0 text-faint"><ChevronRight size={13} /></motion.span>
      <Icon size={14} className="shrink-0 text-dim" />
      <span className="min-w-0 flex-1"><span className="block truncate text-[12px] text-dim">{toolHeadline(tool.name, tool.input)}</span><span className={cn("mt-0.5 block truncate text-[11px]", tool.status === "error" ? "text-err" : "text-faint")}>{summary}</span></span>
      {tool.durationMs > 0 && <span className="shrink-0 text-[10px] text-faint">{duration(tool.durationMs)}</span>}
      {running ? <Loader2 size={13} className="shrink-0 animate-spin text-accent" /> : tool.status === "error" ? <X size={13} className="shrink-0 text-err" /> : <Check size={13} className="shrink-0 text-faint" />}
    </button>
    <AnimatePresence initial={false}>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={desktopTransition} className="overflow-hidden">
      <div className="border-t bg-code-bg px-4 py-3" data-selectable><p className="mb-2 text-[10px] text-faint">输入</p><pre className="tool-output max-h-60 overflow-auto">{toolInputText(tool.input)}</pre></div>
      {tool.result !== null && <div className="border-t bg-code-bg px-4 py-3" data-selectable><p className="mb-2 text-[10px] text-faint">{tool.status === "error" ? "错误" : "输出"}</p><pre className={cn("tool-output max-h-80 overflow-auto", tool.status === "error" && "text-err")}>{tool.result}</pre></div>}
    </motion.div>}</AnimatePresence>
  </div>;
}
