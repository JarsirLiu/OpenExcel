import { useState } from "react";
import { Link, Outlet, useLoaderData, useLocation, useNavigate } from "react-router-dom";
import type { CurrentUser } from "@/api/auth";
import { bootstrapWorkspace } from "@/api/workspaces";
import { getInternalReturnTo, routePaths } from "@/app/routePaths";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { useAuthActions } from "@/features/auth/useAuthActions";
import { t } from "@/lib/i18n";

export function AuthPage({
  mode,
  showMarketing = false,
  isAuthenticated = false,
}: {
  mode: "login" | "register";
  showMarketing?: boolean;
  isAuthenticated?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuthActions();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const returnTo = new URLSearchParams(location.search).get("returnTo");
  const internalReturnTo = getInternalReturnTo(returnTo);

  async function enterWorkspace() {
    if (internalReturnTo) {
      navigate(internalReturnTo, { replace: true });
      return;
    }

    setStartError(null);
    setStarting(true);
    try {
      const workspace = await bootstrapWorkspace();
      navigate(routePaths.workspace(workspace.publicId));
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "进入工作区失败，请重试");
      throw error;
    } finally {
      setStarting(false);
    }
  }

  async function handleLogin(input: { email: string; password: string }) {
    await auth.signIn(input);
    await enterWorkspace();
  }

  async function handleRegister(input: { email: string; password: string; displayName?: string }) {
    await auth.signUp(input);
    await enterWorkspace();
  }

  return (
    <AuthScreen
      mode={mode}
      submitting={auth.submitting || starting}
      error={auth.error ?? startError}
      onLogin={handleLogin}
      onRegister={handleRegister}
      onSwitchMode={() => {
        const nextPath = mode === "login" ? routePaths.register : routePaths.login;
        navigate(
          internalReturnTo
            ? mode === "login"
              ? routePaths.registerWithReturnTo(internalReturnTo)
              : routePaths.loginWithReturnTo(internalReturnTo)
            : nextPath,
        );
      }}
      isAuthenticated={isAuthenticated}
      onStart={enterWorkspace}
      showMarketing={showMarketing}
    />
  );
}

export function HomePage() {
  const { currentUser } = useLoaderData() as { currentUser: CurrentUser | null };
  return <AuthPage mode="login" showMarketing isAuthenticated={Boolean(currentUser)} />;
}

export function AppShell() {
  return <Outlet />;
}

export function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-page)",
        color: "var(--text-primary)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1>404</h1>
        <p>{t("page_not_found", "页面不存在")}</p>
        <Link to={routePaths.home}>{t("back_home", "返回首页")}</Link>
      </div>
    </div>
  );
}

export default AppShell;
