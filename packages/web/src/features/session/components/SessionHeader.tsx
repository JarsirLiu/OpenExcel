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
  currentUser: CurrentUser;
  onLogout: () => void;
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
        className={styles.hamburger}
        title={t("account", "账号")}
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
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
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
  currentUser,
  onLogout,
}: Props) {
  return (
    <div className={styles.header}>
      <span className={styles.sessionName}>{sessionName}</span>
      <div className={styles.actions}>
        <div onClick={onToggleHistory} className={styles.pillBtn} title={t("history", "历史")}>
          {t("history", "历史")}
        </div>
        <div
          onClick={onNewSession}
          className={`${styles.pillBtn} ${styles.plusBtn} ${styles.plusBtnSolid}`}
          title={t("new_chat", "新建对话")}
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
        </div>
        <UserMenu currentUser={currentUser} onLogout={onLogout} />
      </div>
    </div>
  );
}
