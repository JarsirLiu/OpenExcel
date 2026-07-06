import { useState, useRef, useEffect } from "react";
import { t } from "@/lib/i18n";
import styles from "./SessionHeader.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  sessionName: string;
  currentSessionId: number | null;
  undoState: "idle" | "loading" | "success" | "error";
  undoError: string;
  isStreaming: boolean;
  onUndoLatestRun: () => void;
  onToggleHistory: () => void;
  onNewSession: () => void;
  currentUser: CurrentUser;
  onLogout: () => void;
};

const UserMenu = ({ currentUser, onLogout }: { currentUser: CurrentUser; onLogout: () => void }) => {
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
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
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
                <div className={styles.userName}>
                  {currentUser.displayName}
                </div>
                <div className={styles.userEmail}>
                  {currentUser.email}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.menuSection}>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => { setOpen(false); onLogout(); }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
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
  undoState,
  undoError,
  isStreaming,
  onUndoLatestRun,
  onToggleHistory,
  onNewSession,
  currentUser,
  onLogout,
}: Props) {
  const undoDisabled = !currentSessionId || undoState === "loading" || isStreaming;

  return (
    <>
      <div className={styles.header}>
        <span className={styles.sessionName}>
          {sessionName}
        </span>
        <div className={styles.actions}>
          <div
            onClick={undoDisabled ? undefined : onUndoLatestRun}
            className={`${styles.pillBtn} ${undoDisabled ? styles.pillBtnDisabled : styles.pillBtnEnabled}`}
            title={isStreaming ? t("undo_streaming_hint", "对话进行中，无法撤销") : t("undo", "撤销本轮修改")}
          >
            {isStreaming ? t("undo", "撤销") : (undoState === "loading" ? t("undoing", "撤销中...") : t("undo", "撤销"))}
          </div>
          <div
            onClick={onToggleHistory}
            className={styles.pillBtn}
            title={t("history", "历史")}
          >
            {t("history", "历史")}
          </div>
          <div
            onClick={onNewSession}
            className={`${styles.pillBtn} ${styles.plusBtn} ${styles.plusBtnSolid}`}
            title={t("new_chat", "新建对话")}
          >
            +
          </div>
          <UserMenu currentUser={currentUser} onLogout={onLogout} />
        </div>
      </div>
      {undoError && (
        <div className={styles.bannerWrap}>
          <div className={styles.banner}>
            {t("undo_failed", "撤销失败")}: {undoError}
          </div>
        </div>
      )}
      {undoState === "success" && (
        <div className={styles.bannerWrap}>
          <div className={styles.banner}>
            {t("undo_success", "已撤销本轮修改")}
          </div>
        </div>
      )}
    </>
  );
}