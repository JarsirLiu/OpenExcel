import { useState } from "react";
import type { JSX } from "react";
import { getMessageText } from "../utils";
import { MessageMarkdown } from "./MessageMarkdown";
import { ReasoningCard } from "./ReasoningCard";
import { ToolCallCard } from "./ToolCallCard";

const UserAvatar = () => (
  <div style={{
    width: 26, height: 26, borderRadius: "50%", background: "var(--avatar-user)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0, userSelect: "none",
  }}>Y</div>
);

const AIAvatar = () => (
  <div style={{
    width: 26, height: 26, borderRadius: "50%", background: "var(--avatar-ai)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0, userSelect: "none",
  }}>AI</div>
);

const CopyIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const RefreshIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

const ThumbUpIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);

const ThumbDownIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H6.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
  </svg>
);

const DownloadIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const actionButtonStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  fontSize: 12, color: "var(--muted-foreground)",
  background: "transparent", border: "none", cursor: "pointer",
  padding: "4px 8px", borderRadius: "var(--radius-pill)",
  transition: "background 0.15s",
};

function renderAssistantParts(
  msg: any,
  isStreaming: boolean,
  thinkingOpen: Record<string, boolean>,
  setThinkingOpen: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
) {
  if (!msg.parts || msg.parts.length === 0) {
    return <MessageMarkdown content={msg.content || ""} isStreaming={isStreaming} />;
  }

  const result: JSX.Element[] = [];
  let textParts: string[] = [];
  const flushText = (key: string) => {
    if (textParts.length > 0) {
        result.push(
          <MessageMarkdown key={key} content={textParts.join("")} isStreaming={isStreaming} />,
        );
      textParts = [];
    }
  };

  for (let i = 0; i < msg.parts.length; i++) {
    const part = msg.parts[i];
    switch (part.type) {
      case "text":
        textParts.push(part.text);
        break;
      case "reasoning":
        flushText(`reasoning-${i}-flush`);
        result.push(
          <div key={`reasoning-${i}`}>
            <ReasoningCard
              reasoning={part.reasoning}
              open={thinkingOpen[msg.id] ?? true}
              onToggle={() => setThinkingOpen((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))}
            />
          </div>,
        );
        break;
      case "step-start":
        flushText(`step-${i}-flush`);
        result.push(<div key={`step-${i}`} style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />);
        break;
      default:
        if (part.type.startsWith("tool-")) {
          flushText(`tool-${i}-flush`);
          result.push(
            <div key={`tool-${i}`} style={{ marginBottom: 6 }}>
              <ToolCallCard part={part} />
            </div>,
          );
        }
        break;
    }
  }
  flushText("final-flush");

  return <>{result}</>;
}

export function MessageItem({
  msg,
  isStreaming,
  isLastAssistantMessage,
  onRegenerate,
}: {
  msg: any;
  isStreaming: boolean;
  isLastAssistantMessage: boolean;
  onRegenerate?: () => void;
}) {
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});

  if (msg.role === "user") {
    return (
      <div style={{ marginBottom: 24, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <UserAvatar />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>You</span>
        </div>
        <div style={{ paddingLeft: 36, minWidth: 0 }}>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.7, color: "var(--foreground)" }}>
            {getMessageText(msg)}
          </div>
        </div>
      </div>
    );
  }

  return (
      <div style={{ marginBottom: 24, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <AIAvatar />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>AI 助手</span>
        </div>
        <div style={{ paddingLeft: 36, minWidth: 0 }}>
        {renderAssistantParts(msg, isStreaming, thinkingOpen, setThinkingOpen)}
        {!isStreaming && isLastAssistantMessage && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                style={actionButtonStyle}
                title="重新生成"
              >
                <RefreshIcon size={14} />
                重新生成
              </button>
            )}
            <button style={actionButtonStyle} title="赞">
              <ThumbUpIcon size={14} />
            </button>
            <button style={actionButtonStyle} title="踩">
              <ThumbDownIcon size={14} />
            </button>
            <button style={actionButtonStyle} title="下载">
              <DownloadIcon size={14} />
            </button>
            <button
              style={actionButtonStyle}
              onClick={() => navigator.clipboard.writeText(getMessageText(msg) || "")}
              title="复制"
            >
              <CopyIcon size={14} />
              复制
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
