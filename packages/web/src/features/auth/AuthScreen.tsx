import { useState, type FormEvent } from "react";

type AuthMode = "login" | "register";

type Props = {
  submitting: boolean;
  error: string | null;
  onLogin: (input: { email: string; password: string }) => Promise<unknown>;
  onRegister: (input: { email: string; password: string; displayName?: string }) => Promise<unknown>;
};

export function AuthScreen({ submitting, error, onLogin, onRegister }: Props) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const title = mode === "login" ? "登录 OpenExcel" : "注册 OpenExcel";
  const subtitle =
    mode === "login"
      ? "登录后即可进入你的工作区，工作簿、会话和表格数据都会按账号隔离。"
      : "注册后会自动创建一个默认工作区，直接进入表格体验。";

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
    <div className="auth-shell">
      <div className="auth-topbar">
        <div>
          <div className="auth-brand">OpenExcel</div>
          <div className="auth-tagline">工作区、工作簿、会话都按账号隔离</div>
        </div>
        <div className="auth-topbar-meta">
          <span>Cookie 会话</span>
          <span>SQLite / PostgreSQL / MySQL</span>
        </div>
      </div>

      <div className="auth-panel">
        <section className="auth-hero">
          <div className="auth-kicker">安全登录</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="auth-points">
            <div>账号隔离</div>
            <div>工作区独立</div>
            <div>可下载 Excel</div>
          </div>
          <div className="auth-note">
            登录后可以继续编辑当前工作区中的工作簿和表格，体验与工作台保持一致。
          </div>
        </section>

        <section className="auth-card">
          <div className="auth-tabbar">
            <button className={mode === "login" ? "active" : ""} type="button" onClick={() => setMode("login")}>
              登录
            </button>
            <button className={mode === "register" ? "active" : ""} type="button" onClick={() => setMode("register")}>
              注册
            </button>
          </div>

          <div className="auth-card-title">{mode === "login" ? "欢迎回来" : "创建新账号"}</div>
          <div className="auth-card-subtitle">
            {mode === "login" ? "输入邮箱和密码后直接进入工作区。" : "注册信息只用于当前环境，不会和其他工作区共享。"}
          </div>

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            {mode === "register" && (
              <label className="auth-field">
                <span>显示名称</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="例如：Felix"
                  autoComplete="name"
                />
              </label>
            )}

            <label className="auth-field">
              <span>邮箱</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                required
              />
            </label>

            <label className="auth-field">
              <span>密码</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </label>

            {error ? <div className="auth-error">{error}</div> : null}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "处理中..." : mode === "login" ? "登录" : "创建账号"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
