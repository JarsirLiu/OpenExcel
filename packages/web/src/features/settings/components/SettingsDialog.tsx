import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { useI18n } from "@/lib/i18n";
import styles from "./SettingsDialog.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  open: boolean;
  currentUser: CurrentUser;
  onClose: () => void;
  onLogout: () => void;
};

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function SettingsDialog({ open, currentUser, onClose, onLogout }: Props) {
  const { locale, setLocale, t } = useI18n();
  const titleId = useId();
  const [activeSection, setActiveSection] = useState<"general" | "account">("general");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const initials = (currentUser.displayName || currentUser.email).trim().charAt(0).toUpperCase();
  const isGeneral = activeSection === "general";

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.titleIcon}>
              <SettingsIcon />
            </span>
            <div>
              <h2 id={titleId}>{t("settings")}</h2>
              <p>{t("settings_description")}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("close")}
          >
            <CloseIcon />
          </button>
        </header>

        <div className={styles.body}>
          <nav className={styles.navigation} aria-label={t("settings_sections")}>
            <button
              type="button"
              className={[styles.navItem, isGeneral ? styles.navItemActive : ""].join(" ")}
              onClick={() => setActiveSection("general")}
            >
              {isGeneral && <span className={styles.navMarker} />}
              {t("settings_general")}
            </button>
            <button
              type="button"
              className={[styles.navItem, !isGeneral ? styles.navItemActive : ""].join(" ")}
              onClick={() => setActiveSection("account")}
            >
              {!isGeneral && <span className={styles.navMarker} />}
              {t("settings_account")}
            </button>
          </nav>

          <div className={styles.content}>
            {isGeneral ? (
              <>
                <div className={styles.sectionHeading}>
                  <h3>{t("settings_general")}</h3>
                  <p>{t("settings_general_description")}</p>
                </div>
                <div className={styles.settingRow}>
                  <div>
                    <strong>{t("language")}</strong>
                    <p>{t("settings_language_description")}</p>
                  </div>
                  <label className={styles.selectWrap}>
                    <span className={styles.srOnly}>{t("language")}</span>
                    <select
                      value={locale}
                      onChange={(event) => setLocale(event.target.value as typeof locale)}
                    >
                      <option value="zh-CN">{t("language_simplified_chinese")}</option>
                      <option value="en-US">{t("language_english")}</option>
                    </select>
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className={styles.sectionHeading}>
                  <h3>{t("settings_account")}</h3>
                  <p>{t("settings_account_description")}</p>
                </div>
                <div className={styles.accountCard}>
                  <div className={styles.avatar}>{initials}</div>
                  <div className={styles.accountDetails}>
                    <strong>{currentUser.displayName}</strong>
                    <span>{currentUser.email}</span>
                  </div>
                  <Button variant="danger" onClick={onLogout}>
                    <LogoutIcon />
                    {t("sign_out")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <footer className={styles.footer}>
          <span>{t("settings_saved_automatically")}</span>
          <Button onClick={onClose}>{t("close")}</Button>
        </footer>
      </section>
    </div>
  );
}
