import { EditorContent } from "@tiptap/react";
import { useChatComposer } from "./useChatComposer";

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

  return (
    <div style={{ padding: "10px 14px", borderTop: "1px solid #f0f0f0", background: "#fff", flexShrink: 0 }}>
      <div style={{
        background: "#fff", border: "1px solid #e8e8e8", borderRadius: 16,
        padding: "10px 14px 8px", display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ maxHeight: 105, overflowY: "auto", fontSize: 14, lineHeight: 1.5, color: "#1f1f1f" }}>
          {editor && <EditorContent editor={editor} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          <button
            onClick={() => (isStreaming ? onStop() : handleSend())}
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
  );
}
