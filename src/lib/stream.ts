import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { StreamPayload } from "@/types";

/** Rust 侧 `commands::STREAM_EVENT` 常量，两边必须一致。 */
export const STREAM_CHANNEL = "llm-stream";

/**
 * 订阅流式回复事件。
 *
 * 返回的取消函数必须在组件卸载 / store 销毁时调用，
 * 否则监听器会累积，同一条 delta 被处理多次（表现为文字重复）。
 */
export function subscribeStream(
  handler: (payload: StreamPayload) => void,
): Promise<UnlistenFn> {
  return listen<StreamPayload>(STREAM_CHANNEL, (e) => handler(e.payload));
}
