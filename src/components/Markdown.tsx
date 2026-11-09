import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Markdown 渲染器。
 *
 * 用 `memo` 包住是性能关键：流式输出时每来一个 delta 父组件都会重渲染，
 * 而 react-markdown 要跑完整的 unified 解析管线，非常贵。
 * 只有 `content` 真的变了才重新解析，历史消息就完全跳过。
 */
export const Markdown = memo(function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("md", className)} data-selectable>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: CodeBlock,
          // 链接一律在新窗口打开，且交给系统浏览器而不是 WebView
          a: ({ href, children }) => (
            <a href={href} title={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

/**
 * 代码块：语言标签 + 一键复制。
 *
 * react-markdown 会把 ```lang 渲染成 <pre><code class="language-lang">，
 * 这里拦截 pre，把 code 原样塞回去，外面套工具条。
 */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const child = Array.isArray(children) ? children[0] : children;
  const props = (child as { props?: { className?: string; children?: string } })
    ?.props;
  const lang =
    props?.className?.replace(/^language-/, "").split(" ")[0] || "text";
  const code = String(props?.children ?? "").replace(/\n$/, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // WebView 里 clipboard API 可能被拒，静默失败即可
    }
  }

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-lg border border-line bg-code-bg">
      <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-3 py-1.5">
        <span className="font-mono text-[10.5px] tracking-wider text-faint uppercase">
          {lang}
        </span>
        <button
          onClick={copy}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] transition-all",
            copied
              ? "text-ok opacity-100"
              : "text-faint opacity-0 group-hover/code:opacity-100 hover:text-text",
          )}
          aria-label="复制代码"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="!my-0 !rounded-none !border-0">
        <code className={props?.className}>{code}</code>
      </pre>
    </div>
  );
}
