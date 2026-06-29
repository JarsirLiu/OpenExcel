import { useState, useEffect, useRef, useCallback } from "react";
import type { Message } from "../api/client";
import { fetchMessages, sendMessage, chatWithAI } from "../api/client";
import type { SheetSchema } from "../api/client";

interface Props {
  sheets: SheetSchema[];
  currentSheetId?: number;
}

export function ChatInterface({ sheets, currentSheetId = 0 }: Props) {
  const [width, setWidth] = useState(360);
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRefMenu, setShowRefMenu] = useState(false);
  const [refCursor, setRefCursor] = useState({ start: 0, end: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (currentSheetId) {
      fetchMessages(currentSheetId).then(setMessages);
    }
  }, [currentSheetId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    try {
      const userMessage = await sendMessage(currentSheetId, "user", userMsg);
      setMessages((prev) => [...prev, userMessage]);

      const aiMessage = await chatWithAI(currentSheetId, userMsg);
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      console.error("发送失败:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "@" && !showRefMenu) {
      setShowRefMenu(true);
      setRefCursor({ start: e.currentTarget.selectionStart!, end: e.currentTarget.selectionEnd! });
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const newWidth = Math.min(Math.max(e.clientX, 240), 600);
    setWidth(newWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const insertRef = (type: "sheet", name: string, id: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = refCursor.start;
    const end = refCursor.end;
    const before = input.substring(0, start);
    const after = input.substring(end);
    const refText = `[ref:${type}:${id}]${name}[ref:${type}:${id}]`;
    
    setInput(before + refText + after);
    setShowRefMenu(false);
    textarea.focus();
  };

  if (collapsed) {
    return (
      <div
        style={{
          width: 32,
          borderLeft: "1px solid #d0d0d0",
          background: "#f5f5f5",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 12,
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(false)}
      >
        <span style={{ writingMode: "vertical-rl", fontSize: 12, color: "#666", letterSpacing: 2 }}>对话</span>
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        borderLeft: "1px solid #d0d0d0",
        display: "flex",
        flexDirection: "column",
        background: "#fafafa",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          cursor: "ew-resize",
          background: "transparent",
        }}
        onMouseDown={handleMouseDown}
      />

      <div style={{ padding: "10px 12px", borderBottom: "1px solid #d0d0d0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>AI 对话</span>
        <div
          onClick={() => setCollapsed(true)}
          style={{ padding: "4px 8px", cursor: "pointer", color: "#888", fontSize: 14, border: "1px solid #d0d0d0", borderRadius: 4 }}
          title="收起"
        >
          ◀
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {messages.length === 0 && (
          <div style={{ color: "#999", textAlign: "center", marginTop: 40 }}>
            输入问题，AI 将帮你分析数据<br/>
            <span style={{ fontSize: 12 }}>提示：输入 @ 引用 Excel 表或 Sheet</span>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: 12,
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "8px 12px",
                borderRadius: 8,
                backgroundColor: msg.role === "user" ? "#007bff" : "#e9ecef",
                color: msg.role === "user" ? "#fff" : "#333",
                wordBreak: "break-word",
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ borderTop: "1px solid #ddd", padding: 12, position: "relative" }}>
        {showRefMenu && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: 12,
              right: 12,
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 4,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              maxHeight: 200,
              overflowY: "auto",
              zIndex: 10,
            }}
          >
            {sheets.map((sheet) => (
              <div
                key={sheet.id}
                onClick={() => insertRef("sheet", sheet.name, sheet.id)}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 13,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                📊 {sheet.name}
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (e.target.value.endsWith("@")) {
              setShowRefMenu(true);
              setRefCursor({ start: e.target.selectionStart!, end: e.target.selectionEnd! });
            } else {
              setShowRefMenu(false);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，按 Enter 发送... (@ 引用 Sheet)"
          rows={3}
          style={{
            width: "100%",
            padding: 8,
            border: "1px solid #ccc",
            borderRadius: 4,
            resize: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "8px 16px",
            backgroundColor: loading || !input.trim() ? "#ccc" : "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "发送中..." : "发送"}
        </button>
      </div>
    </div>
  );
}
