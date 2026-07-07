import { useEffect, useRef } from "react";
import { ChatPanel } from "@/features/chat/conversation/ChatPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SessionHistoryPopover } from "./components/SessionHistoryPopover";
import type { Session } from "@/api/sessions";
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
  messages: any[];
  messageTotal: number;
  initialLoaded: boolean;
  loadingMore: boolean;
  historyOpen: boolean;
  setHistoryOpen: (next: boolean) => void;
  isStreaming: boolean;
  setIsStreaming: (next: boolean) => void;
  handleSendInDraft: (text: string) => Promise<number>;
  claimPendingDraftText: (sessionId: number) => string | null;
  handleRunComplete: (sessionId: number, messages: any[]) => Promise<void>;
  handleNewSession: () => void;
  handleSelectSession: (id: number) => void;
  handleDeleteSession: (id: number) => Promise<void>;
  handleUndoComplete: () => Promise<void>;
  onAttachExcel: (file: File) => Promise<void> | void;
  onWorkspaceRefresh?: () => Promise<void> | void;
  referenceCacheRevision: number;
  currentUser: CurrentUser;
  onLogout: () => void;
  onNavigateSheet?: (sheetId: number) => void;
};

export function SessionShell({
  workspaceId,
  sessions,
  currentSessionId,
  messages,
  messageTotal,
  initialLoaded,
  loadingMore,
  historyOpen,
  setHistoryOpen,
  isStreaming,
  setIsStreaming,
  handleSendInDraft,
  claimPendingDraftText,
  handleRunComplete,
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

  const currentSession = currentSessionId != null
    ? sessions.find((session) => session.id === currentSessionId)
    : null;

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

      {initialLoaded ? (
        <ChatPanel
          key={currentSessionId ?? "draft"}
          workspaceId={workspaceId}
          sessionId={currentSessionId}
          messages={messages}
          messageTotal={messageTotal}
          onSendInDraft={handleSendInDraft}
          claimPendingDraftText={claimPendingDraftText}
          onRunComplete={handleRunComplete}
          onWorkspaceRefresh={onWorkspaceRefresh}
          onStreamingChange={setIsStreaming}
          onAttachExcel={onAttachExcel}
          referenceCacheRevision={referenceCacheRevision}
          onUndoComplete={handleUndoComplete}
          onNavigateSheet={onNavigateSheet}
        />
      ) : (
        <div className={styles.emptyState}>{t("loading", "加载中...")}</div>
      )}
    </div>
  );
}
