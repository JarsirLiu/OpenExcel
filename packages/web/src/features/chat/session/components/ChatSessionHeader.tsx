type Props = {
  sessionName: string;
  currentSessionId: number | null;
  undoState: "idle" | "loading" | "success" | "error";
  undoError: string;
  isStreaming: boolean;
  onUndoLatestRun: () => void;
  onToggleHistory: () => void;
  onNewSession: () => void;
};

export function ChatSessionHeader({
  sessionName,
  currentSessionId,
  undoState,
  undoError,
  isStreaming,
  onUndoLatestRun,
  onToggleHistory,
  onNewSession,
}: Props) {
  return (
    <>
      <div style={{
        padding: "10px 12px", borderBottom: "1px solid #f0f0f0",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
          {sessionName}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            onClick={onUndoLatestRun}
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
          >
            {isStreaming ? "撤销" : (undoState === "loading" ? "撤销中" : "撤销")}
          </div>
          <div
            onClick={onToggleHistory}
            style={{ padding: "4px 8px", cursor: "pointer", color: "#888", fontSize: 12, border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff" }}
            title="历史记录"
          >
            历史
          </div>
          <div
            onClick={onNewSession}
            style={{ padding: "4px 8px", cursor: "pointer", color: "#888", fontSize: 16, border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff", lineHeight: 1 }}
            title="新建对话"
          >
            +
          </div>
        </div>
      </div>
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
    </>
  );
}
