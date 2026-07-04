import { useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";

export function MessageList({
  messages,
  isStreaming,
  onRegenerate,
}: {
  messages: any[];
  isStreaming: boolean;
  onRegenerate?: () => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = messagesEndRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
      {messages.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--hint-foreground)", fontSize: 14 }}>
          开始新的对话吧
        </div>
      )}
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          msg={msg}
          isStreaming={isStreaming}
          isLastAssistantMessage={!isStreaming && msg.role === "assistant" && msg.id === lastAssistantMsg?.id}
          onRegenerate={onRegenerate}
        />
      ))}
      <div ref={messagesEndRef} />

      {isStreaming && (() => {
        const last = messages[messages.length - 1];
        const showDots = !last || last.role !== "assistant" || !last.parts?.some((p: any) =>
          p.type === "text" || p.type.startsWith("tool-") || p.type === "reasoning"
        );
        if (!showDots) return null;
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", background: "var(--avatar-ai)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0, userSelect: "none",
              }}>AI</div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>AI 助手</span>
            </div>
            <div style={{ paddingLeft: 36, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--hint-foreground)", animation: "pulse 1.4s infinite", display: "inline-block" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--hint-foreground)", animation: "pulse 1.4s infinite 0.2s", display: "inline-block" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--hint-foreground)", animation: "pulse 1.4s infinite 0.4s", display: "inline-block" }} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
