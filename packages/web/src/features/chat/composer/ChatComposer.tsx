import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
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
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
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
  onAttachExcel,
  referenceCacheRevision,
  workspaceId,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttachExcel: (file: File) => Promise<void> | void;
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
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setEditorEmpty(!editorText || editorText.trim() === "");
  }, [editorText]);

  const handleAttachClick = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const handleAttachmentChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void onAttachExcel(file);
    }
    event.target.value = "";
  }, [onAttachExcel]);

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

        {/* Bottom bar: actions + send */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            ref={attachmentInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleAttachmentChange}
          />
          <button
            type="button"
            onClick={handleAttachClick}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              background: "var(--background)",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
            title="上传 Excel"
            aria-label="上传 Excel"
          >
            <AttachIcon />
            <span>上传 Excel</span>
          </button>
          <div style={{ flex: 1 }} />
          <button
            type="button"
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
