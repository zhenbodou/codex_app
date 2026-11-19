import { Children, isValidElement, memo, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Code2, Copy, WrapText } from "lucide-react";
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
          table: ({ children }) => <div className="md-table-scroll" tabIndex={0} role="region" aria-label="表格，可横向滚动"><table>{children}</table></div>,
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
function plainText(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    return isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : "";
  }).join("");
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [wrap, setWrap] = useState(false);

  const codeElement = Children.toArray(children).find(child => isValidElement(child) && child.type === "code");
  const classes = isValidElement<{ className?: string }>(codeElement) ? codeElement.props.className : undefined;
  const language = classes?.split(/\s+/).find(name => name.startsWith("language-"))?.slice(9) || "text";
  const code = plainText(children).replace(/\n$/, "");
  const lineCount = code.split("\n").length;
  useEffect(() => {
    if (copyStatus === "idle") return;
    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <div className="code-panel">
      <div className="code-panel-bar">
        <span className="code-language"><Code2 size={14} aria-hidden="true" />{language}</span>
        <span className="code-line-count">{lineCount} 行</span>
        <div className="code-panel-actions">
          <button type="button" aria-label="自动换行" aria-pressed={wrap} onClick={() => setWrap(!wrap)}><WrapText size={14} aria-hidden="true" /><span>换行</span></button>
          <button type="button" aria-label="复制代码" data-copy={copyStatus} onClick={copy}>
            {copyStatus === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span>{copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制"}</span>
          </button>
          <span className="sr-only" role="status">{copyStatus === "copied" ? "代码已复制" : copyStatus === "failed" ? "无法复制，请手动选中代码" : ""}</span>
        </div>
      </div>
      <pre tabIndex={0} aria-label={`${language} 代码`} data-wrap={wrap}>{children}</pre>
    </div>
  );
}
