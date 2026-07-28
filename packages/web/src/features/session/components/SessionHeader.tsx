import { useEffect, useRef, useState } from "react";
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
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={styles.iconButton}
        title={t("account", "账号")}
        aria-label={t("account", "账号")}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z" />
          <path d="m19.4 15 .05.03a1.8 1.8 0 0 1-1.8 3.12l-.05-.03a1.8 1.8 0 0 0-2.7 1.56V19.75a1.8 1.8 0 0 1-3.6 0v-.07a1.8 1.8 0 0 0-2.7-1.56l-.05.03a1.8 1.8 0 1 1-1.8-3.12l.05-.03a1.8 1.8 0 0 0 0-3.12l-.05-.03a1.8 1.8 0 1 1 1.8-3.12l.05.03a1.8 1.8 0 0 0 2.7-1.56v-.07a1.8 1.8 0 0 1 3.6 0v.07a1.8 1.8 0 0 0 2.7 1.56l.05-.03a1.8 1.8 0 1 1 1.8 3.12l-.05.03a1.8 1.8 0 0 0 0 3.12Z" />
        </svg>
      </button>

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
              {t("sign_out", "退出登录")}
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
            <div onClick={onToggleHistory} className={styles.pillBtn} title={t("history", "历史")}>
              {t("history", "历史")}
            </div>
            <button
              type="button"
              onClick={onNewSession}
              className={`${styles.pillBtn} ${styles.plusBtn} ${styles.plusBtnSolid} ${
                isCreatingSession ? styles.plusBtnLoading : ""
              }`}
              title={t("new_chat", "新建对话")}
              aria-label={t("new_chat", "新建对话")}
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
          </>
        )}
        <UserMenu currentUser={currentUser} onLogout={onLogout} />
      </div>
    </div>
  );
}
