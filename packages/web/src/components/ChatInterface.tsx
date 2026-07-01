import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message as Msg, Session } from "../api/client";
import { createSession, deleteSession, fetchMessages, fetchSessions, renameSession, streamChat } from "../api/client";
import { SheetPreview } from "./SheetPreview";

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

interface ToolCallDisplay {
  id: string;
  toolName: string;
  summary: string;
  status: "running" | "completed";
  preview?: any;
}

interface Props {}

function ChatPanel({ sessionId, onRunComplete, onTitleGenerated }: { sessionId: number; onRunComplete?: () => void; onTitleGenerated?: (title: string) => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [streamReasoning, setStreamReasoning] = useState("");
  const [streamFinal, setStreamFinal] = useState("");
  const [streamToolCalls, setStreamToolCalls] = useState<ToolCallDisplay[]>([]);
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamReasoningRef = useRef("");
  const streamFinalRef = useRef("");
  const streamToolCallsRef = useRef<ToolCallDisplay[]>([]);

  useEffect(() => {
    fetchMessages(sessionId).then(setMessages);
    setDraft("");
    setStreamReasoning("");
    setStreamFinal("");
    setStreamToolCalls([]);
    streamToolCallsRef.current = [];
    setIsStreaming(false);
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming, streamReasoning, streamFinal, streamToolCalls]);

  const handleSend = async (text: string) => {
    const input = text.trim();
    if (!input || isStreaming) return;

    const userMsg: Msg = { id: `local-user-${Date.now()}`, role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);

    setDraft("");
    setIsStreaming(true);
    streamReasoningRef.current = "";
    streamFinalRef.current = "";
    streamToolCallsRef.current = [];
    setStreamReasoning("");
    setStreamFinal("");
    setStreamToolCalls([]);
    abortRef.current = new AbortController();

    try {
      await streamChat(
        sessionId,
        input,
        (evt) => {
          if (evt.event === "step.delta" && evt.data.stepType === "reasoning") {
            streamReasoningRef.current += evt.data.text ?? "";
            setStreamReasoning(streamReasoningRef.current);
          }
          if (evt.event === "step.delta" && evt.data.stepType === "final") {
            streamFinalRef.current += evt.data.text ?? "";
            setStreamFinal(streamFinalRef.current);
          }
          if (evt.event === "step.started" && evt.data.stepType === "tool_call") {
            const tc: ToolCallDisplay = {
              id: `${evt.data.toolName}-${Date.now()}-${Math.random()}`,
              toolName: evt.data.toolName,
              summary: JSON.stringify(evt.data.input),
              status: "running",
            };
            streamToolCallsRef.current = [...streamToolCallsRef.current, tc];
            setStreamToolCalls(streamToolCallsRef.current);
          }
          if (evt.event === "step.completed" && evt.data.stepType === "tool_result") {
            streamToolCallsRef.current = streamToolCallsRef.current.map((t) =>
              t.toolName === evt.data.toolName && t.status === "running"
                ? { ...t, status: "completed", preview: evt.data.output?.preview ?? null }
                : t,
            );
            setStreamToolCalls(streamToolCallsRef.current);
          }
          if (evt.event === "sheet.changed") {
            window.dispatchEvent(
              new CustomEvent("openexcel:sheet-changed", {
                detail: { sheetId: evt.data.sheetId },
              }),
            );
          }
          if (evt.event === "run.completed" || evt.event === "run.failed" || evt.event === "run.aborted") {
            if (evt.event === "run.completed") {
              const final = streamFinalRef.current;
              setMessages((prev) => {
                const next = [...prev];
                next.push({
                  id: `assistant-${Date.now()}`,
                  role: "assistant",
                  content: final,
                  reasoning: streamReasoningRef.current,
                });
                return next;
              });
              onRunComplete?.();
              if (evt.data.title) onTitleGenerated?.(evt.data.title);
            }
            setIsStreaming(false);
            setStreamReasoning("");
            setStreamFinal("");
            setStreamToolCalls([]);
            streamReasoningRef.current = "";
            streamFinalRef.current = "";
            streamToolCallsRef.current = [];
            abortRef.current = null;
          }
        },
        abortRef.current.signal
      );
    } catch (err) {
      setIsStreaming(false);
      setStreamReasoning("");
      setStreamFinal("");
      setStreamToolCalls([]);
      streamReasoningRef.current = "";
      streamFinalRef.current = "";
      streamToolCallsRef.current = [];
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

  const toggleThinking = (id: string) => {
    setThinkingOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
  }, [draft]);

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");

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
                  {msg.reasoning && (
                    <div
                      onClick={() => toggleThinking(msg.id)}
                      style={{
                        background: "#f6f8fa",
                        border: "1px solid #e8ecf0",
                        borderRadius: 8,
                        marginBottom: 12,
                        overflow: "hidden",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 12px",
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#555",
                        }}
                      >
                        <span style={{ fontSize: 11 }}>{thinkingOpen[msg.id] ? "▼" : "▶"}</span>
                        思考过程
                      </div>
                      {thinkingOpen[msg.id] && (
                        <div
                          style={{
                            padding: "0 12px 10px",
                            fontSize: 13,
                            lineHeight: 1.6,
                            color: "#666",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {msg.reasoning}
                        </div>
                      )}
                    </div>
                  )}
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
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <AIAvatar />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1f1f1f" }}>AI 助手</span>
            </div>
            <div style={{ paddingLeft: 42 }}>
              {streamReasoning && (
                <div
                  style={{
                    background: "#f6f8fa",
                    border: "1px solid #e8ecf0",
                    borderRadius: 8,
                    marginBottom: 12,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 12px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#555",
                    }}
                  >
                    <span style={{ fontSize: 11 }}>▼</span>
                    思考过程
                  </div>
                  <div
                    style={{
                      padding: "0 12px 10px",
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: "#666",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {streamReasoning}
                  </div>
                </div>
              )}
              {streamToolCalls.length > 0 && (
                <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {streamToolCalls.map((tc) => (
                    <div key={tc.id}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 12px",
                          background: "#fafbfc",
                          border: "1px solid #e8ecf0",
                          borderRadius: 8,
                          fontSize: 13,
                          color: "#555",
                        }}
                      >
                        {tc.status === "running" ? (
                          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #d0d5dd", borderTopColor: "#3b82f6", animation: "spin 0.6s linear infinite", display: "inline-block", flexShrink: 0 }} />
                        ) : (
                          <span style={{ color: "#22c55e", fontSize: 14, flexShrink: 0 }}>✓</span>
                        )}
                        <span style={{ fontWeight: 500, color: "#1f1f1f", flexShrink: 0 }}>
                          {tc.toolName}
                        </span>
                        <span style={{ color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                          {tc.summary}
                        </span>
                        <span style={{ fontSize: 12, color: tc.status === "running" ? "#3b82f6" : "#22c55e", flexShrink: 0 }}>
                          {tc.status === "running" ? "运行中..." : "已完成"}
                        </span>
                      </div>
                      {tc.status === "completed" && tc.preview?.rows?.length > 0 && (
                        <div style={{ paddingLeft: 22, marginTop: 4 }}>
                          <SheetPreview preview={tc.preview} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {streamFinal ? (
                <div className="md-content" style={{ fontSize: 15, lineHeight: 1.7, color: "#1f1f1f" }}>
                  <Markdown remarkPlugins={[remarkGfm]}>{streamFinal}</Markdown>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", animation: "pulse 1.4s infinite", display: "inline-block" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", animation: "pulse 1.4s infinite 0.2s", display: "inline-block" }} />
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", animation: "pulse 1.4s infinite 0.4s", display: "inline-block" }} />
                </div>
              )}
            </div>
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(() => {
    fetchSessions().then((list) => {
      setSessions(list);
      if (list.length > 0 && !currentSessionId) {
        setCurrentSessionId(list[0].id);
      } else if (list.length === 0) {
        createSession().then((s) => {
          setSessions([s]);
          setCurrentSessionId(s.id);
        });
      }
    });
  }, [currentSessionId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [historyOpen]);

  const handleNewSession = async () => {
    const s = await createSession();
    setSessions((prev) => [s, ...prev]);
    setCurrentSessionId(s.id);
  };

  const handleSelectSession = (id: number) => {
    setCurrentSessionId(id);
    setHistoryOpen(false);
  };

  const handleTitleGenerated = (title: string) => {
    setSessions((prev) => prev.map((s) => (s.id === currentSessionId ? { ...s, name: title } : s)));
  };

  const handleDeleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#fff",
        borderLeft: "1px solid #e8e8e8",
        overflow: "hidden",
        position: "relative",
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
        <span style={{ fontWeight: 600, fontSize: 14, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
          {sessions.find((s) => s.id === currentSessionId)?.name ?? "AI 对话"}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            onClick={() => setHistoryOpen(!historyOpen)}
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              color: "#888",
              fontSize: 12,
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              background: "#fff",
            }}
            title="历史记录"
          >
            历史
          </div>
          <div
            onClick={handleNewSession}
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              color: "#888",
              fontSize: 16,
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              background: "#fff",
              lineHeight: 1,
            }}
            title="新建对话"
          >
            +
          </div>
        </div>
      </div>

      {/* History panel */}
      {historyOpen && (
        <div
          ref={historyRef}
          style={{
            position: "absolute",
            top: 44,
            left: 8,
            right: 8,
            zIndex: 100,
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            maxHeight: 300,
            overflowY: "auto",
          }}
        >
          {sessions.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "#999", fontSize: 13 }}>
              暂无历史记录
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  cursor: "pointer",
                  background: s.id === currentSessionId ? "#f5f5f5" : "transparent",
                  borderBottom: "1px solid #f0f0f0",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = s.id === currentSessionId ? "#f5f5f5" : "transparent")}
              >
                <span style={{ fontSize: 13, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {s.name}
                </span>
                <div
                  onClick={(e) => handleDeleteSession(s.id, e)}
                  style={{
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 14,
                    color: "#bbb",
                    cursor: "pointer",
                    lineHeight: 1,
                    marginLeft: 8,
                    flexShrink: 0,
                  }}
                  title="删除"
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#ff5252")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#bbb")}
                >
                  ✕
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {currentSessionId ? (
        <ChatPanel key={currentSessionId} sessionId={currentSessionId} onRunComplete={loadSessions} onTitleGenerated={handleTitleGenerated} />
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
