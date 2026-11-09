import type { ContentBlock, StreamEvent } from "@/types";

/**
 * 把一个流式事件折叠进已有的内容块数组。
 *
 * 纯函数，不碰 store —— 这样既能单独测试，也保证渲染层拿到的一定是不可变的新数组
 * （React 靠引用变化决定是否重渲染）。
 *
 * 追加规则：delta 事件如果和数组末尾是同一类型就合并进去，否则新开一块。
 * 这正好对应模型「先思考、再调工具、最后输出正文」的交替节奏。
 */
export function applyStreamEvent(
  blocks: ContentBlock[],
  ev: StreamEvent,
): ContentBlock[] {
  const last = blocks[blocks.length - 1];

  switch (ev.type) {
    case "start":
    case "done":
    case "error":
      return blocks;

    case "thinking_delta": {
      if (last?.type === "thinking") {
        const next = blocks.slice();
        next[next.length - 1] = {
          ...last,
          thinking: last.thinking + ev.text,
        };
        return next;
      }
      return [
        ...blocks,
        { type: "thinking", thinking: ev.text, durationMs: 0 },
      ];
    }

    case "thinking_end": {
      // 回填最近一个思考块的耗时
      const next = blocks.slice();
      for (let i = next.length - 1; i >= 0; i--) {
        const b = next[i];
        if (b.type === "thinking") {
          next[i] = { ...b, durationMs: ev.durationMs };
          break;
        }
      }
      return next;
    }

    case "text_delta": {
      if (last?.type === "text") {
        const next = blocks.slice();
        next[next.length - 1] = { ...last, text: last.text + ev.text };
        return next;
      }
      return [...blocks, { type: "text", text: ev.text }];
    }

    case "tool_start":
      return [
        ...blocks,
        {
          type: "tool_use",
          id: ev.toolId,
          name: ev.name,
          input: ev.input,
          status: "running",
          result: null,
          durationMs: 0,
        },
      ];

    case "tool_end":
      return blocks.map((b) =>
        b.type === "tool_use" && b.id === ev.toolId
          ? { ...b, status: ev.status, result: ev.result, durationMs: ev.durationMs }
          : b,
      );

    default:
      return blocks;
  }
}

/** 工具调用的主标题，例如 `Read(src/App.tsx)`。 */
export function toolHeadline(
  name: string,
  input: Record<string, unknown>,
): string {
  const primary =
    input.file_path ??
    input.path ??
    input.pattern ??
    input.command ??
    input.url ??
    input.query ??
    input.description ??
    null;
  const arg = typeof primary === "string" ? primary : null;
  return arg ? `${name}(${shorten(arg)})` : name;
}

function shorten(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** 把工具入参渲染成可读的多行文本。 */
export function toolInputText(input: Record<string, unknown>): string {
  return Object.entries(input)
    .map(([k, v]) => {
      const value = typeof v === "string" ? v : JSON.stringify(v, null, 2);
      return value.includes("\n") ? `${k}:\n${indent(value)}` : `${k}: ${value}`;
    })
    .join("\n");
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}
