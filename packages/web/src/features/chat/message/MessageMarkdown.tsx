import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import remarkGfm from "remark-gfm";

function MarkdownTable({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) {
  return (
    <div style={{ maxWidth: "100%", overflowX: "auto" }}>
      <table {...(props as ComponentPropsWithoutRef<"table">)}>{children}</table>
    </div>
  );
}

export function MessageMarkdown({ content, isStreaming = false }: { content: string; isStreaming?: boolean }) {
  return (
    <div className="md-content" style={{
      fontSize: 15,
      lineHeight: 1.7,
      color: "#1f1f1f",
      maxWidth: "100%",
      minWidth: 0,
    }}>
      <Streamdown
        animated
        isAnimating={isStreaming}
        remarkPlugins={[remarkGfm]}
        components={{
          table: MarkdownTable,
        } as any}
      >
        {content}
      </Streamdown>
    </div>
  );
}
