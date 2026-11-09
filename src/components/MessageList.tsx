import { useEffect, useLayoutEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquareWarning } from "lucide-react";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { useSettingsStore } from "@/store/settings";
import { MessageItem } from "@/components/MessageItem";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/cn";
import { useUiStore } from "@/store/ui";

/**
 * 消息列表 + 自动滚动。
 *
 * 自动滚动有个必须处理的细节：用户往上翻历史时不能被强行拽回底部。
 * 这里记录一个「是否贴底」标志，只有贴底（或差得不多）时才跟随滚动。
 */
export function MessageList({ onSend }: { onSend: (text: string) => void }) {
  const messages = useChatStore((s) => s.messages);
  const loading = useChatStore((s) => s.loading);
  const error = useChatStore((s) => s.error);
  const streamingId = useChatStore((s) => s.streamingId);
  const sessionId = useWorkspaceStore((s) => s.activeSessionId);
  const showThinking = useSettingsStore((s) => s.settings?.showThinking ?? true);
  const view = useUiStore(s => s.transcriptView);

  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // 滚轮/触控板往上翻 -> 解除贴底；手动滚回底部附近 -> 重新贴底
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      stick.current = gap < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 切会话时直接跳到底部并重新贴底
  useLayoutEffect(() => {
    stick.current = true;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [sessionId]);

  // 流式内容增长时跟随滚动
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
      {loading ? (
        <LoadingRows />
      ) : messages.length === 0 && !error ? (
        <EmptyState onPick={onSend} />
      ) : (
        <div className="mx-auto w-full max-w-3xl pb-8">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                streaming={m.id === streamingId}
                showThinking={showThinking && view !== "normal"}
                onRetry={m.role === "user" ? onSend : undefined}
              />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mx-6 mt-2 flex items-center gap-2 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-[12.5px] text-err sm:mx-10"
              >
                <MessageSquareWarning size={14} className="shrink-0" />
                {error}
                {sessionId && <button type="button" className="ml-auto shrink-0 underline" onClick={() => void useChatStore.getState().loadMessages(sessionId, true)}>重试加载</button>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/** 加载中的骨架行，避免白屏突兀。 */
function LoadingRows() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8 sm:px-10">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full bg-line-strong")} />
          <div className="flex-1 space-y-2">
            <div
              className="shimmer h-3 rounded"
              style={{ width: `${[68, 92, 45][i]}%` }}
            />
            <div className="shimmer h-3 w-1/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
