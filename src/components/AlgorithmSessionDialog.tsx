import { useRef, useState } from "react";
import { FileBox, Plus, Trash2, Upload, X } from "lucide-react";
import { nanoid } from "nanoid";
import { Button, Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import { ALGORITHM_PLATFORMS, REPOSITORY_TYPES, buildAlgorithmPrompt, validateAlgorithm, type AlgorithmCard, type AlgorithmSpec, type ModelFile } from "@/lib/algorithm";
import { useAuthStore } from "@/store/auth";
import { useChatStore } from "@/store/chat";
import { useSettingsStore } from "@/store/settings";
import { useSkillsStore } from "@/store/skills";
import { toast, useUiStore } from "@/store/ui";
import { useWorkspaceStore } from "@/store/workspace";
import type { Project } from "@/types";

const newCard = (): AlgorithmCard => ({ id: nanoid(), name: "", description: "" });
const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];

export function AlgorithmSessionDialog() {
  const projectId = useUiStore(s => s.algorithmDialog.projectId);
  const project = useWorkspaceStore(s => s.projects.find(p => p.id === projectId));
  return projectId && project ? <AlgorithmSessionForm key={projectId} project={project} /> : null;
}

function AlgorithmSessionForm({ project }: { project: Project }) {
  const close = useUiStore(s => s.closeAlgorithmDialog);
  const remote = useSettingsStore(s => s.settings?.backendMode !== "mock");
  const busy = useUiStore(s => s.algorithmDialog.busy);
  const [spec, setSpec] = useState<AlgorithmSpec>(() => ({ name: "", cards: [newCard()], platforms: [], repositoryTypes: [], modelLinks: "" }));
  const [files, setFiles] = useState<ModelFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const submitting = useRef(false);
  // Retain imported results if creating a session fails, so retrying doesn't copy weights again.
  const imports = useRef(new Map<string, ModelFile>());
  const setBusy = (value: boolean) => {
    if (useUiStore.getState().algorithmDialog.projectId === project.id) {
      useUiStore.setState({ algorithmDialog: { projectId: project.id, busy: value } });
    }
  };
  const change = (patch: Partial<AlgorithmSpec>) => { setSpec(s => ({ ...s, ...patch })); setError(null); };
  const updateCard = (id: string, patch: Partial<AlgorithmCard>) => change({ cards: spec.cards.map(c => c.id === id ? { ...c, ...patch } : c) });
  const pickFiles = async () => {
    if (busy || submitting.current) return;
    setBusy(true); setStage("选择文件中…");
    try {
      const picked = await api.pickModelFiles();
      setFiles(previous => [...previous, ...picked.filter(file => !previous.some(p => p.path === file.path))]);
    } catch (e) { toast.error("选择模型文件失败", (e as Error).message); }
    finally { setBusy(false); setStage(""); }
  };
  const submit = async () => {
    if (submitting.current || busy) return;
    const invalid = validateAlgorithm(spec);
    if (invalid) { setError(invalid); return; }
    const token = useAuthStore.getState().token;
    if (!token) { setError("登录已过期，请重新登录"); return; }
    submitting.current = true; setBusy(true); setError(null);
    try {
      const pending = files.filter(f => !imports.current.has(f.path));
      if (pending.length) {
        setStage(remote ? "上传模型文件中…" : "导入模型文件中…");
        const imported = await api.importModelFiles(token, project.id, pending.map(f => f.path));
        if (imported.length !== pending.length) throw new Error("模型文件传输不完整，请重新选择文件");
        pending.forEach((file, i) => imports.current.set(file.path, imported[i]));
      }
      if (useAuthStore.getState().token !== token) return;
      const ws = useWorkspaceStore.getState();
      if (!ws.projects.some(p => p.id === project.id && p.kind === "algorithm")) throw new Error("算法仓目录已删除或类型已变更，请重新选择目录");
      const prompt = buildAlgorithmPrompt(spec, files.map(f => imports.current.get(f.path)!));
      setStage("创建会话中…");
      ws.beginSession(project.id);
      const session = await ws.createSession(project.id, `创建算法仓：${spec.name.trim()}`);
      if (!session || useAuthStore.getState().token !== token) return;
      const current = useWorkspaceStore.getState();
      if (current.activeProjectId !== project.id || current.activeSessionId !== session.id) return;
      await useChatStore.getState().loadMessages(session.id);
      if (useAuthStore.getState().token !== token) return;
      // send() records the first message synchronously, then continues streaming after the dialog closes.
      void useChatStore.getState().send(prompt, useSkillsStore.getState().selected);
      setBusy(false);
      close();
    } catch (e) { setError((e as Error).message || "创建算法仓会话失败，请重试"); }
    finally {
      submitting.current = false; setStage("");
      // Don't reopen an already closed dialog when an async operation finishes.
      if (useUiStore.getState().algorithmDialog.projectId === project.id) setBusy(false);
    }
  };
  const preview = buildAlgorithmPrompt(spec, files);
  return <Modal open onClose={close} size="lg" title="新建算法仓会话" subtitle={`工作目录：${project.path}`} footer={<>
    <Button type="button" disabled={busy} onClick={close}>取消</Button>
    <Button type="submit" form="algorithm-session-form" variant="primary" disabled={busy}>{busy ? stage : "创建会话并发送"}</Button>
  </>}>
    <form id="algorithm-session-form" onSubmit={e => { e.preventDefault(); void submit(); }} className="algorithm-form">
      <fieldset disabled={busy} className="space-y-5">
        <label className="algorithm-field"><span>算法仓名称 <span className="text-err">*</span></span><input autoFocus value={spec.name} onChange={e => change({ name: e.target.value })} placeholder="例如：行人分析算法仓" maxLength={100} /></label>
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset className="algorithm-options"><legend>仓类型 <span className="text-err">*</span><small>可多选</small></legend><div>{REPOSITORY_TYPES.map(type => <label key={type}><input type="checkbox" checked={spec.repositoryTypes.includes(type)} onChange={() => change({ repositoryTypes: toggle(spec.repositoryTypes, type) })} />{type}</label>)}</div></fieldset>
          <fieldset className="algorithm-options"><legend>支持平台 <span className="text-err">*</span><small>可多选</small></legend><div>{ALGORITHM_PLATFORMS.map(platform => <label key={platform}><input type="checkbox" checked={spec.platforms.includes(platform)} onChange={() => change({ platforms: toggle(spec.platforms, platform) })} />{platform}</label>)}</div></fieldset>
        </div>
        <section aria-labelledby="algorithm-cards-title" className="space-y-3">
          <div className="flex items-center justify-between gap-3"><h3 id="algorithm-cards-title" className="text-[13px] font-medium">算法卡片 <span className="text-err">*</span></h3><Button type="button" onClick={() => change({ cards: [...spec.cards, newCard()] })}><Plus size={13} className="mr-1 inline" />添加算法卡片</Button></div>
          <p className="text-[12px] text-faint">所选平台均包含以下卡片，每张卡片可分别描述功能。</p>
          {spec.cards.map((card, i) => <div key={card.id} className="algorithm-card">
            <div className="flex items-center justify-between"><span className="text-[11px] text-faint">卡片 {i + 1}</span><button type="button" disabled={spec.cards.length === 1} onClick={() => change({ cards: spec.cards.filter(c => c.id !== card.id) })} aria-label={`删除卡片 ${i + 1}`} className="desktop-icon disabled:opacity-30"><Trash2 size={14} /></button></div>
            <label className="algorithm-field"><span>算法卡片名称 {i + 1}</span><input value={card.name} onChange={e => updateCard(card.id, { name: e.target.value })} placeholder="例如：行人检测" maxLength={100} /></label>
            <label className="algorithm-field"><span>功能描述 {i + 1}</span><textarea value={card.description} onChange={e => updateCard(card.id, { description: e.target.value })} placeholder="描述输入、输出和预期功能，例如：检测视频中的行人，输出位置和置信度" rows={3} /></label>
          </div>)}
        </section>
        <section aria-labelledby="algorithm-models-title" className="space-y-3">
          <div className="flex items-center justify-between gap-3"><h3 id="algorithm-models-title" className="text-[13px] font-medium">模型文件与下载链接</h3><Button type="button" onClick={() => void pickFiles()}><Upload size={13} className="mr-1 inline" />添加模型文件</Button></div>
          <p className="text-[12px] leading-5 text-faint">{remote ? "可选择多个模型文件，也可填写下载链接。提交时会上传到后端 Linux 工作区，并使用服务器路径发送需求。" : "可选择多个模型文件，也可填写下载链接。提交时会导入本机工作目录的 megvii-models 文件夹。"}</p>
          {files.length > 0 && <ul className="space-y-2">{files.map(file => <li key={file.path} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12px]"><FileBox size={15} className="shrink-0 text-dim" /><span className="min-w-0 flex-1 truncate" title={file.path}>{file.name}</span><span className="shrink-0 text-faint">{formatSize(file.size)}</span><button type="button" aria-label={`移除模型 ${file.name}`} onClick={() => setFiles(items => items.filter(f => f.path !== file.path))} className="desktop-icon"><X size={13} /></button></li>)}</ul>}
          <label className="algorithm-field"><span>模型下载链接（可选，每行一条）</span><textarea value={spec.modelLinks} onChange={e => change({ modelLinks: e.target.value })} placeholder={"https://example.com/detector.onnx\nhttps://example.com/classifier.bin"} rows={3} spellCheck={false} /></label>
        </section>
      </fieldset>
      <details className="algorithm-preview"><summary>查看将发送给模型的需求文本</summary><pre>{preview}</pre>{files.length > 0 && <p>{remote ? "当前显示的是待上传文件；提交后会替换为服务器 Linux 路径。" : "提交后会替换为导入后的本机路径。"}</p>}</details>
      {error && <p role="alert" className="rounded-lg border border-err/30 bg-err/10 p-3 text-[12px] text-err">{error}</p>}
    </form>
  </Modal>;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
