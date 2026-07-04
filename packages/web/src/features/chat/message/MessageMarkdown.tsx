import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import remarkGfm from "remark-gfm";

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
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CodeBlock({ children, ...props }: JSX.IntrinsicElements["pre"]) {
  const [hovered, setHovered] = useState(false);
  const codeText = extractText(children);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        margin: "8px 0",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        background: "var(--muted)",
        border: "1px solid var(--border)",
        position: "relative",
      }}
    >
      <pre style={{
        margin: 0,
        padding: "14px 40px 14px 16px",
        overflowX: "auto",
        fontSize: 14,
        lineHeight: 1.6,
        color: "var(--foreground)",
        whiteSpace: "pre",
        fontFamily: "ui-monospace, 'Cascadia Code', 'JetBrains Mono', 'Fira Code', monospace",
      }}>
        <code>{children}</code>
      </pre>
      <button
        onClick={() => navigator.clipboard.writeText(codeText)}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: "var(--radius-pill)",
          border: "1px solid var(--border)",
          background: "var(--background)",
          color: "var(--muted-foreground)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "opacity 0.15s",
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? "auto" : "none",
        }}
        title="复制"
      >
        <CopyIcon />
      </button>
    </div>
  );
}

function MarkdownTable({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) {
  return (
    <div style={{ maxWidth: "100%", overflowX: "auto", whiteSpace: "nowrap" }}>
      <table {...(props as ComponentPropsWithoutRef<"table">)} style={{ minWidth: "max-content" }}>{children}</table>
    </div>
  );
}

export function MessageMarkdown({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  return (
    <div className="md-content" style={{
      fontSize: 15,
      lineHeight: 1.7,
      color: "var(--foreground)",
      maxWidth: "100%",
      minWidth: 0,
    }}>
      <Streamdown
        animated
        isAnimating={isStreaming}
        remarkPlugins={[remarkGfm]}
        controls={{ code: { copy: false, download: false } }}
        components={{
          table: MarkdownTable,
          pre: CodeBlock,
        } as any}
      >
        {content}
      </Streamdown>
    </div>
  );
}
