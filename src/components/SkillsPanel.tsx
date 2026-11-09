import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSkillsStore } from "@/store/skills";
import { useUiStore } from "@/store/ui";
import { Button, Modal } from "@/components/Modal";
import { SkillIcon } from "@/components/SkillIcon";
import type { Skill } from "@/types";

/**
 * 技能面板。
 *
 * 两个正交的概念，界面上分开表达：
 * - **启用**（enabled）：账户级开关，关掉后 `/` 菜单里就搜不到了
 * - **挂载**（selected）：只对下一次提问生效，发完自动保留直到手动清除
 */
export function SkillsPanel() {
  const open = useUiStore((s) => s.skillsOpen);
  const close = useUiStore((s) => s.setSkillsOpen);

  const skills = useSkillsStore((s) => s.skills);
  const loading = useSkillsStore((s) => s.loading);
  const selected = useSkillsStore((s) => s.selected);
  const toggleEnabled = useSkillsStore((s) => s.toggleEnabled);
  const toggleSelected = useSkillsStore((s) => s.toggleSelected);
  const clearSelected = useSkillsStore((s) => s.clearSelected);

  const [q, setQ] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return skills.filter((s) => {
      if (onlyEnabled && !s.enabled) return false;
      if (!kw) return true;
      return (
        s.id.toLowerCase().includes(kw) ||
        s.name.toLowerCase().includes(kw) ||
        s.description.toLowerCase().includes(kw) ||
        s.category.toLowerCase().includes(kw)
      );
    });
  }, [skills, q, onlyEnabled]);

  // 按分类分组，保持后端返回的顺序
  const groups = useMemo(() => {
    const map = new Map<string, Skill[]>();
    for (const s of filtered) {
      const list = map.get(s.category);
      if (list) list.push(s);
      else map.set(s.category, [s]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <Modal
      open={open}
      onClose={() => close(false)}
      size="lg"
      title="技能"
      subtitle="技能是给模型附加的专项能力，挂载后会在本次提问中生效"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="font-mono text-[11.5px] text-faint">
            {skills.filter((s) => s.enabled).length}/{skills.length} 已启用
            {selected.length > 0 && (
              <span className="ml-2 text-accent">· 本次挂载 {selected.length}</span>
            )}
          </span>
          <div className="flex gap-2">
            {selected.length > 0 && (
              <Button variant="ghost" onClick={clearSelected}>
                清空挂载
              </Button>
            )}
            <Button variant="primary" onClick={() => close(false)}>
              完成
            </Button>
          </div>
        </div>
      }
    >
      {/* 工具条 */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索技能名、描述或分类"
            data-selectable
            className="w-full rounded-lg border border-line bg-bg-deep py-1.5 pr-3 pl-8 text-[12.5px] text-text outline-none transition-colors placeholder:text-faint focus:border-accent/60"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyEnabled((v) => !v)}
          className={cn(
            "shrink-0 rounded-lg border px-2.5 py-1.5 font-mono text-[11.5px] transition-colors",
            onlyEnabled
              ? "border-accent/40 bg-accent-soft text-accent"
              : "border-line bg-surface-2 text-dim hover:text-text",
          )}
        >
          只看已启用
        </button>
      </div>

      {loading && skills.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 font-mono text-[12px] text-faint">
          <Loader2 size={14} className="animate-spin" />
          加载技能…
        </div>
      ) : groups.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-faint">没有匹配的技能</p>
      ) : (
        <div className="-mr-2 max-h-[52vh] space-y-5 overflow-y-auto pr-2">
          {groups.map(([category, list]) => (
            <section key={category}>
              <h3 className="mb-2 font-mono text-[10.5px] tracking-wider text-faint uppercase">
                {category}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    mounted={selected.includes(skill.id)}
                    onToggleEnabled={() => void toggleEnabled(skill.id)}
                    onMount={() => toggleSelected(skill.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

function SkillCard({
  skill,
  mounted,
  onToggleEnabled,
  onMount,
}: {
  skill: Skill;
  mounted: boolean;
  onToggleEnabled: () => void;
  onMount: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl border p-3 transition-colors",
        mounted
          ? "border-accent/45 bg-accent-soft"
          : "border-line bg-surface hover:border-line-strong",
        !skill.enabled && "opacity-55",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            mounted ? "bg-accent text-bg-deep" : "bg-surface-2 text-accent",
          )}
        >
          <SkillIcon name={skill.icon} size={14} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[12.5px] text-text">
              {skill.name}
            </span>
            {!skill.builtin && (
              <span className="shrink-0 rounded bg-surface-3 px-1 py-px font-mono text-[9px] text-faint">
                自定义
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-4 text-dim">
            {skill.description}
          </p>
        </div>

        {/* 启用开关 */}
        <button
          type="button"
          role="switch"
          aria-checked={skill.enabled}
          aria-label={`启用 ${skill.name}`}
          onClick={onToggleEnabled}
          className={cn(
            "relative mt-0.5 h-4 w-7 shrink-0 rounded-full transition-colors duration-200",
            skill.enabled ? "bg-accent" : "bg-surface-3",
          )}
        >
          <motion.span
            layout
            transition={{ type: "spring", stiffness: 520, damping: 32 }}
            className={cn(
              "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow",
              skill.enabled ? "left-3.5" : "left-0.5",
            )}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-faint">
          用过 {skill.usageCount} 次
        </span>
        <button
          type="button"
          onClick={onMount}
          disabled={!skill.enabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10.5px] transition-all disabled:pointer-events-none disabled:opacity-40",
            mounted
              ? "border-accent/50 bg-accent text-bg-deep"
              : "border-line bg-surface-2 text-dim hover:border-accent/40 hover:text-accent",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {mounted ? (
              <motion.span
                key="on"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className="inline-flex items-center gap-1"
              >
                <Check size={11} strokeWidth={3} />
                已挂载
              </motion.span>
            ) : (
              <motion.span
                key="off"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
              >
                挂载到本次
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.div>
  );
}
