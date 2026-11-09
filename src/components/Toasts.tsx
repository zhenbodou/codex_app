import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useUiStore, type ToastKind } from "@/store/ui";

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

const TONE: Record<ToastKind, string> = {
  success: "text-ok",
  error: "text-err",
  info: "text-info",
};

/** 全局 toast 容器，挂在应用根部。 */
export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[100] flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 480, damping: 34 }}
              className={cn(
                "edge-light pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line",
                "bg-surface-2/95 px-3.5 py-3 shadow-[var(--shadow)] backdrop-blur-xl",
              )}
            >
              <Icon size={16} className={cn("mt-0.5 shrink-0", TONE[t.kind])} strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug font-medium text-text">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-[12px] leading-snug break-words text-dim">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="-mt-0.5 -mr-1 shrink-0 rounded p-1 text-faint transition-colors hover:bg-surface-3 hover:text-text"
                aria-label="关闭提示"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
