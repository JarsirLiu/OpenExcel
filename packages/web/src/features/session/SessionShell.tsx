import { useEffect, useRef } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import { ChatPanel } from "../chat/conversation/ChatPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SessionHistoryPopover } from "./components/SessionHistoryPopover";
import type { Session } from "../../api/sessions";
import type { WorkbookStructureUpdate } from "../chat/hooks/useSheetPatchSync";

type Props = {
  workspaceId: number | null;
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
  onAttachExcel: (file: File) => Promise<void> | void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  referenceCacheRevision: number;
};

export function SessionShell({
  workspaceId,
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
  onAttachExcel,
  onSheetChanged,
  onWorkbookStructureChanged,
  referenceCacheRevision,
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

  if (workspaceId == null) {
    return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", background: "var(--background)",
      borderLeft: "1px solid var(--border)", overflow: "hidden", position: "relative",
    }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--hint-foreground)", fontSize: 13 }}>加载工作区中...</div>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", background: "var(--background)",
      borderLeft: "1px solid var(--border)", overflow: "hidden", position: "relative",
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
          background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
          boxShadow: "var(--shadow)", maxHeight: 300, overflowY: "auto",
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
          workspaceId={workspaceId}
          sessionId={currentSessionId}
          initialMessages={initialMessages}
          onRunComplete={handleRunComplete}
          onSheetChanged={onSheetChanged}
          onWorkbookStructureChanged={onWorkbookStructureChanged}
          onStreamingChange={setIsStreaming}
          onAttachExcel={onAttachExcel}
          referenceCacheRevision={referenceCacheRevision}
        />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--hint-foreground)", fontSize: 13 }}>加载中...</div>
      )}
    </div>
  );
}
