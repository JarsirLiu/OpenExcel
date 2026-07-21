import { lazy, Suspense } from "react";
import { Link, Outlet, useLocation, useNavigate, useRouteLoaderData } from "react-router-dom";
import { type CurrentUser, logout } from "@/api/auth";
import { bootstrapWorkspace } from "@/api/workspaces";
import type { WorkbenchRouteData } from "@/app/routeData";
import { getInternalReturnTo, routePaths } from "@/app/routePaths";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { useAuthActions } from "@/features/auth/useAuthActions";
import { SheetActivationProvider } from "@/features/workbook/editor/SheetActivationContext";
import { t } from "@/lib/i18n";
import { ConfirmDialog, Toast } from "@/shared/ui";
import { clearSessionStorage } from "@/shared/utils/storage";

const Workbench = lazy(() =>
  import("@/app/Workbench").then((module) => ({ default: module.Workbench })),
);

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-page)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 20,
              height: 20,
              border: "2px solid var(--text-primary)",
              borderRadius: 4,
              backgroundImage:
                "linear-gradient(to right, transparent 0, transparent calc(33.33% - 1px), var(--text-primary) calc(33.33% - 1px), var(--text-primary) 33.33%, transparent 33.33%), linear-gradient(to right, transparent 0, transparent calc(66.66% - 1px), var(--text-primary) calc(66.66% - 1px), var(--text-primary) 66.66%, transparent 66.66%)",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
            }}
          ></span>
          OpenExcel
        </div>
        <div style={{ marginTop: 12, color: "var(--text-secondary)", fontSize: 13 }}>
          {t("loading", "加载中…")}
        </div>
      </div>
    </div>
  );
}

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

function useWorkbenchRouteData() {
  return useRouteLoaderData("workspace-route") as WorkbenchRouteData | undefined;
}

export function WorkbenchPage() {
  const navigate = useNavigate();
  const protectedData = useRouteLoaderData("protected") as { currentUser: CurrentUser } | undefined;

  if (!protectedData) {
    return <LoadingScreen />;
  }

  const user = protectedData.currentUser;
  const routeData = useWorkbenchRouteData();

  const handleLogout = async () => {
    await logout();
    clearSessionStorage();
    navigate(routePaths.login, { replace: true });
  };

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        <SheetActivationProvider>
          <Workbench
            currentUser={user}
            onLogout={() => void handleLogout()}
            routeData={routeData}
          />
        </SheetActivationProvider>
      </Suspense>
      <ConfirmDialog />
      <Toast />
    </>
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
