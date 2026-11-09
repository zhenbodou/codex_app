import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Check,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  Server,
  Sun,
  User as UserIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { compactNumber } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { toast, useUiStore } from "@/store/ui";
import { Button, Modal } from "@/components/Modal";
import { ACCENTS, type Theme } from "@/types";

type TabId = "appearance" | "model" | "account" | "backend" | "usage";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "外观", icon: <Palette size={14} /> },
  { id: "model", label: "模型", icon: <Monitor size={14} /> },
  { id: "account", label: "账户", icon: <UserIcon size={14} /> },
  { id: "backend", label: "后端", icon: <Server size={14} /> },
  { id: "usage", label: "用量", icon: <BarChart3 size={14} /> },
];

/** 设置弹窗。左侧标签导航，右侧对应面板；改动即时保存（乐观更新）。 */
export function Settings() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.setSettingsOpen);
  const loadStats = useSettingsStore((s) => s.loadStats);

  const [tab, setTab] = useState<TabId>("appearance");

  useEffect(() => {
    if (open) void loadStats();
  }, [open, loadStats]);

  return (
    <Modal
      open={open}
      onClose={() => close(false)}
      size="lg"
      title="设置"
      subtitle="所有改动会立即保存"
      footer={
        <div className="flex w-full justify-end">
          <Button variant="primary" onClick={() => close(false)}>
            完成
          </Button>
        </div>
      }
    >
      <div className="flex min-h-[46vh] gap-5">
        {/* 标签栏 */}
        <nav className="w-40 shrink-0 space-y-0.5 border-r border-line pr-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                tab === t.id
                  ? "text-text"
                  : "text-dim hover:bg-surface-2 hover:text-text",
              )}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="settings-tab-bg"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-lg bg-surface-2"
                />
              )}
              <span className={cn("relative", tab === t.id && "text-accent")}>
                {t.icon}
              </span>
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* 面板 */}
        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.16 }}
            >
              {tab === "appearance" && <AppearancePanel />}
              {tab === "model" && <ModelPanel />}
              {tab === "account" && <AccountPanel />}
              {tab === "backend" && <BackendPanel />}
              {tab === "usage" && <UsagePanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── 外观 ─────────────────────────── */

const THEME_OPTS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: "dark", label: "深色", icon: <Moon size={14} /> },
  { value: "light", label: "浅色", icon: <Sun size={14} /> },
  { value: "system", label: "跟随系统", icon: <Monitor size={14} /> },
];

function AppearancePanel() {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  if (!settings) return <Empty />;

  return (
    <div className="space-y-6">
      <Row label="主题" hint="控制整套配色变量">
        <div className="flex gap-1.5">
          {THEME_OPTS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => void patch({ theme: o.value })}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-all",
                settings.theme === o.value
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-surface-2 text-dim hover:text-text",
              )}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </Row>

      <Row label="强调色" hint="影响高亮、选中态与光标">
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <motion.button
              key={a.value}
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => void patch({ accent: a.value })}
              title={a.name}
              aria-label={a.name}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition-all",
                settings.accent.toLowerCase() === a.value.toLowerCase()
                  ? "ring-2 ring-offset-2 ring-offset-surface"
                  : "opacity-70 hover:opacity-100",
              )}
              style={{
                background: a.value,
                ...(settings.accent.toLowerCase() === a.value.toLowerCase()
                  ? { ["--tw-ring-color" as string]: a.value }
                  : {}),
              }}
            >
              {settings.accent.toLowerCase() === a.value.toLowerCase() && (
                <Check size={13} className="text-black/60" strokeWidth={3} />
              )}
            </motion.button>
          ))}
        </div>
      </Row>

      <Row label={`字号 · ${settings.fontSize}px`} hint="根元素字号，影响全局排版密度">
        <input
          type="range"
          min={12}
          max={18}
          step={1}
          value={settings.fontSize}
          onChange={(e) => void patch({ fontSize: Number(e.target.value) })}
          className="w-full max-w-56 accent-[var(--accent)]"
        />
      </Row>

      <Row label="显示思考过程" hint="关闭后思考块不再渲染，回答更清爽">
        <Switch
          checked={settings.showThinking}
          onChange={(v) => void patch({ showThinking: v })}
        />
      </Row>

      <Row label="通知" hint="长任务完成时弹出系统提示">
        <Switch
          checked={settings.notifications}
          onChange={(v) => void patch({ notifications: v })}
        />
      </Row>

      <Row label="提示音">
        <Switch checked={settings.sound} onChange={(v) => void patch({ sound: v })} />
      </Row>
    </div>
  );
}

/* ─────────────────────────── 模型 ─────────────────────────── */

function ModelPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const models = useSettingsStore((s) => s.models);
  const patch = useSettingsStore((s) => s.patch);
  if (!settings) return <Empty />;

  return (
    <div className="space-y-6">
      <Row label="默认模型" hint="新建会话时使用的模型">
        <div className="space-y-1.5">
          {(models.length ? models : [{ id: settings.model, name: settings.model, description: "", contextWindow: 0 }]).map(
            (m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void patch({ model: m.id })}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                  settings.model === m.id
                    ? "border-accent/45 bg-accent-soft"
                    : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-text">{m.name}</span>
                  {m.description && (
                    <span className="mt-0.5 block text-[11px] leading-4 text-dim">
                      {m.description}
                    </span>
                  )}
                </span>
                {settings.model === m.id && (
                  <Check size={14} className="mt-0.5 shrink-0 text-accent" />
                )}
              </button>
            ),
          )}
        </div>
      </Row>

      <Row label={`Temperature · ${settings.temperature.toFixed(1)}`} hint="越高越发散，越低越保守">
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={settings.temperature}
          onChange={(e) => void patch({ temperature: Number(e.target.value) })}
          className="w-full max-w-56 accent-[var(--accent)]"
        />
      </Row>

      <Row label={`最大输出 token · ${settings.maxTokens}`} hint="单次回复的长度上限">
        <input
          type="range"
          min={1024}
          max={32768}
          step={1024}
          value={settings.maxTokens}
          onChange={(e) => void patch({ maxTokens: Number(e.target.value) })}
          className="w-full max-w-56 accent-[var(--accent)]"
        />
      </Row>

      <Row
        label={`流式速度 · ${settings.streamSpeed}x`}
        hint="仅在本地模拟后端下生效，用于演示"
      >
        <input
          type="range"
          min={1}
          max={8}
          step={1}
          value={settings.streamSpeed}
          onChange={(e) => void patch({ streamSpeed: Number(e.target.value) })}
          className="w-full max-w-56 accent-[var(--accent)]"
        />
      </Row>

      <Row label="自动压缩上下文" hint="接近上下文上限时自动摘要早期对话">
        <Switch
          checked={settings.autoCompact}
          onChange={(v) => void patch({ autoCompact: v })}
        />
      </Row>
    </div>
  );
}

/* ─────────────────────────── 账户 ─────────────────────────── */

function AccountPanel() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const changePassword = useAuthStore((s) => s.changePassword);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user]);

  const dirty = name !== (user?.name ?? "") || email !== (user?.email ?? "");

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() });
      toast.success("资料已更新");
    } catch (e) {
      toast.error("更新失败", (e as Error)?.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const savePwd = async () => {
    if (!oldPwd || !newPwd) {
      toast.error("请填写完整的密码");
      return;
    }
    setSavingPwd(true);
    try {
      await changePassword(oldPwd, newPwd);
      setOldPwd("");
      setNewPwd("");
      toast.success("密码已修改");
    } catch (e) {
      toast.error("修改失败", (e as Error)?.message);
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className="space-y-6">
      <Row label="昵称">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-selectable
          className={inputCls}
        />
      </Row>

      <Row label="邮箱">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-selectable
          className={inputCls}
        />
      </Row>

      <Row label="套餐">
        <span className="rounded-md border border-accent/35 bg-accent-soft px-2 py-1 font-mono text-[11px] text-accent">
          {(user?.plan ?? "free").toUpperCase()}
        </span>
      </Row>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Button variant="primary" disabled={savingProfile} onClick={() => void saveProfile()}>
              {savingProfile ? "保存中…" : "保存资料"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-line pt-5">
        <h3 className="mb-3 flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-dim uppercase">
          <KeyRound size={12} className="text-accent" />
          修改密码
        </h3>
        <div className="space-y-3">
          <Row label="当前密码">
            <input
              type="password"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              data-selectable
              className={inputCls}
            />
          </Row>
          <Row label="新密码">
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              data-selectable
              className={inputCls}
            />
          </Row>
          <Button
            variant="ghost"
            disabled={savingPwd}
            onClick={() => void savePwd()}
          >
            {savingPwd ? "提交中…" : "修改密码"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 后端 ─────────────────────────── */

function BackendPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  const setBackendMode = useSettingsStore((s) => s.setBackendMode);
  const [url, setUrl] = useState(settings?.apiBaseUrl ?? "");

  useEffect(() => setUrl(settings?.apiBaseUrl ?? ""), [settings?.apiBaseUrl]);
  if (!settings) return <Empty />;

  const isMock = settings.backendMode === "mock";

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-surface-2/50 p-3 text-[11.5px] leading-5 text-dim">
        <strong className="text-text">本地模拟</strong>：数据存在应用数据目录的{" "}
        <code className="font-mono text-accent">mock-db.json</code>{" "}
        里，回复由内置脚本生成，不需要任何服务器，适合开发调试与演示。
        <br />
        <strong className="text-text">远程后端</strong>：按{" "}
        <code className="font-mono text-accent">docs/API.md</code>{" "}
        的约定调用真实服务，回复通过 SSE 流式返回。
      </div>

      <Row label="数据源">
        <div className="flex gap-1.5">
          {(["mock", "remote"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (m === "remote") {
                  void setBackendMode("remote", url.trim() || settings.apiBaseUrl);
                } else {
                  void setBackendMode("mock", settings.apiBaseUrl);
                }
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 font-mono text-[11.5px] transition-all",
                settings.backendMode === m
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-line bg-surface-2 text-dim hover:text-text",
              )}
            >
              {m === "mock" ? "本地模拟" : "远程后端"}
            </button>
          ))}
        </div>
      </Row>

      <Row label="API Base URL" hint="远程后端的根地址">
        <div className="flex w-full gap-2">
          <input
            value={url}
            disabled={isMock}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/v1"
            data-selectable
            className={cn(inputCls, "font-mono text-[12px]", isMock && "opacity-45")}
          />
          <Button
            variant="ghost"
            disabled={isMock || url.trim() === settings.apiBaseUrl}
            onClick={() => void patch({ apiBaseUrl: url.trim() })}
          >
            保存
          </Button>
        </div>
      </Row>

      {!isMock && (
        <p className="font-mono text-[11px] leading-4 text-warn">
          切换到远程后端后需要重新登录 —— token 由目标服务签发。
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────── 用量 ─────────────────────────── */

function UsagePanel() {
  const stats = useSettingsStore((s) => s.stats);

  const cards = [
    { label: "项目", value: stats?.projects ?? 0 },
    { label: "会话", value: stats?.sessions ?? 0 },
    { label: "消息", value: stats?.messages ?? 0 },
  ];

  const total = (stats?.inputTokens ?? 0) + (stats?.outputTokens ?? 0);
  const inPct = total ? ((stats?.inputTokens ?? 0) / total) * 100 : 50;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.24 }}
            className="rounded-xl border border-line bg-surface p-3"
          >
            <div className="font-mono text-[20px] leading-6 text-text">
              {compactNumber(c.value)}
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] text-faint">{c.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] tracking-wide text-dim uppercase">
            Token 用量
          </span>
          <span className="font-mono text-[11.5px] text-text">
            {compactNumber(total)}
          </span>
        </div>

        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${inPct}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="h-full bg-accent"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${100 - inPct}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="h-full bg-info"
          />
        </div>

        <div className="flex gap-4 font-mono text-[11px] text-faint">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-accent" />
            输入 {compactNumber(stats?.inputTokens ?? 0)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-info" />
            输出 {compactNumber(stats?.outputTokens ?? 0)}
          </span>
        </div>
      </div>

      {!stats && (
        <p className="font-mono text-[11.5px] text-faint">统计数据加载中…</p>
      )}
    </div>
  );
}

/* ─────────────────────────── 通用小组件 ─────────────────────────── */

const inputCls =
  "w-full max-w-64 rounded-lg border border-line bg-bg-deep px-3 py-1.5 text-[12.5px] text-text outline-none transition-colors placeholder:text-faint focus:border-accent/60";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 pt-1">
        <div className="text-[12.5px] text-text">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] leading-4 text-faint">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-surface-3",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 520, damping: 32 }}
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow",
          checked ? "left-4.5" : "left-0.5",
        )}
      />
    </button>
  );
}

function Empty() {
  return <p className="py-10 text-center text-[12.5px] text-faint">设置加载中…</p>;
}
