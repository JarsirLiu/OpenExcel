import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { useEffect, useRef } from "react";
import type { Session } from "@/api/sessions";
import { Alert } from "@/components/ui/Alert/Alert";
import { ChatPanel } from "@/features/chat/conversation/ChatPanel";
import { t } from "@/lib/i18n";
import { SessionHeader } from "./components/SessionHeader";
import { SessionHistoryPopover } from "./components/SessionHistoryPopover";
import styles from "./SessionShell.module.css";
import { SessionShellProvider } from "./SessionShellContext";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  workspaceId: number | null;
  sessions: Session[];
  currentSessionId: number | null;
  historyOpen: boolean;
  setHistoryOpen: (next: boolean) => void;
  createSession: () => Promise<Session>;
  activateSession: (sessionId: number) => void;
  handleNewSession: () => void;
  handleSelectSession: (id: number) => void;
  handleDeleteSession: (id: number) => Promise<void>;
  handleUndoComplete: () => Promise<void>;
  isCreatingSession: boolean;
  sessionError?: Error;
  onAttachExcel: (files: File[]) => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  onSheetChanged?: (
    sheetId: number,
    delta: SheetChangeDelta | null,
    version?: SheetChangeVersion,
  ) => void | Promise<void>;
  referenceCacheRevision: number;
  currentUser: CurrentUser;
  onLogout: () => void;
  onNavigateSheet?: (sheetId: number) => void;
};

export function SessionShell({
  workspaceId,
  sessions,
  currentSessionId,
  historyOpen,
  setHistoryOpen,
  createSession,
  activateSession,
  handleNewSession,
  handleSelectSession,
  handleDeleteSession,
  handleUndoComplete,
  isCreatingSession,
  sessionError,
  onAttachExcel,
  onWorkspaceRefresh,
  onSheetChanged,
  referenceCacheRevision,
  currentUser,
  onLogout,
  onNavigateSheet,
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

  const currentSession =
    currentSessionId != null ? sessions.find((session) => session.id === currentSessionId) : null;

  if (workspaceId == null) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>{t("loading_workspace", "加载工作区中...")}</div>
      </div>
    );
  }

  return (
    <SessionShellProvider
      value={{
        workspaceId,
        onAttachExcel,
        referenceCacheRevision,
        onWorkspaceRefresh,
        onSheetChanged,
        onUndoComplete: handleUndoComplete,
        onNavigateSheet,
        createSession,
        activateSession,
      }}
    >
      <div className={styles.container}>
        <SessionHeader
          sessionName={currentSession?.name ?? t("ai_chat", "AI 对话")}
          currentSessionId={currentSessionId}
          onToggleHistory={() => setHistoryOpen(!historyOpen)}
          onNewSession={handleNewSession}
          isCreatingSession={isCreatingSession}
          currentUser={currentUser}
          onLogout={onLogout}
        />

        {sessionError && (
          <div className={styles.sessionError}>
            <Alert variant="error">{sessionError.message}</Alert>
          </div>
        )}

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

        {currentSessionId != null ? (
          <ChatPanel
            sessionId={currentSessionId}
            initialCanUndo={currentSession?.undoRunId != null}
          />
        ) : (
          <ChatPanel sessionId={null} />
        )}
      </div>
    </SessionShellProvider>
  );
}
