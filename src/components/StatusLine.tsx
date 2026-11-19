import { useEffect, useState } from "react";
import { useChatStore } from "@/store/chat";
import { cn } from "@/lib/cn";

export function StatusLine({ className }: { tokens: number; className?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const messages = useChatStore(s => s.messages);
  const blocks = messages[messages.length - 1]?.blocks ?? [];
  const tool = [...blocks].reverse().find(b => b.type === "tool_use" && (b.status === "running" || b.status === "pending"));
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className={cn("generation-status", className)}>
    <span className="generation-radar" aria-hidden="true" />
    <span className="min-w-0 truncate" role="status">{tool?.type === "tool_use" ? "正在运行 " + tool.name + "…" : "Megvii Code 正在处理…"}</span>
    <span aria-hidden="true" className="generation-timer">{elapsed}s</span>
    <kbd className="ml-auto shrink-0 text-[10px] text-faint">Esc 停止</kbd>
  </div>;
}
