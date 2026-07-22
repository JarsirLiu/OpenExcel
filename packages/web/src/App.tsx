import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { bootstrapWorkspace } from "@/api/workspaces";
import { getInternalReturnTo, routePaths } from "@/app/routePaths";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { useAuthActions } from "@/features/auth/useAuthActions";
import { t } from "@/lib/i18n";

export function AuthPage({
  mode,
  showMarketing = false,
}: {
  mode: "login" | "register";
  showMarketing?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuthActions();
  const returnTo = new URLSearchParams(location.search).get("returnTo");
  const internalReturnTo = getInternalReturnTo(returnTo);

  async function enterWorkspace() {
    if (internalReturnTo) {
      navigate(internalReturnTo, { replace: true });
      return;
    }

    const workspace = await bootstrapWorkspace();
    navigate(routePaths.workspace(workspace.publicId));
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
      submitting={auth.submitting}
      error={auth.error}
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
      showMarketing={showMarketing}
    />
  );
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
