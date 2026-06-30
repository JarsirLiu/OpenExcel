import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
} from "@chatscope/chat-ui-kit-react";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import type { Message as Msg, Session } from "../api/client";
import { fetchMessages, fetchSessions, createSession, streamChat } from "../api/client";
import type { SheetSchema } from "../api/client";

const blinkStyle = `
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
.md-content p { margin: 0 0 4px 0; }
.md-content p:last-child { margin-bottom: 0; }
.md-content ul, .md-content ol { margin: 2px 0; padding-left: 16px; }
.md-content li { margin: 0; }
.md-content code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
.md-content pre { margin: 4px 0; }
`;

interface Props {
  sheets: SheetSchema[];
  currentSheetId?: number;
}

function ChatPanel({ sessionId }: { sessionId: number }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const assistantIndexRef = useRef<number | null>(null);
  const [stepsByRun, setStepsByRun] = useState<Record<string, any[]>>({});
  const stepContentRef = useRef<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  const stepMeta = (step: any) => {
    if (step.stepType === "reasoning" || step.type === "reasoning") {
      return {
        label: "推理",
        bg: "#f6f7ff",
        border: "#cfd6ff",
        color: "#3f4c9a",
      };
    }
    if (step.stepType === "tool_call" || step.type === "tool_call") {
      return {
        label: "工具调用",
        bg: "#fff8ec",
        border: "#f4d28a",
        color: "#8a5b00",
      };
    }
    if (step.stepType === "tool_result" || step.type === "tool_result") {
      return {
        label: "工具结果",
        bg: "#eefaf1",
        border: "#a6dfb0",
        color: "#1d6b36",
      };
    }
    return {
      label: "最终回答",
      bg: "#ffffff",
      border: "#d9d9d9",
      color: "#1f1f1f",
    };
  };

  useEffect(() => {
    fetchMessages(sessionId).then(setMessages);
    assistantIndexRef.current = null;
    setDraft("");
    setStepsByRun({});
  }, [sessionId]);

  const renderText = (msg: Msg) => msg.content || "";

  const handleSend = async (text: string) => {
    const input = text.trim();
    if (!input || isStreaming) return;

    const nextMessages: Msg[] = [...messages, { id: `local-user-${Date.now()}`, role: "user", content: input }];
    nextMessages.push({ id: `local-assistant-${Date.now()}`, role: "assistant", content: "正在思考..." });
    assistantIndexRef.current = nextMessages.length - 1;
    setMessages(nextMessages);
    setDraft("");
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      await streamChat(sessionId, input, (evt) => {
        if (evt.event === "run.started") {
          setStepsByRun((current) => ({ ...current, [String(evt.data.runId)]: [] }));
        }
        if (evt.event === "step.started") {
          const runId = String(evt.data.runId ?? "0");
          const stepType = evt.data.stepType ?? "unknown";
          setStepsByRun((current) => {
            const list = current[runId] ? [...current[runId]] : [];
            const key = `${runId}-${stepType}`;
            const existing = list.find((s) => s._key === key);
            if (!existing) {
              list.push({ _key: key, stepType, content: "", status: "streaming" });
            }
            return { ...current, [runId]: list };
          });
        }
        if (evt.event === "step.delta") {
          const stepType = evt.data.stepType ?? "";
          const runId = String(evt.data.runId ?? "0");
          const key = `${runId}-${stepType}`;
          stepContentRef.current[key] = (stepContentRef.current[key] ?? "") + (evt.data.text ?? "");
          setStepsByRun((current) => {
            const list = current[runId] ? [...current[runId]] : [];
            const step = list.find((s) => s._key === key);
            if (step) {
              step.content = stepContentRef.current[key];
            }
            return { ...current, [runId]: list };
          });
          if (stepType === "final") {
            setMessages((current) => {
              const idx = assistantIndexRef.current ?? current.length - 1;
              if (idx < 0 || !current[idx]) return current;
              const updated = [...current];
              const prefix = updated[idx].content === "正在思考..." ? "" : updated[idx].content ?? "";
              updated[idx] = { ...updated[idx], content: `${prefix}${evt.data.text ?? ""}` };
              return updated;
            });
          }
        }
        if (evt.event === "step.completed") {
          const runId = String(evt.data.runId ?? "0");
          const stepType = evt.data.stepType ?? "";
          const key = `${runId}-${stepType}`;
          setStepsByRun((current) => {
            const list = current[runId] ? [...current[runId]] : [];
            const step = list.find((s) => s._key === key);
            if (step) {
              step.status = "completed";
              step.content = step.content || evt.data.output || evt.data.text || "";
              if (evt.data.toolName) step.toolName = evt.data.toolName;
            } else if (stepType === "tool_result") {
              list.push({ _key: key, stepType, toolName: evt.data.toolName, content: evt.data.output ?? "", status: "completed" });
            }
            return { ...current, [runId]: list };
          });
        }
        if (evt.event === "run.completed" || evt.event === "run.failed" || evt.event === "run.aborted") {
          setIsStreaming(false);
          abortRef.current = null;
        }
      }, abortRef.current.signal);
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

  return (
    <MainContainer style={{ flex: 1, height: "100%" }}>
      <ChatContainer>
        <MessageList autoScrollToBottom={true}>
          {messages.map((msg, idx) => (
            <Message
              key={msg.id}
              model={{
                message: "",
                direction: msg.role === "user" ? "outgoing" : "incoming",
                position: "single",
              }}
            >
              {msg.role === "user" ? (
                <Message.CustomContent>
                  <div style={{ whiteSpace: "pre-wrap" }}>{renderText(msg)}</div>
                </Message.CustomContent>
              ) : (
                <Message.CustomContent>
                  <div className="md-content">
                    <Markdown remarkPlugins={[remarkGfm]}>{renderText(msg)}</Markdown>
                  </div>
                  {isStreaming && idx === messages.length - 1 && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 6,
                        height: 12,
                        backgroundColor: "#999",
                        marginLeft: 2,
                        verticalAlign: "middle",
                        animation: "blink 1s infinite",
                      }}
                    />
                  )}
                </Message.CustomContent>
              )}
            </Message>
          ))}
          </MessageList>
        <MessageInput
          placeholder="输入消息..."
          value={draft}
          onChange={(val) => setDraft(String(val))}
          onSend={(_, text) => {
            void handleSend(text);
          }}
          attachButton={false}
          autoFocus
          disabled={isStreaming}
          sendButton={!isStreaming}
        />
        {isStreaming && (
          <div style={{ position: "absolute", right: 8, bottom: 8, zIndex: 10 }}>
            <button
              onClick={handleStop}
              style={{
                background: "#ff5252",
                border: "none",
                borderRadius: 4,
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
                lineHeight: "16px",
              }}
            >
              停止
            </button>
          </div>
        )}
      </ChatContainer>
      {Object.entries(stepsByRun).length > 0 && (
        <div style={{ borderTop: "1px solid #e5e5e5", padding: 8, fontSize: 11, color: "#666", overflowY: "auto" }}>
          {Object.entries(stepsByRun).map(([runId, steps]) => (
            <div key={runId} style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Run {runId}</div>
              {steps.map((step: any) => (
                <div
                  key={step._key}
                  style={{
                    marginLeft: 8,
                    marginBottom: 6,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: stepMeta(step).bg,
                    border: `1px solid ${stepMeta(step).border}`,
                    color: stepMeta(step).color,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 2 }}>{stepMeta(step).label}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {step.toolName ? `${step.toolName} ` : ""}
                    {step.content ?? step.output ?? step.input ?? step.reasoning ?? step.text ?? ""}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </MainContainer>
  );
}

export function ChatInterface({ currentSheetId = 0 }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  useEffect(() => {
    if (!currentSheetId) return;
    fetchSessions(currentSheetId).then(async (list) => {
      setSessions(list);
      if (list.length > 0) {
        setCurrentSessionId(list[0].id);
      } else {
        const s = await createSession(currentSheetId);
        setSessions([s]);
        setCurrentSessionId(s.id);
      }
    });
  }, [currentSheetId]);

  const handleNewSession = async () => {
    if (!currentSheetId) return;
    const s = await createSession(currentSheetId);
    setSessions((prev) => [s, ...prev]);
    setCurrentSessionId(s.id);
  };

  if (collapsed) {
    return (
      <div
        style={{
          width: 32,
          borderLeft: "1px solid #d0d0d0",
          background: "#f5f5f5",
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
        width: 360,
        borderLeft: "1px solid #d0d0d0",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <style>{blinkStyle}</style>

      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #d0d0d0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#f5f5f5",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>AI 对话</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={handleNewSession} style={{ fontSize: 11, padding: "2px 6px", cursor: "pointer" }}>
            + 新建
          </button>
          <div
            onClick={() => setCollapsed(true)}
            style={{
              padding: "4px 8px",
              cursor: "pointer",
              color: "#888",
              fontSize: 14,
              border: "1px solid #d0d0d0",
              borderRadius: 4,
            }}
            title="收起"
          >
            ◀
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "6px 8px",
            borderBottom: "1px solid #e0e0e0",
            overflowX: "auto",
            flexShrink: 0,
            background: "#fafafa",
          }}
        >
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setCurrentSessionId(s.id)}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                borderRadius: 4,
                cursor: "pointer",
                whiteSpace: "nowrap",
                background: s.id === currentSessionId ? "#d0d8e8" : "#e8ecf2",
                color: s.id === currentSessionId ? "#1a2332" : "#5b6473",
                fontWeight: s.id === currentSessionId ? 600 : 400,
              }}
            >
              {s.name}
            </div>
          ))}
        </div>
      )}

      {currentSessionId ? (
        <ChatPanel key={currentSessionId} sessionId={currentSessionId} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>
          加载中...
        </div>
      )}
    </div>
  );
}
