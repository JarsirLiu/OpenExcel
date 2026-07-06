import { useEffect, useRef } from "react";
import type { SheetChangeDelta } from "@openexcel/core";
import { ChatPanel } from "@/features/chat/conversation/ChatPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SessionHistoryPopover } from "./components/SessionHistoryPopover";
import type { Session } from "@/api/sessions";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";
import { t } from "@/lib/i18n";
import styles from "./SessionShell.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

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
  currentUser: CurrentUser;
  onLogout: () => void;
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
  currentUser,
  onLogout,
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
    <div className={styles.container}>
      <div className={styles.emptyState}>{t("loading_workspace", "加载工作区中...")}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <SessionHeader
        sessionName={currentSession?.name ?? t("ai_chat", "AI 对话")}
        currentSessionId={currentSessionId}
        undoState={undoState}
        undoError={undoError}
        isStreaming={isStreaming}
        onUndoLatestRun={handleUndoLatestRun}
        onToggleHistory={() => setHistoryOpen(!historyOpen)}
        onNewSession={() => void handleNewSession()}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      {historyOpen && (
        <div ref={historyRef} className={styles.historyPanel}>
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
        <div className={styles.emptyState}>{t("loading", "加载中...")}</div>
      )}
    </div>
  );
}