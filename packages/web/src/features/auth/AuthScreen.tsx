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
      <nav className="auth-nav">
        <span className="auth-brand">
          <span className="brand-mark">
            <span className="mark-line"></span>
            <span className="mark-line"></span>
            <span className="mark-line"></span>
          </span>
          OpenExcel
        </span>
      </nav>

      <div className="auth-hero">
        <div className="auth-content">
          <h1 className="auth-headline">
            {mode === "login" ? "Welcome back." : "Get started."}
          </h1>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in to your workspace and pick up where you left off."
              : "Create your free account and start building intelligent spreadsheets."}
          </p>

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            {mode === "register" && (
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                autoComplete="name"
                className="auth-input"
              />
            )}

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              autoComplete="email"
              required
              className="auth-input"
            />

            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              className="auth-input"
            />

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Processing…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="auth-switch">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              className="auth-switch-link"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>

        <div className="auth-visual">
          <div className="visual-card">
            <div className="visual-toolbar">
              <span className="tool-dot"></span>
              <span className="tool-dot"></span>
              <span className="tool-dot"></span>
              <span className="tool-tab active">Sheet1</span>
              <span className="tool-tab">Chart</span>
            </div>
            <div className="visual-grid">
              <div className="grid-row grid-head">
                <div></div>
                <div>A</div>
                <div>B</div>
                <div>C</div>
                <div>D</div>
              </div>
              {Array.from({ length: 5 }).map((_, row) => (
                <div key={row} className="grid-row">
                  <div className="row-num">{row + 1}</div>
                  <div className={row === 1 ? "cell filled-a" : "cell"}></div>
                  <div className={row === 0 ? "cell filled-b" : row === 2 ? "cell filled-a" : "cell"}></div>
                  <div className={row === 3 ? "cell filled-c" : "cell"}></div>
                  <div className={row === 4 ? "cell filled-b" : "cell"}></div>
                </div>
              ))}
            </div>
            <div className="visual-sidebar">
              <div className="sidebar-line"></div>
              <div className="sidebar-line"></div>
              <div className="sidebar-line"></div>
              <div className="sidebar-line"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}