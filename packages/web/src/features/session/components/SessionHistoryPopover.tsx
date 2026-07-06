import type { Session } from "@/api/sessions";
import { t } from "@/lib/i18n";
import styles from "./SessionHistoryPopover.module.css";

type Props = {
  sessions: Session[];
  currentSessionId: number | null;
  onSelectSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
};

export function SessionHistoryPopover({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}: Props) {
  return (
    <>
      {sessions.length === 0 ? (
        <div className={styles.empty}>{t("no_history", "暂无历史记录")}</div>
      ) : (
        sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            className={`${styles.item} ${session.id === currentSessionId ? styles.itemActive : styles.itemInactive}`}
          >
            <span className={styles.itemName}>
              {session.name}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(session.id);
              }}
              className={styles.deleteBtn}
              title={t("delete", "删除")}
            >
              ✕
            </button>
          </div>
        ))
      )}
    </>
  );
}