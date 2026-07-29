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
    <div className={styles.content}>
      <div className={styles.heading}>
        <span>{t("conversation_history")}</span>
      </div>
      {sessions.length === 0 ? (
        <div className={styles.empty}>{t("no_history")}</div>
      ) : (
        <ul className={styles.list} aria-label={t("conversation_history")}>
          {sessions.map((session) => {
            const isActive = session.id === currentSessionId;
            return (
              <li key={session.id} className={styles.item}>
                <button
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className={`${styles.itemSelect} ${isActive ? styles.itemActive : ""}`}
                  aria-current={isActive ? "true" : undefined}
                >
                  <span className={styles.itemName}>{session.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSession(session.id)}
                  className={styles.deleteBtn}
                  aria-label={`${t("delete")} ${session.name}`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="m19 6-1 14H6L5 6" />
                    <path d="M10 11v5M14 11v5" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
