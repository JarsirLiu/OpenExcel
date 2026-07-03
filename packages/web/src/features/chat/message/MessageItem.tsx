import { useState } from "react";
import type { JSX } from "react";
import { getMessageText } from "../utils";
import { MessageMarkdown } from "./MessageMarkdown";
import { ReasoningCard } from "./ReasoningCard";
import { ToolCallCard } from "./ToolCallCard";

const UserAvatar = () => (
  <div style={{
    width: 32, height: 32, borderRadius: "50%", background: "#10a37f",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0, userSelect: "none",
  }}>Y</div>
);

const AIAvatar = () => (
  <div style={{
    width: 32, height: 32, borderRadius: "50%", background: "#3b82f6",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0, userSelect: "none",
  }}>AI</div>
);

const CopyIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

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
        result.push(<div key={`step-${i}`} style={{ height: 1, background: "#e8ecf0", margin: "8px 0" }} />);
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
}: {
  msg: any;
  isStreaming: boolean;
  isLastAssistantMessage: boolean;
}) {
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});

  return (
    <div style={{ marginBottom: 28, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        {msg.role === "user" ? <UserAvatar /> : <AIAvatar />}
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1f1f1f" }}>
          {msg.role === "user" ? "You" : "AI 助手"}
        </span>
      </div>
      <div style={{ paddingLeft: 42, minWidth: 0 }}>
        {msg.role === "user" ? (
          <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.7, color: "#1f1f1f" }}>
            {getMessageText(msg)}
          </div>
        ) : (
          <>
            {renderAssistantParts(msg, isStreaming, thinkingOpen, setThinkingOpen)}
            {!isStreaming && isLastAssistantMessage && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(getMessageText(msg) || "")}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#666", background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}
                >
                  <CopyIcon />
                  复制
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
