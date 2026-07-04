import { useEffect, useRef, useState } from "react";
import { EditorContent } from "@tiptap/react";
import { useChatComposer } from "./useChatComposer";

const SendIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const StopIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

const AttachIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const ScissorsIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

const PLACEHOLDERS = [
  "使用 @来引用表格",
  "让AI来帮你修改表格",
];

export function ChatComposer({
  isStreaming,
  onSend,
  onStop,
  referenceCacheRevision,
  workspaceId,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  referenceCacheRevision: number;
  workspaceId: number;
}) {
  const { editor, editorText, handleSend } = useChatComposer({
    isStreaming,
    onSend,
    referenceCacheRevision,
    workspaceId,
  });

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [editorEmpty, setEditorEmpty] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setEditorEmpty(!editorText || editorText.trim() === "");
  }, [editorText]);

  return (
    <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", background: "var(--background)", flexShrink: 0 }}>
      <div style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        {/* Editor area with overlay placeholder */}
        <div style={{ position: "relative", minHeight: 24 }}>
          <div style={{ maxHeight: 120, overflowY: "auto", fontSize: 15, lineHeight: 1.5, color: "var(--foreground)" }}>
            {editor && <EditorContent editor={editor} />}
          </div>
          {editorEmpty && (
            <span style={{
              position: "absolute", top: 0, left: 0,
              fontSize: 13, color: "var(--hint-foreground)", pointerEvents: "none",
              transition: "opacity 0.3s",
            }}>
              {PLACEHOLDERS[placeholderIndex]}
            </span>
          )}
        </div>

        {/* Bottom bar: toggle + icons + send */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", color: "var(--muted-foreground)", fontSize: 13 }}>
            <div style={{
              width: 30, height: 18, borderRadius: "var(--radius-pill)",
              background: "var(--border)", position: "relative", transition: "background 0.2s",
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: "var(--radius-pill)",
                background: "#fff", position: "absolute", top: 2, left: 2,
                transition: "left 0.2s",
              }} />
            </div>
            <span>与页面对话</span>
          </label>
          <div style={{ flex: 1 }} />
          <button style={{
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", color: "var(--muted-foreground)", padding: 4, borderRadius: "var(--radius-pill)",
          }}>
            <ScissorsIcon />
          </button>
          <button style={{
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", color: "var(--muted-foreground)", padding: 4, borderRadius: "var(--radius-pill)",
          }}>
            <AttachIcon />
          </button>
          <button
            onClick={() => (isStreaming ? onStop() : handleSend())}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--primary)",
              color: "var(--primary-foreground)", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isStreaming ? <StopIcon /> : <SendIcon />}
          </button>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 12, color: "var(--hint-foreground)",
      }}>
        <span style={{ color: "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5Z" />
          </svg>
          升级
        </span>
        <span>以上内容均由AI生成，仅供参考和借鉴</span>
        <span>GB ENG</span>
      </div>
    </div>
  );
}