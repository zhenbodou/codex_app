import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CornerDownLeft,
  FolderPlus,
  LogOut,
  MessageSquare,
  Moon,
  PanelLeft,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { useSkillsStore } from "@/store/skills";
import { useUiStore } from "@/store/ui";
import { useWorkspaceStore } from "@/store/workspace";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * ⌘K 命令面板。
 *
 * 命令列表是每次打开时现算的 —— 这样「跳转会话」能反映最新数据，
 * 也省掉了维护订阅的麻烦，几十个条目的构造成本可以忽略。
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    if (!open) return [];

    const ui = useUiStore.getState();
    const ws = useWorkspaceStore.getState();
    const isDark = document.documentElement.dataset.theme !== "light";

    const jump: Command[] = Object.values(ws.sessionsByProject)
      .flat()
      .slice(0, 30)
      .map((s) => {
        const project = ws.projects.find((p) => p.id === s.projectId);
        return {
          id: `goto-${s.id}`,
          label: s.title,
          hint: project ? `${project.name} · 跳转会话` : "跳转会话",
          icon: <MessageSquare size={13} />,
          run: () => ws.selectSession(s.projectId, s.id),
        };
      });

    return [
      {
        id: "new-session",
        label: "新建会话",
        hint: "⌘N",
        icon: <Sparkles size={13} />,
        run: () => {
          ws.startNewSession();
        },
      },
      {
        id: "new-project",
        label: "新建项目",
        icon: <FolderPlus size={13} />,
        run: () => ui.openProjectDialog(null),
      },
      {
        id: "skills",
        label: "打开技能面板",
        icon: <Sparkles size={13} />,
        run: () => {
          void useSkillsStore.getState().load();
          ui.setSkillsOpen(true);
        },
      },
      {
        id: "settings",
        label: "打开设置",
        hint: "⌘,",
        icon: <Settings size={13} />,
        run: () => ui.setSettingsOpen(true),
      },
      {
        id: "theme",
        label: isDark ? "切换到浅色主题" : "切换到深色主题",
        icon: isDark ? <Sun size={13} /> : <Moon size={13} />,
        run: () =>
          void useSettingsStore
            .getState()
            .patch({ theme: isDark ? "light" : "dark" }),
      },
      {
        id: "sidebar",
        label: ui.sidebarCollapsed ? "展开侧边栏" : "收起侧边栏",
        hint: "⌘B",
        icon: <PanelLeft size={13} />,
        run: () => ui.toggleSidebar(),
      },
      ...jump,
      {
        id: "logout",
        label: "退出登录",
        icon: <LogOut size={13} />,
        run: () => void useAuthStore.getState().logout(),
      },
    ];
  }, [open]);

  const matches = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return commands.slice(0, 12);
    return commands
      .filter(
        (c) =>
          c.label.toLowerCase().includes(kw) ||
          (c.hint ?? "").toLowerCase().includes(kw),
      )
      .slice(0, 12);
  }, [commands, q]);

  useEffect(() => setCursor(0), [q]);

  useLayoutEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const exec = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-label="命令面板"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/50"
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => (matches.length ? (c + 1) % matches.length : 0));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) =>
                    matches.length ? (c - 1 + matches.length) % matches.length : 0,
                  );
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  exec(matches[cursor]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setOpen(false);
                }
              }}
              placeholder="输入命令或搜索会话…"
              data-selectable
              className="w-full border-b border-line bg-transparent px-4 py-3 text-[13.5px] text-text outline-none placeholder:text-faint"
            />

            <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
              {matches.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-faint">
                  没有匹配的命令
                </p>
              ) : (
                matches.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => exec(c)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      i === cursor ? "bg-surface-3" : "hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0",
                        i === cursor ? "text-accent" : "text-faint",
                      )}
                    >
                      {c.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                      {c.label}
                    </span>
                    {c.hint && (
                      <span className="shrink-0 font-mono text-[10.5px] text-faint">
                        {c.hint}
                      </span>
                    )}
                    {i === cursor && (
                      <CornerDownLeft size={12} className="shrink-0 text-faint" />
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 font-mono text-[10px] text-faint">
              <span>↑↓ 选择</span>
              <span>Enter 执行</span>
              <span>Esc 关闭</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
