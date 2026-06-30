import { useState, useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
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
import { fetchMessages, fetchSessions, createSession } from "../api/client";
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

/** 消息列表 + 输入框，key={sessionId} 确保 useChat 随会话重建 */
function ChatPanel({ sessionId }: { sessionId: number }) {
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new TextStreamChatTransport({
      api: `/api/sessions/${sessionId}/chat`,
    }),
    onError: (err) => {
      console.error("AI 对话失败:", err);
    },
  });

  const hasLoadedRef = useRef(false);
  useEffect(() => {
    hasLoadedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    fetchMessages(sessionId).then((msgs: Msg[]) => {
      setMessages(
        msgs.map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant",
          parts: [{ type: "text" as const, text: m.content }],
        })),
      );
    });
  }, [sessionId, setMessages]);

  const getText = (msg: (typeof messages)[0]): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("");
  };

  const isStreaming = status === "streaming";

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
                    <div style={{ whiteSpace: "pre-wrap" }}>{getText(msg)}</div>
                  </Message.CustomContent>
                ) : (
                  <Message.CustomContent>
                    <div className="md-content">
                      <Markdown remarkPlugins={[remarkGfm]}>{getText(msg)}</Markdown>
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
            ))
          }
        </MessageList>
        <MessageInput
          placeholder="输入消息..."
          onSend={(_, text) => {
            if (!text.trim() || isStreaming) return;
            sendMessage({ text });
          }}
          attachButton={false}
          autoFocus
          disabled={isStreaming}
        />
      </ChatContainer>
    </MainContainer>
  );
}

export function ChatInterface({ sheets, currentSheetId = 0 }: Props) {
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

      {/* Header */}
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

      {/* Session tabs */}
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

      {/* Chat area - keyed by sessionId to rebuild useChat */}
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