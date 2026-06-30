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
  MessageSeparator,
  Avatar,
} from "@chatscope/chat-ui-kit-react";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import type { Message as Msg } from "../api/client";
import { fetchMessages } from "../api/client";
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

export function ChatInterface({ sheets, currentSheetId = 0 }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const refsInitialized = useRef(false);

  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new TextStreamChatTransport({
      api: `/api/sheets/${currentSheetId}/chat`,
    }),
    onError: (err) => {
      console.error("AI 对话失败:", err);
    },
  });

  useEffect(() => {
    if (!currentSheetId || refsInitialized.current) return;
    refsInitialized.current = true;
    fetchMessages(currentSheetId).then((msgs: Msg[]) => {
      setMessages(
        msgs.map((m) => ({
          id: String(m.id),
          role: m.role as "user" | "assistant",
          parts: [{ type: "text" as const, text: m.content }],
        })),
      );
    });
  }, [currentSheetId, setMessages]);

  const getText = (msg: (typeof messages)[0]): string => {
    if (!msg.parts) return "";
    return msg.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("");
  };

  const isStreaming = status === "streaming";

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
            ))}
            {messages.length === 0 && !isStreaming && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: 60,
                  color: "#999",
                  fontSize: 13,
                }}
              >
                输入问题，AI 将帮你分析数据
              </div>
            )}
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
    </div>
  );
}