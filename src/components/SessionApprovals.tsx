import { useEffect, useRef, useState } from "react";
import { ShieldQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/Modal";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { useWorkspaceStore } from "@/store/workspace";
import { toast } from "@/store/ui";
import type { SessionApproval } from "@/types";

export function SessionApprovals() {
  const sessionId = useWorkspaceStore(s => s.activeSessionId);
  const token = useAuthStore(s => s.token);
  const remote = useSettingsStore(s => s.settings?.backendMode === "remote");
  const [view, setView] = useState<{session: string | null; requests: SessionApproval[]; error: string | null}>({session: null, requests: [], error: null});
  const submitting = useRef(false);
  const resolved = useRef(new Set<string>());
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    resolved.current = new Set();
    setView({session: sessionId, requests: [], error: null});
    if (!sessionId || !token || !remote) return;
    const poll = async () => {
      try {
        const requests = await api.listSessionApprovals(token, sessionId);
        if (!disposed) setView({session: sessionId, requests: requests.filter(r => !resolved.current.has(r.id)), error: null});
      } catch (error) {
        if (!disposed) setView(v => ({...v, error: `无法读取待审批操作：${(error as Error).message}`}));
      } finally { if (!disposed) timer = setTimeout(() => void poll(), 2000); }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [sessionId, token, remote]);
  const decide = async (request: SessionApproval, decision: "allow" | "deny") => {
    if (!token || !sessionId || submitting.current || request.sessionId !== sessionId) return;
    submitting.current = true;
    setBusy(request.id);
    try {
      const response = await api.resolveSessionApproval(token, sessionId, request.id, decision);
      if (useAuthStore.getState().token !== token) return;
      if (response.status === "pending") throw new Error("审批尚未完成，请稍后重试");
      resolved.current.add(request.id);
      setView(v => v.session === sessionId ? {...v, requests: v.requests.filter(r => r.id !== request.id)} : v);
      if (response.status === "allowed") toast.success("已允许本次操作，模型将继续执行");
      else if (response.status === "timeout") toast.info("审批已超时，模型已收到拒绝；可发消息让模型重试");
      else toast.info("已拒绝本次操作");
    } catch (error) { toast.error("提交审批失败", (error as Error).message); }
    finally { submitting.current = false; setBusy(null); }
  };
  if (!remote || view.session !== sessionId || (!view.requests.length && !view.error)) return null;
  return <section aria-label="待审批操作" className="chat-column max-h-[42vh] shrink-0 space-y-3 overflow-y-auto py-3">
    {view.error && <p role="alert" className="text-[12px] text-err">{view.error}</p>}
    {view.requests.map(request => <article key={request.id} className="rounded-xl border border-accent/50 bg-surface p-4">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold"><ShieldQuestion size={16} className="text-accent" />需要你的确认</h3>
      <p className="mt-1 text-[12px] leading-5 text-dim">模型正在等待以下操作获准。请检查完整命令后，选择允许本次或拒绝。</p>
      {request.reason && <p className="mt-2 text-[12px] text-dim">原因：{request.reason}</p>}
      {request.cwd && <p className="mt-2 break-all text-[11px] text-faint">执行目录：{request.cwd}</p>}
      <pre data-selectable className="my-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-bg-deep p-3 text-[12px] leading-5">{request.command}</pre>
      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[11px] text-faint">审批截止：{new Date(request.expiresAt).toLocaleTimeString()}</span><div className="flex gap-2">
        <Button type="button" disabled={busy !== null} onClick={() => void decide(request, "deny")}>拒绝</Button>
        <Button type="button" variant="primary" disabled={busy !== null} onClick={() => void decide(request, "allow")}>{busy === request.id ? "提交中…" : "允许本次"}</Button>
      </div></div>
    </article>)}
  </section>;
}
