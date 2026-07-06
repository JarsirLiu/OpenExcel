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
      <div className="auth-card">
        <div className="auth-brand-row">
          <span className="auth-brand">OpenExcel</span>
        </div>

        <div className="auth-body">
          <h1 className="auth-title">{mode === "login" ? "登录" : "注册"}</h1>

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            {mode === "register" && (
              <div className="auth-field">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="显示名称"
                  autoComplete="name"
                />
              </div>
            )}

            <div className="auth-field">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱"
                type="email"
                autoComplete="email"
                required
              />
            </div>

            <div className="auth-field">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "处理中..." : mode === "login" ? "登录" : "注册"}
            </button>
          </form>

          <div className="auth-switch">
            {mode === "login" ? "还没有账号？" : "已有账号？"}
            <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "注册" : "登录"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
