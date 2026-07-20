import { type ComponentPropsWithoutRef, memo, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import remarkGfm from "remark-gfm";
import styles from "./MessageMarkdown.module.css";

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node) return "";
  if (Array.isArray(node)) return node.map(extractText).join("");
  const el = node as unknown as Record<string, unknown>;
  if ("props" in el && typeof el.props === "object" && el.props != null) {
    const props = el.props as Record<string, unknown>;
    if ("children" in props && props.children != null) {
      return extractText(props.children as ReactNode);
    }
  }
  return "";
}

function CopyIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CodeBlock({ children, ...props }: JSX.IntrinsicElements["pre"]) {
  const codeText = extractText(children);

  return (
    <div className={styles.codeBlock}>
      <pre {...props} className={styles.code}>
        <code>{children}</code>
      </pre>
      <button
        type="button"
        className={styles.copyButton}
        onClick={() => navigator.clipboard.writeText(codeText)}
        title="复制"
      >
        <CopyIcon />
      </button>
    </div>
  );
}

function MarkdownTable({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table} {...(props as ComponentPropsWithoutRef<"table">)}>
        {children}
      </table>
    </div>
  );
}

export const MessageMarkdown = memo(function MessageMarkdown({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <div className={styles.markdown}>
      <Streamdown
        animated
        isAnimating={isStreaming}
        remarkPlugins={[remarkGfm]}
        controls={{ code: { copy: false, download: false } }}
        components={
          {
            table: MarkdownTable,
            pre: CodeBlock,
          } as any
        }
      >
        {content}
      </Streamdown>
    </div>
  );
});
