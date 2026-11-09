import { memo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, Check, Copy, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { fullTime } from "@/lib/format";
import { Markdown } from "@/components/Markdown";
import { ThinkingBlock } from "@/components/ThinkingBlock";
import { ToolBlock } from "@/components/ToolBlock";
import type { ContentBlock, Message } from "@/types";

/**
 * 单条消息。
 *
 * 用户消息采用桌面气泡，助手正文和工具卡片共享内容宽度。
 * 入场动画只执行一次，避免内容流式增长时触发布局插值。
 *
 * 用 memo 是因为流式输出时消息数组每帧都会变，未变动的历史消息必须完全跳过重渲染。
 */
export const MessageItem = memo(function MessageItem({
  message,
  streaming,
  showThinking = true,
  onRetry,
}: {
  message: Message;
  streaming: boolean;
  /** 关掉后思考块不渲染，但工具块与正文照常显示 */
  showThinking?: boolean;
  onRetry?: (text: string) => void;
}) {
  if (message.role === "user") {
    return <UserMessage message={message} onRetry={onRetry} />;
  }
  return (
    <AssistantMessage
      message={message}
      streaming={streaming}
      showThinking={showThinking}
    />
  );
});

/* ─────────────────────────── 用户消息 ─────────────────────────── */

function UserMessage({
  message,
  onRetry,
}: {
  message: Message;
  onRetry?: (text: string) => void;
}) {
  const text = message.blocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="group/msg relative px-6 py-3 sm:px-10"
    >
      <div className="user-message-bubble flex gap-3">
        <div className="min-w-0 flex-1">
          <pre
            data-selectable
            className="whitespace-pre-wrap break-words font-sans text-[14px] leading-6 text-text"
          >
            {text}
          </pre>

          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100">
            <span className="font-mono text-[11px] text-faint">
              {fullTime(message.createdAt)}
            </span>
            {onRetry && text && (
              <MiniAction
                label="重新提问"
                onClick={() => onRetry(text)}
                icon={<RotateCcw size={11} />}
              />
            )}
            <MiniAction
              label="复制"
              onClick={() => void copy(text)}
              icon={<Copy size={11} />}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MiniAction({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-faint transition-colors hover:bg-surface-2 hover:text-dim"
    >
      {icon}
      {label}
    </button>
  );
}

/* ─────────────────────────── 助手消息 ─────────────────────────── */

function AssistantMessage({
  message,
  streaming,
  showThinking,
}: {
  message: Message;
  streaming: boolean;
  showThinking: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const failed = message.status === "error";
  const cancelled = message.status === "cancelled";

  const fullText = message.blocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="group/msg relative px-6 py-3 sm:px-10"
    >
      <div className="min-w-0 space-y-0.5">
        <Blocks
          blocks={message.blocks}
          streaming={streaming}
          showThinking={showThinking}
        />

        <AnimatePresence>
          {!streaming && (failed || cancelled) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]",
                  failed
                    ? "border-err/30 bg-err/10 text-err"
                    : "border-warn/30 bg-warn/10 text-warn",
                )}
              >
                {failed ? <AlertOctagon size={11} /> : <RotateCcw size={11} />}
                {failed ? "生成失败" : "已中断"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!streaming && !failed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.08, duration: 0.2 }}
              className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100"
            >
              <span className="font-mono text-[11px] text-faint">
                {message.model ?? ""}
                {message.usage &&
                  ` · ${message.usage.inputTokens + message.usage.outputTokens} tok`}
              </span>
              {fullText && (
                <MiniAction
                  label={copied ? "已复制" : "复制"}
                  icon={copied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
                  onClick={() => {
                    void copy(fullText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/**
 * 按块类型分发渲染。
 *
 * 相邻的同类型文本块在 `applyStreamEvent` 里已经合并过了，所以这里
 * 直接按顺序映射即可，不需要再做聚合。
 */
function Blocks({
  blocks,
  streaming,
  showThinking,
}: {
  blocks: ContentBlock[];
  streaming: boolean;
  showThinking: boolean;
}) {
  const visible = showThinking
    ? blocks
    : blocks.filter((b) => b.type !== "thinking");

  return (
    <>
      {visible.map((block, i) => {
        const isLast = i === visible.length - 1;
        switch (block.type) {
          case "thinking":
            return (
              <ThinkingBlock
                key={`th-${i}`}
                thinking={block.thinking}
                durationMs={block.durationMs}
                streaming={streaming && isLast}
              />
            );
          case "tool_use":
            return <ToolBlock key={block.id} tool={block} />;
          case "text":
            return (
              <div key={`tx-${i}`} className="relative">
                <Markdown content={block.text} />
                {/* 光标方块只跟在正在写入的那个文本块后面 */}
                {streaming && isLast && <span className="caret" />}
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function copy(text: string): Promise<void> {
  return navigator.clipboard.writeText(text).catch(() => {});
}
