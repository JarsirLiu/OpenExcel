import { type ReactNode, useId, useState } from "react";
import { SettingsDialog } from "@/features/settings/components/SettingsDialog";
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

function SettingsButton({
  currentUser,
  onLogout,
}: {
  currentUser: CurrentUser;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip label={t("account_menu")}>
        <button
          type="button"
          onClick={() => setOpen(true)}
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
      <SettingsDialog
        open={open}
        currentUser={currentUser}
        onClose={() => setOpen(false)}
        onLogout={onLogout}
      />
    </>
  );
}

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
                className={[
                  styles.pillBtn,
                  styles.plusBtn,
                  styles.plusBtnSolid,
                  isCreatingSession ? styles.plusBtnLoading : "",
                ].join(" ")}
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
        <SettingsButton currentUser={currentUser} onLogout={onLogout} />
      </div>
    </div>
  );
}
