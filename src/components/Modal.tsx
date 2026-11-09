import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 窄弹窗用于确认框，宽弹窗用于设置页 */
  size?: "sm" | "md" | "lg";
}

const WIDTH = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-4xl" } as const;

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), select:not(:disabled)") ?? panel.current?.querySelector<HTMLElement>("button:not(:disabled)");
      (first ?? panel.current)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length > 0);
        if (!items.length) { e.preventDefault(); panel.current?.focus(); return; }
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKey, true); if (previous?.isConnected) previous.focus(); };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          {/* 遮罩：点击关闭 */}
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            ref={panel}
            tabIndex={-1}
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.985, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: 4 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className={cn(
              "edge-light relative flex max-h-[86vh] w-full flex-col overflow-hidden",
              "rounded-xl border border-line bg-surface shadow-[var(--shadow)]",
              WIDTH[size],
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-text">{title}</h2>
                {subtitle && (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-dim">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="-mt-1 -mr-1 shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-surface-3 hover:text-text"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3.5">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 统一的按钮样式，避免每个弹窗各写一套。 */
export function Button({
  variant = "ghost",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        variant === "primary" &&
          "bg-accent text-bg-deep shadow-sm hover:brightness-110",
        variant === "ghost" &&
          "border border-line bg-surface-2 text-dim hover:border-line-strong hover:text-text",
        variant === "danger" &&
          "border border-err/35 bg-err/10 text-err hover:bg-err/18",
        className,
      )}
      {...props}
    />
  );
}
