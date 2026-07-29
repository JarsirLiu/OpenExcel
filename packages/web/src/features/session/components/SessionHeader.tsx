import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import styles from "./SessionHeader.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  sessionName: string;
  currentSessionId: number | null;
  onToggleHistory: () => void;
  onNewSession: () => void;
  isCreatingSession?: boolean;
  currentUser: CurrentUser;
  onLogout: () => void;
  presentationMode?: boolean;
};

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const tooltipId = useId();

  return (
    <span className={styles.tooltipAnchor}>
      {children}
      <span id={tooltipId} role="tooltip" className={styles.tooltip}>
        {label}
      </span>
    </span>
  );
}

const UserMenu = ({
  currentUser,
  onLogout,
}: {
  currentUser: CurrentUser;
  onLogout: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className={styles.userMenu}>
      <Tooltip label={t("account_menu")}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={styles.iconButton}
          aria-label={t("account_menu")}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </Tooltip>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.userInfo}>
            <div className={styles.userInfoRow}>
              <div className={styles.avatar}>
                {(currentUser.displayName || currentUser.email)[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className={styles.userName}>{currentUser.displayName}</div>
                <div className={styles.userEmail}>{currentUser.email}</div>
              </div>
            </div>
          </div>

          <div className={styles.menuSection}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {t("sign_out")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export function SessionHeader({
  sessionName,
  currentSessionId,
  onToggleHistory,
  onNewSession,
  isCreatingSession = false,
  currentUser,
  onLogout,
  presentationMode = false,
}: Props) {
  return (
    <div className={styles.header}>
      <span className={styles.sessionTitle}>
        {presentationMode && <small>PRE-RECORDED WORKFLOW</small>}
        <span className={styles.sessionName}>{sessionName}</span>
      </span>
      <div className={styles.actions}>
        {!presentationMode && (
          <>
            <Tooltip label={t("history")}>
              <button
                type="button"
                onClick={onToggleHistory}
                className={styles.pillBtn}
                aria-label={t("history")}
              >
                {t("history")}
              </button>
            </Tooltip>
            <Tooltip label={t("new_chat")}>
              <button
                type="button"
                onClick={onNewSession}
                className={`${styles.pillBtn} ${styles.plusBtn} ${styles.plusBtnSolid} ${
                  isCreatingSession ? styles.plusBtnLoading : ""
                }`}
                aria-label={t("new_chat")}
                disabled={isCreatingSession}
              >
                <span className={styles.plusBtnIcon}>
                  <svg
                    width={12}
                    height={12}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="3" x2="12" y2="21" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                  </svg>
                </span>
              </button>
            </Tooltip>
          </>
        )}
        <UserMenu currentUser={currentUser} onLogout={onLogout} />
      </div>
    </div>
  );
}
