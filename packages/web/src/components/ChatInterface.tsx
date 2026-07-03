import { useEffect, useRef } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import { ChatPanel } from "../features/chat/ChatPanel";
import { useSessionWorkspace } from "../features/chat/useSessionWorkspace";

export function ChatInterface({
  onSheetChanged,
  onUndoComplete,
  sheets,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onUndoComplete?: () => void;
  sheets: { workbookId: number; workbookName: string; id: number; name: string }[];
}) {
  const historyRef = useRef<HTMLDivElement>(null);
  const {
    sessions,
    currentSessionId,
    initialMessages,
    initialLoaded,
    historyOpen,
    setHistoryOpen,
    undoState,
    undoError,
    isStreaming,
    setIsStreaming,
    refreshSessions,
    handleNewSession,
    handleSelectSession,
    handleDeleteSession,
    handleUndoLatestRun,
  } = useSessionWorkspace(onUndoComplete);

  useEffect(() => {
    if (!historyOpen) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [historyOpen, setHistoryOpen]);

  const currentSession = sessions.find((session) => session.id === currentSessionId);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", background: "#fff",
      borderLeft: "1px solid #e8e8e8", overflow: "hidden", position: "relative",
    }}>
      <div style={{
        padding: "10px 12px", borderBottom: "1px solid #f0f0f0",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>
          {currentSession?.name ?? "AI 对话"}
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
          >
            {isStreaming ? "撤销" : (undoState === "loading" ? "撤销中" : "撤销")}
          </div>
          <div
            onClick={() => setHistoryOpen(!historyOpen)}
            style={{ padding: "4px 8px", cursor: "pointer", color: "#888", fontSize: 12, border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff" }}
            title="历史记录"
          >
            历史
          </div>
          <div
            onClick={() => void handleNewSession()}
            style={{ padding: "4px 8px", cursor: "pointer", color: "#888", fontSize: 16, border: "1px solid #e0e0e0", borderRadius: 6, background: "#fff", lineHeight: 1 }}
            title="新建对话"
          >
            +
          </div>
        </div>
      </div>

      {historyOpen && (
        <div ref={historyRef} style={{
          position: "absolute", top: 44, left: 8, right: 8, zIndex: 100,
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 300, overflowY: "auto",
        }}>
          {sessions.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "#999", fontSize: 13 }}>暂无历史记录</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSelectSession(session.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", cursor: "pointer",
                  background: session.id === currentSessionId ? "#f5f5f5" : "transparent",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <span style={{ fontSize: 13, color: "#1f1f1f", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {session.name}
                </span>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteSession(session.id);
                  }}
                  style={{ padding: "2px 6px", cursor: "pointer", color: "#bbb", fontSize: 14, lineHeight: 1, marginLeft: 8, flexShrink: 0 }}
                  title="删除"
                >
                  ✕
                </div>
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
          onRunComplete={refreshSessions}
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
