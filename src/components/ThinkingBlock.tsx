import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { duration } from "@/lib/format";

/**
 * 思考过程块。
 *
 * 默认显示摘要，点选后可在生成中或生成后查看完整思考。
 */
export function ThinkingBlock({
  thinking,
  durationMs,
  streaming,
  defaultOpen,
}: {
  thinking: string;
  durationMs: number;
  streaming: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const expanded = open;

  return (
    <div className="my-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md py-1 text-left transition-colors",
          !streaming && "hover:bg-surface-2",
        )}
        aria-expanded={expanded}
      >
        {!streaming && (
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.16 }}
            className="text-faint"
          >
            <ChevronRight size={13} />
          </motion.span>
        )}

        <Brain
          size={13}
          className={cn(
            "shrink-0",
            streaming ? "text-accent" : "text-faint",
          )}
          strokeWidth={1.9}
        />

        <span
          className={cn(
            "text-[12px]",
            streaming ? "text-accent" : "text-faint",
          )}
        >
          {streaming ? "Thinking" : `Thought for ${duration(durationMs)}`}
        </span>

        {streaming && (
          <span className="ml-0.5 flex items-end gap-[3px] pb-[3px]">
            <i className="dot h-[3px] w-[3px] rounded-full bg-accent" />
            <i className="dot h-[3px] w-[3px] rounded-full bg-accent" />
            <i className="dot h-[3px] w-[3px] rounded-full bg-accent" />
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 mb-1 border-l border-line-strong/60 pl-3">
              <p className="thinking-text">
                {thinking}
                {streaming && <span className="caret" />}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
