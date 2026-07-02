import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { SheetChangeDelta } from "@openexcel/core";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Session } from "../api/client";
import { createSession, deleteSession, fetchMessages, fetchSessions, undoLatestRun } from "../api/client";
import { SheetPreview } from "./SheetPreview";
import { useSheetPatchSync } from "../hooks/useSheetPatchSync";
import { createMentionSuggestion } from "./SheetMentionList";

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

function ChatPanel({
  sessionId,
  initialMessages,
  onRunComplete,
  onSheetChanged,
  onStreamingChange,
  sheets,
}: {
  sessionId: number;
  initialMessages: any[];
  onRunComplete?: () => void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  sheets: { workbookId: number; workbookName: string; id: number; name: string }[];
}) {
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    const text = editor?.getText().trim() ?? "";
    if (!text || isStreaming) return;
    editor?.commands.clearContent();
    editor?.commands.focus();
    sendMessage({ text });
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: createMentionSuggestion(sheets),
      }),
    ],
    editorProps: {
      attributes: {
        class: "chat-input",
        "data-placeholder": "输入消息...",
      },
      handleKeyDown: (_, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSend();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      setEditorText(ed.getText());
    },
  });

  const [editorText, setEditorText] = useState("");

  const { messages, sendMessage, status, stop, error } = useChat({
    id: String(sessionId),
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/sessions/${sessionId}/chat`,
    }),
    onFinish: ({ isAbort, isError }) => {
      if (!isAbort && !isError) {
        void onRunComplete?.();
      }
    },
  });

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming, onStreamingChange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);
  useSheetPatchSync(messages, onSheetChanged);

  const contentText = (m: any) => {
    if (m.content) return m.content;
    if (m.parts) return m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("");
    return "";
  };

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#fff", position: "relative" }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#bbb", fontSize: 14 }}>
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
                  {contentText(msg)}
                </div>
              ) : (
                <>
                  {renderAssistantParts(msg, thinkingOpen, setThinkingOpen)}
                  {!isStreaming && msg.role === "assistant" && msg.id === lastAssistantMsg?.id && (
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14 }}>
                      <button
                        onClick={() => navigator.clipboard.writeText(contentText(msg) || "")}
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
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            对话失败：{error.message}
          </div>
        </div>
      )}

      {/* Stream indicator */}
      {isStreaming && (() => {
        const last = messages[messages.length - 1];
        const showDots = status === "submitted" || !last || last.role !== "assistant" || !last.parts?.some((p: any) =>
          p.type === "text" || p.type.startsWith("tool-") || p.type === "reasoning"
        );
        if (!showDots) return null;
        return (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <AIAvatar />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1f1f1f" }}>AI 助手</span>
            </div>
            <div style={{ paddingLeft: 42, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", animation: "pulse 1.4s infinite", display: "inline-block" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", animation: "pulse 1.4s infinite 0.2s", display: "inline-block" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", animation: "pulse 1.4s infinite 0.4s", display: "inline-block" }} />
            </div>
          </div>
        );
      })()}

      {/* Input */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid #f0f0f0", background: "#fff", flexShrink: 0 }}>
        <div style={{
          background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16,
          padding: "10px 14px 8px", display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div ref={editorRef} style={{ maxHeight: 105, overflowY: "auto", fontSize: 14, lineHeight: 1.5, color: "#1f1f1f" }}>
            <EditorContent editor={editor} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <button
              onClick={() => (isStreaming ? stop() : handleSend())}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: isStreaming ? "#ff5252" : (editorText.trim() ? "#1f1f1f" : "#d9d9d9"),
                color: "#fff", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.2s", flexShrink: 0,
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

function renderAssistantParts(
  msg: any,
  thinkingOpen: Record<string, boolean>,
  setThinkingOpen: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
) {
  if (!msg.parts || msg.parts.length === 0) {
    return <div className="md-content" style={{ fontSize: 15, lineHeight: 1.7, color: "#1f1f1f" }}>
      <Markdown remarkPlugins={[remarkGfm]}>{msg.content || ""}</Markdown>
    </div>;
  }

  const result: JSX.Element[] = [];
  let textParts: string[] = [];
  const flushText = (key: string) => {
    if (textParts.length > 0) {
      result.push(
        <div key={key} className="md-content" style={{ fontSize: 15, lineHeight: 1.7, color: "#1f1f1f" }}>
          <Markdown remarkPlugins={[remarkGfm]}>{textParts.join("")}</Markdown>
        </div>,
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
            {renderReasoning(msg.id, part.reasoning, thinkingOpen, setThinkingOpen)}
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
              {renderToolPart(part)}
            </div>,
          );
        }
        break;
    }
  }
  flushText("final-flush");

  return <>{result}</>;
}

function renderReasoning(id: string, reasoning: string, thinkingOpen: Record<string, boolean>, setThinkingOpen: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void) {
  const open = thinkingOpen[id] ?? true;
  return (
    <div
      onClick={() => setThinkingOpen((prev) => ({ ...prev, [id]: !prev[id] }))}
      style={{
        background: "#f6f8fa", border: "1px solid #e8ecf0", borderRadius: 8,
        marginBottom: 12, overflow: "hidden", cursor: "pointer", userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#555" }}>
        <span style={{ fontSize: 11 }}>{open ? "▼" : "▶"}</span>
        思考过程
      </div>
      {open && (
        <div style={{ padding: "0 12px 10px", fontSize: 13, lineHeight: 1.6, color: "#666", whiteSpace: "pre-wrap" }}>
          {reasoning}
        </div>
      )}
    </div>
  );
}

function renderToolPart(part: any) {
  const toolName = part.type.startsWith("tool-") ? part.type.slice(5) : part.toolName;
  const state = part.state || "input-streaming";
  const isComplete = state === "output-available" || state === "output-error";
  const isError = state === "output-error";
  const input = isStaticToolPart(part) ? part.input : part.args;
  const summary = typeof input === "object" ? JSON.stringify(input) : String(input ?? "");
  const output = isStaticToolPart(part) ? (part as any).output : undefined;
  const preview = output?.preview ?? null;
  const sheetInfo = output?.sheetInfo ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", background: "#fafbfc", border: "1px solid #e8ecf0",
        borderRadius: 8, fontSize: 13, color: "#555",
      }}>
        {isComplete ? (
          isError ? (
            <span style={{ color: "#ef4444", fontSize: 14, flexShrink: 0 }}>✕</span>
          ) : (
            <span style={{ color: "#22c55e", fontSize: 14, flexShrink: 0 }}>✓</span>
          )
        ) : (
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #d0d5dd", borderTopColor: "#3b82f6", animation: "spin 0.6s linear infinite", display: "inline-block", flexShrink: 0 }} />
        )}
        <span style={{ fontWeight: 500, color: "#1f1f1f", flexShrink: 0 }}>{toolName}</span>
        <span style={{ color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          {summary}
        </span>
        <span style={{ fontSize: 12, color: isComplete ? (isError ? "#ef4444" : "#22c55e") : "#3b82f6", flexShrink: 0 }}>
          {isComplete ? (isError ? "失败" : "已完成") : "运行中..."}
        </span>
      </div>
      {isComplete && !isError && preview?.rows?.length > 0 && (
        <div style={{ paddingLeft: 22, marginTop: 4 }}>
          <SheetPreview preview={preview} />
        </div>
      )}
      {isComplete && sheetInfo && (
        <div style={{ paddingLeft: 22, marginTop: 2, fontSize: 12, color: "#888" }}>
          修改了 Sheet: {sheetInfo.sheetName} (id: {sheetInfo.sheetId})
        </div>
      )}
    </div>
  );
}

function isStaticToolPart(part: any): boolean {
  return part.args === undefined && part.input !== undefined;
}

export function ChatInterface({
  onSheetChanged,
  onUndoComplete,
  sheets,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onUndoComplete?: () => void;
  sheets: { workbookId: number; workbookName: string; id: number; name: string }[];
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [initialMessages, setInitialMessages] = useState<any[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [undoState, setUndoState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [undoError, setUndoError] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (undoState !== "success") return;
    const timer = window.setTimeout(() => setUndoState("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [undoState]);

  useEffect(() => {
    setUndoState("idle");
    setUndoError("");
  }, [currentSessionId]);

  const loadSessions = () => {
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
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInitialLoaded(false);

    const loadInitialMessages = async () => {
      try {
        if (currentSessionId) {
          const msgs = await fetchMessages(currentSessionId);
          if (!cancelled) {
            setInitialMessages(msgs);
          }
        } else if (!cancelled) {
          setInitialMessages([]);
        }
      } finally {
        if (!cancelled) {
          setInitialLoaded(true);
        }
      }
    };

    void loadInitialMessages();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId]);

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

  const handleDeleteSession = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleUndoLatestRun = async () => {
    if (!currentSessionId || undoState === "loading" || isStreaming) return;
    setUndoState("loading");
    setUndoError("");
    try {
      await undoLatestRun(currentSessionId);
      setUndoState("success");
      void onUndoComplete?.();
    } catch (error) {
      setUndoState("error");
      setUndoError(error instanceof Error ? error.message : "撤销本轮修改失败");
    }
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", background: "#fff",
      borderLeft: "1px solid #e8e8e8", overflow: "hidden", position: "relative",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 12px", borderBottom: "1px solid #f0f0f0",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
          {sessions.find((s) => s.id === currentSessionId)?.name ?? "AI 对话"}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            onClick={handleUndoLatestRun}
            style={{
              padding: "4px 8px",
              cursor: currentSessionId && undoState !== "loading" && !isStreaming ? "pointer" : "not-allowed",
              color: currentSessionId && !isStreaming ? "#888" : "#c0c0c0",
              fontSize: 12,
              border: "1px solid #e0e0e0",
              borderRadius: 6,
              background: "#fff",
              opacity: undoState === "loading" || isStreaming ? 0.7 : 1,
            }}
            title={isStreaming ? "对话进行中，无法撤销" : undoState === "loading" ? "撤销中..." : "撤销本轮修改"}
          >{isStreaming ? "撤销" : (undoState === "loading" ? "撤销中" : "撤销")}</div>
          <div
            onClick={() => setHistoryOpen(!historyOpen)}
            style={{ padding: "4px 8px", cursor: "pointer", color: "#888", fontSize: 12, border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff" }}
            title="历史记录"
          >历史</div>
          <div
            onClick={handleNewSession}
            style={{ padding: "4px 8px", cursor: "pointer", color: "#888", fontSize: 16, border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff", lineHeight: 1 }}
            title="新建对话"
          >+</div>
        </div>
      </div>

      {/* History panel */}
      {historyOpen && (
        <div ref={historyRef} style={{
          position: "absolute", top: 44, left: 8, right: 8, zIndex: 100,
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 300, overflowY: "auto",
        }}>
          {sessions.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "#999", fontSize: 13 }}>暂无历史记录</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", cursor: "pointer",
                  background: s.id === currentSessionId ? "#f5f5f5" : "transparent",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <span style={{ fontSize: 13, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {s.name}
                </span>
                <div
                  onClick={(e) => handleDeleteSession(s.id, e)}
                  style={{ padding: "2px 6px", cursor: "pointer", color: "#bbb", fontSize: 14, lineHeight: 1, marginLeft: 8, flexShrink: 0 }}
                  title="删除"
                >✕</div>
              </div>
            ))
          )}
        </div>
      )}

      {undoError && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            撤销失败：{undoError}
          </div>
        </div>
      )}
      {undoState === "success" && (
        <div style={{ padding: "10px 14px 0" }}>
          <div style={{
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            已撤销本轮修改
          </div>
        </div>
      )}

      {currentSessionId && initialLoaded ? (
        <ChatPanel
          key={currentSessionId}
          sessionId={currentSessionId}
          initialMessages={initialMessages}
          onRunComplete={loadSessions}
          onSheetChanged={onSheetChanged}
          onStreamingChange={setIsStreaming}
          sheets={sheets}
        />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>加载中...</div>
      )}
    </div>
  );
}
