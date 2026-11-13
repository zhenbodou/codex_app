import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, FolderOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { api, ApiError } from "@/lib/api";
import { toast, useUiStore } from "@/store/ui";
import { useWorkspaceStore } from "@/store/workspace";
import { Button, Modal } from "@/components/Modal";
import { PROJECT_COLORS, type ProjectKind } from "@/types";

/**
 * 新建 / 编辑项目弹窗。
 *
 * 通过 `projectDialog.editingId` 判断模式：为 null 是新建。
 * 目录选择走 Rust 侧的 `pick_directory` 命令，因为 WebView 里拿不到真实路径。
 */
export function ProjectDialog() {
  const open = useUiStore((s) => s.projectDialog.open);
  const editingId = useUiStore((s) => s.projectDialog.editingId);
  const close = useUiStore((s) => s.closeProjectDialog);

  const projects = useWorkspaceStore((s) => s.projects);
  const createProject = useWorkspaceStore((s) => s.createProject);
  const updateProject = useWorkspaceStore((s) => s.updateProject);
  const deleteProject = useWorkspaceStore((s) => s.deleteProject);

  const editing = editingId ? projects.find((p) => p.id === editingId) : null;

  const [kind, setKind] = useState<ProjectKind>("normal");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(editing?.kind ?? "normal");
    setName(editing?.name ?? "");
    setPath(editing?.path ?? "");
    setDescription(editing?.description ?? "");
    setColor(editing?.color ?? PROJECT_COLORS[0]);
    setTouched(false);
  }, [open, editing]);

  const nameError = touched && !name.trim() ? "请填写项目名称" : null;
  const pathError = touched && !path.trim() ? "请选择项目目录" : null;

  const browse = async () => {
    try {
      const picked = await api.pickDirectory();
      if (picked) {
        setPath(picked);
        // 目录名当默认项目名，省得再打一遍
        if (!name.trim()) {
          const guess = picked.split(/[\\/]/).filter(Boolean).pop();
          if (guess) setName(guess);
        }
      }
    } catch (e) {
      toast.error("无法打开目录选择器", (e as ApiError)?.message);
    }
  };

  const submit = async () => {
    setTouched(true);
    if (!name.trim() || !path.trim()) return;

    setBusy(true);
    try {
      if (editing) {
        await updateProject(editing.id, {
          kind,
          name: name.trim(),
          path: path.trim(),
          description: description.trim() || null,
          color,
        });
      } else {
        await createProject({
          kind,
          name: name.trim(),
          path: path.trim(),
          description: description.trim() || undefined,
          color,
        });
      }
      close();
    } catch {
      // store 内部已经弹过 toast 了
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={editing ? "编辑项目" : "新建项目"}
      subtitle={
        editing
          ? "修改项目的基本信息"
          : "项目对应一个本地代码目录，会话都挂在项目下面"
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {editing ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`删除项目「${editing.name}」及其全部会话？`)) {
                  void deleteProject(editing.id).then(close);
                }
              }}
            >
              <Trash2 size={13} />
              删除
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={busy}>
              {busy ? "保存中…" : editing ? "保存" : "创建项目"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-[12px] text-dim">目录类型</legend>
          <div className="grid grid-cols-2 gap-3">
            {([['normal', '普通目录', '直接创建会话，与模型聊天'], ['algorithm', '算法仓目录', '新建会话时填写算法仓需求']] as const).map(([value, title, hint]) => (
              <label key={value} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-3", kind === value ? "border-accent bg-accent/10" : "border-line")}>
                <input type="radio" name="project-kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1 accent-accent" />
                <span><span className="block text-[13px]">{title}</span><span className="mt-1 block text-[11px] text-faint">{hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="项目名称" error={nameError}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="例如 claude-code-desktop"
            data-selectable
            className={inputCls(!!nameError)}
          />
        </Field>

        <Field label="本地目录" error={pathError} hint="会话中的文件操作都相对于这个目录">
          <div className="flex gap-2">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="D:\code\my-project"
              data-selectable
              className={cn(inputCls(!!pathError), "font-mono text-[12.5px]")}
            />
            <Button variant="ghost" type="button" onClick={() => void browse()}>
              <FolderOpen size={13} />
              浏览
            </Button>
          </div>
        </Field>

        <Field label="描述" hint="可选">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="这个项目是做什么的"
            data-selectable
            className={cn(inputCls(false), "resize-none leading-5")}
          />
        </Field>

        <Field label="标记颜色">
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <motion.button
                key={c}
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => setColor(c)}
                aria-label={`选择颜色 ${c}`}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
                  color === c ? "ring-2 ring-offset-2 ring-offset-surface" : "opacity-65 hover:opacity-100",
                )}
                style={{ background: c, ...(color === c ? { ["--tw-ring-color" as string]: c } : {}) }}
              >
                <AnimatePresence>
                  {color === c && (
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                    >
                      <Check size={14} className="text-black/65" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            ))}
          </div>
        </Field>

        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "w-full rounded-lg border bg-bg-deep px-3 py-2 text-[13px] text-text outline-none transition-colors",
    "placeholder:text-faint",
    hasError
      ? "border-err/60 focus:border-err"
      : "border-line focus:border-accent/60 focus:shadow-[0_0_0_3px_var(--accent-soft)]",
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] tracking-wide text-dim uppercase">
          {label}
        </span>
        {hint && !error && (
          <span className="text-[11px] text-faint">{hint}</span>
        )}
      </span>
      {children}
      <AnimatePresence>
        {error && (
          <motion.span
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="block overflow-hidden text-[11.5px] text-err"
          >
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </label>
  );
}
