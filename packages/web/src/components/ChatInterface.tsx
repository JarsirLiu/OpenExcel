import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message as Msg } from "../api/client";
import { fetchMessages, fetchSessions, streamChat } from "../api/client";

/* ============ Icons ============ */
const SendIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const StopIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

const PaperclipIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const CopyIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/* ============ Avatars ============ */
const UserAvatar = () => (
  <div
    style={{
      width: 32,
      height: 32,
      borderRadius: "50%",
      background: "#10a37f",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontSize: 13,
      fontWeight: 600,
      flexShrink: 0,
      userSelect: "none",
    }}
  >
    Y
  </div>
);

const AIAvatar = () => (
  <div
    style={{
      width: 32,
      height: 32,
      borderRadius: "50%",
      background: "#3b82f6",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontSize: 13,
      fontWeight: 600,
      flexShrink: 0,
      userSelect: "none",
    }}
  >
    AI
  </div>
);

interface Props {}

function ChatPanel({ sessionId }: { sessionId: number }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const assistantIndexRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchMessages(sessionId).then(setMessages);
    assistantIndexRef.current = null;
    setDraft("");
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSend = async (text: string) => {
    const input = text.trim();
    if (!input || isStreaming) return;

    const nextMessages: Msg[] = [
      ...messages,
      { id: `local-user-${Date.now()}`, role: "user", content: input },
    ];
    nextMessages.push({ id: `local-assistant-${Date.now()}`, role: "assistant", content: "正在思考..." });
    assistantIndexRef.current = nextMessages.length - 1;
    setMessages(nextMessages);
    setDraft("");
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      await streamChat(
        sessionId,
        input,
        (evt) => {
          if (evt.event === "step.delta" && (evt.data.stepType === "final" || !evt.data.stepType)) {
            setMessages((current) => {
              const idx = assistantIndexRef.current ?? current.length - 1;
              if (idx < 0 || !current[idx]) return current;
              const updated = [...current];
              const prefix = updated[idx].content === "正在思考..." ? "" : updated[idx].content ?? "";
              updated[idx] = { ...updated[idx], content: `${prefix}${evt.data.text ?? ""}` };
              return updated;
            });
          }
          if (evt.event === "run.completed" || evt.event === "run.failed" || evt.event === "run.aborted") {
            setIsStreaming(false);
            abortRef.current = null;
          }
        },
        abortRef.current.signal
      );
    } catch (err) {
      setIsStreaming(false);
      abortRef.current = null;
      setMessages((current) => {
        const idx = assistantIndexRef.current ?? current.length - 1;
        if (idx < 0 || !current[idx]) return current;
        const updated = [...current];
        updated[idx] = {
          ...updated[idx],
          content: `请求失败：${err instanceof Error ? err.message : String(err)}`,
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
  }, [draft]);

  const lastAssistantMsg = messages.filter((m) => m.role === "assistant").pop();

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: "#fff",
        position: "relative",
      }}
    >
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {messages.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#bbb",
              fontSize: 14,
            }}
          >
            开始新的对话吧
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              {msg.role === "user" ? <UserAvatar /> : <AIAvatar />}
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1f1f1f" }}>
                {msg.role === "user" ? "You" : "AI 助手"}
              </span>
            </div>
            <div style={{ paddingLeft: 42 }}>
              {msg.role === "user" ? (
                <div style={{ whiteSpace: "pre-wrap", fontSize: 15, lineHeight: 1.7, color: "#1f1f1f" }}>
                  {msg.content}
                </div>
              ) : (
                <>
                  <div className="md-content" style={{ fontSize: 15, lineHeight: 1.7, color: "#1f1f1f" }}>
                    <Markdown remarkPlugins={[remarkGfm]}>{msg.content || ""}</Markdown>
                  </div>
                  {!isStreaming && msg.role === "assistant" && msg.id === lastAssistantMsg?.id && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14 }}>
                      <button
                        onClick={() => handleCopy(msg.content || "")}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 13,
                          color: "#666",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: "4px 0",
                        }}
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
        ))}

        {isStreaming && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 42, marginBottom: 20 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#999",
                animation: "pulse 1.4s infinite",
                display: "inline-block",
              }}
            />
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#999",
                animation: "pulse 1.4s infinite 0.2s",
                display: "inline-block",
              }}
            />
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#999",
                animation: "pulse 1.4s infinite 0.4s",
                display: "inline-block",
              }}
            />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid #f0f0f0", background: "#fff", flexShrink: 0 }}>
        <div
          style={{
            background: "#fff",
            border: `1px solid ${isFocused ? "#d0d0d0" : "#e8e8e8"}`,
            borderRadius: 16,
            padding: "10px 14px 8px",
            boxShadow: isFocused ? "0 4px 12px rgba(0,0,0,0.06)" : "0 2px 8px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        >
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="输入消息..."
            rows={1}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              resize: "none",
              outline: "none",
              fontSize: 14,
              lineHeight: 1.5,
              maxHeight: 100,
              minHeight: 22,
              padding: 0,
              color: "#1f1f1f",
              fontFamily: "inherit",
              overflowY: "auto",
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend(draft);
              }
            }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <button
              onClick={() => isStreaming ? handleStop() : void handleSend(draft)}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: isStreaming ? "#ff5252" : (draft.trim() ? "#1f1f1f" : "#d9d9d9"),
                color: "#fff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              {isStreaming ? <StopIcon size={14} /> : <SendIcon size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChatInterface({}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSessions().then((list) => {
      if (!alive) return;
      if (list.length > 0) {
        setCurrentSessionId(list[0].id);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (collapsed) {
    return (
      <div
        style={{
          width: 32,
          borderLeft: "1px solid #e8e8e8",
          background: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(false)}
      >
        <span style={{ writingMode: "vertical-rl", fontSize: 12, color: "#666", letterSpacing: 2 }}>
          对话
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#fff",
        borderLeft: "1px solid #e8e8e8",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: "#1f1f1f" }}>AI 对话</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            onClick={() => setCollapsed(true)}
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              color: "#888",
              fontSize: 12,
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              background: "#fff",
            }}
            title="收起"
          >
            ◀
          </div>
        </div>
      </div>

      {currentSessionId ? (
        <ChatPanel key={currentSessionId} sessionId={currentSessionId} />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontSize: 13,
          }}
        >
          加载中...
        </div>
      )}
    </div>
  );
}
