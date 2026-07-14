import { useEffect, useRef } from "react";
import type { Session } from "@/api/sessions";
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
  handleDraftSessionCreated: (sessionId: number) => Promise<void> | void;
  handleRunSettled: (sessionId: number, messages: any[]) => Promise<void>;
  handleNewSession: () => void;
  handleSelectSession: (id: number) => void;
  handleDeleteSession: (id: number) => Promise<void>;
  handleUndoComplete: () => Promise<void>;
  onAttachExcel: (files: File[]) => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  referenceCacheRevision: number;
  currentUser: CurrentUser;
  onLogout: () => void;
  onNavigateSheet?: (sheetId: number) => void;
  initialMessages?: unknown[];
};

export function SessionShell({
  workspaceId,
  sessions,
  currentSessionId,
  historyOpen,
  setHistoryOpen,
  handleDraftSessionCreated,
  handleRunSettled,
  handleNewSession,
  handleSelectSession,
  handleDeleteSession,
  handleUndoComplete,
  onAttachExcel,
  onWorkspaceRefresh,
  referenceCacheRevision,
  currentUser,
  onLogout,
  onNavigateSheet,
  initialMessages,
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
        onUndoComplete: handleUndoComplete,
        onNavigateSheet,
        initialMessages,
      }}
    >
      <div className={styles.container}>
        <SessionHeader
          sessionName={currentSession?.name ?? t("ai_chat", "AI 对话")}
          currentSessionId={currentSessionId}
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

        {currentSessionId != null ? (
          <ChatPanel
            key={currentSessionId}
            sessionId={currentSessionId}
            hasUndoCheckpoint={currentSession?.undoRunId != null}
            onRunSettled={handleRunSettled}
          />
        ) : (
          <ChatPanel
            key="draft"
            sessionId={null}
            isDraft
            onDraftSessionCreated={handleDraftSessionCreated}
            onRunSettled={handleRunSettled}
          />
        )}
      </div>
    </SessionShellProvider>
  );
}
