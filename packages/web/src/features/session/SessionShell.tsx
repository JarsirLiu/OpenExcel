import { useEffect, useRef } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import { ChatPanel } from "../chat/conversation/ChatPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SessionHistoryPopover } from "./components/SessionHistoryPopover";
import type { Session } from "../../api/sessions";

type Props = {
  sessions: Session[];
  currentSessionId: number | null;
  initialMessages: any[];
  initialLoaded: boolean;
  historyOpen: boolean;
  setHistoryOpen: (next: boolean) => void;
  undoState: "idle" | "loading" | "success" | "error";
  undoError: string;
  isStreaming: boolean;
  setIsStreaming: (next: boolean) => void;
  handleRunComplete: (sessionId: number, messages: any[]) => Promise<void>;
  handleNewSession: () => Promise<void>;
  handleSelectSession: (id: number) => void;
  handleDeleteSession: (id: number) => Promise<void>;
  handleUndoLatestRun: () => Promise<void>;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  sheets: { workbookId: number; workbookName: string; id: number; name: string }[];
};

export function SessionShell({
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
  handleRunComplete,
  handleNewSession,
  handleSelectSession,
  handleDeleteSession,
  handleUndoLatestRun,
  onSheetChanged,
  sheets,
}: Props) {
  const historyRef = useRef<HTMLDivElement>(null);

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
      <SessionHeader
        sessionName={currentSession?.name ?? "AI 对话"}
        currentSessionId={currentSessionId}
        undoState={undoState}
        undoError={undoError}
        isStreaming={isStreaming}
        onUndoLatestRun={handleUndoLatestRun}
        onToggleHistory={() => setHistoryOpen(!historyOpen)}
        onNewSession={() => void handleNewSession()}
      />

      {historyOpen && (
        <div ref={historyRef} style={{
          position: "absolute", top: 44, left: 8, right: 8, zIndex: 100,
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 300, overflowY: "auto",
        }}>
          <SessionHistoryPopover
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={(id) => void handleDeleteSession(id)}
          />
        </div>
      )}

      {currentSessionId && initialLoaded ? (
        <ChatPanel
          key={currentSessionId}
          sessionId={currentSessionId}
          initialMessages={initialMessages}
          onRunComplete={handleRunComplete}
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
