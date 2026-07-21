import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { t } from "@/lib/i18n";
import styles from "./AuthScreen.module.css";
import { MarketingShowcase } from "./MarketingShowcase";

export type AuthMode = "login" | "register";

type Props = {
  mode: AuthMode;
  submitting: boolean;
  error: string | null;
  onLogin: (input: { email: string; password: string }) => Promise<unknown>;
  onRegister: (input: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<unknown>;
  onSwitchMode: () => void;
  showMarketing?: boolean;
};

export function AuthScreen({
  mode,
  submitting,
  error,
  onLogin,
  onRegister,
  onSwitchMode,
  showMarketing = false,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (mode === "login") {
        await onLogin({ email, password });
        return;
      }
      await onRegister({
        email,
        password,
        displayName: displayName.trim() || undefined,
      });
    } catch {
      // The auth hook already stores the message for the UI.
    }
  }

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <span className={styles.brand}>
          <span className={styles.brandMark}>
            <span className={styles.markLine}></span>
            <span className={styles.markLine}></span>
            <span className={styles.markLine}></span>
          </span>
          OpenExcel
        </span>
      </nav>

      <div className={styles.hero}>
        <div className={styles.content}>
          <h1 className={styles.headline}>
            {mode === "login" ? t("welcome_back", "欢迎回来。") : t("get_started", "开始使用。")}
          </h1>
          <p className={styles.subtitle}>
            {mode === "login"
              ? t("sign_in_desc", "登录你的工作区，继续之前的工作。")
              : t("sign_up_desc", "创建免费账号，开始使用智能表格。")}
          </p>

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            {mode === "register" && (
              <Input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t("display_name", "显示名称")}
                autoComplete="name"
              />
            )}

            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("email", "邮箱地址")}
              type="email"
              autoComplete="email"
              required
            />

            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("password", "密码")}
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />

            {error && <div className={styles.error}>{error}</div>}

            <Button variant="primary" type="submit" disabled={submitting} className={styles.submit}>
              {submitting
                ? t("processing", "处理中…")
                : mode === "login"
                  ? t("sign_in", "登录")
                  : t("create_account", "创建账号")}
            </Button>
          </form>

          <p className={styles.switch}>
            {mode === "login" ? t("no_account", "还没有账号？") : t("has_account", "已有账号？")}
            <button type="button" className={styles.switchLink} onClick={onSwitchMode}>
              {mode === "login" ? t("sign_up", "注册") : t("sign_in", "登录")}
            </button>
          </p>
        </div>

        <div className={styles.visual}>
          <div className={styles.visualCard}>
            <div className={styles.visualToolbar}>
              <span className={styles.toolDot}></span>
              <span className={styles.toolDot}></span>
              <span className={styles.toolDot}></span>
              <span className={`${styles.toolTab} ${styles.toolTabActive}`}>Sheet1</span>
              <span className={styles.toolTab}>Chart</span>
            </div>
            <div className={styles.visualGrid}>
              <div className={`${styles.gridRow} ${styles.gridHead}`}>
                <div></div>
                <div>A</div>
                <div>B</div>
                <div>C</div>
                <div>D</div>
              </div>
              {Array.from({ length: 5 }).map((_, row) => (
                <div key={row} className={styles.gridRow}>
                  <div className={styles.rowNum}>{row + 1}</div>
                  <div className={`${styles.cell} ${row === 1 ? styles.cellFilledA : ""}`}></div>
                  <div
                    className={`${styles.cell} ${row === 0 ? styles.cellFilledB : row === 2 ? styles.cellFilledA : ""}`}
                  ></div>
                  <div className={`${styles.cell} ${row === 3 ? styles.cellFilledC : ""}`}></div>
                  <div className={`${styles.cell} ${row === 4 ? styles.cellFilledB : ""}`}></div>
                </div>
              ))}
            </div>
            <div className={styles.visualSidebar}>
              <div className={styles.sidebarLine}></div>
              <div className={styles.sidebarLine}></div>
              <div className={styles.sidebarLine}></div>
              <div className={styles.sidebarLine}></div>
            </div>
          </div>
        </div>
      </div>

      {showMarketing && <MarketingShowcase />}
    </div>
  );
}
