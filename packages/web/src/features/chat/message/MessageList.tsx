import { useCallback, useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";
import styles from "./MessageList.module.css";
import { MessageRenderBoundary } from "./MessageRenderBoundary";

export function MessageList({
  messages,
  isStreaming,
  onRegenerate,
  onUndo,
  isUndoing,
  loadingOlder,
  hasOlder,
  onLoadOlder,
  onScroll,
  onNavigateSheet,
}: {
  messages: any[];
  isStreaming: boolean;
  onRegenerate?: () => void;
  onUndo?: () => void;
  isUndoing?: boolean;
  loadingOlder?: boolean;
  hasOlder?: boolean;
  onLoadOlder?: () => void;
  onScroll?: () => void;
  onNavigateSheet?: (sheetId: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(messages.length);

  useEffect(() => {
    const el = messagesEndRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !hasOlder || loadingOlder || !onLoadOlder) return;
    if (el.scrollTop <= 60) {
      onLoadOlder();
    }
    onScroll?.();
  }, [hasOlder, loadingOlder, onLoadOlder, onScroll]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !hasOlder || !onLoadOlder) return;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, hasOlder, onLoadOlder]);

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  return (
    <div ref={containerRef} className={styles.messageList}>
      {loadingOlder && (
        <div
          style={{
            textAlign: "center",
            padding: 12,
            color: "var(--hint-foreground)",
            fontSize: 13,
          }}
        >
          加载更早消息...
        </div>
      )}

      {!loadingOlder && hasOlder && (
        <div
          style={{
            textAlign: "center",
            padding: 12,
            color: "var(--hint-foreground)",
            fontSize: 13,
          }}
        >
          向上滚动加载更早消息
        </div>
      )}

      {messages.length === 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "0 24px",
          }}
        >
          <div
            style={{
              color: "var(--muted-foreground)",
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            开始新的对话
          </div>
          <div
            style={{
              color: "var(--hint-foreground)",
              fontSize: 12,
              lineHeight: 1.6,
              textAlign: "center",
            }}
          >
            使用 @ 来引用表格内容，让 AI 帮你修改
          </div>
        </div>
      )}
      {messages.map((msg: any, idx: number) => (
        <MessageRenderBoundary key={`${msg?.id || idx}:${msg?.parts?.length ?? 0}`}>
          <MessageItem
            msg={msg}
            isStreaming={isStreaming}
            isLastAssistantMessage={
              !isStreaming && msg.role === "assistant" && msg.id === lastAssistantMsg?.id
            }
            isLastUserMessage={!isStreaming && msg.role === "user" && msg.id === lastUserMsg?.id}
            onRegenerate={onRegenerate}
            onUndo={onUndo}
            isUndoing={isUndoing}
            onNavigateSheet={onNavigateSheet}
          />
        </MessageRenderBoundary>
      ))}
      <div ref={messagesEndRef} />

      {isStreaming &&
        (() => {
          const last = messages[messages.length - 1];
          const showDots =
            last?.role !== "assistant" ||
            !last.parts?.some(
              (p: any) =>
                p?.type === "text" ||
                (typeof p?.type === "string" && p.type.startsWith("tool-")) ||
                p?.type === "reasoning",
            );
          if (!showDots) return null;
          return (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "var(--avatar-ai)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    flexShrink: 0,
                    userSelect: "none",
                  }}
                >
                  AI
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
                  AI 助手
                </span>
              </div>
              <div style={{ paddingLeft: 36, display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--hint-foreground)",
                    animation: "pulse 1.4s infinite",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--hint-foreground)",
                    animation: "pulse 1.4s infinite 0.2s",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--hint-foreground)",
                    animation: "pulse 1.4s infinite 0.4s",
                    display: "inline-block",
                  }}
                />
              </div>
            </div>
          );
        })()}
    </div>
  );
}
