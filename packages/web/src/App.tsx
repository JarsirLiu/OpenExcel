import { lazy, Suspense, useEffect } from "react";
import { useLocation, useNavigate, useRouteLoaderData } from "react-router-dom";
import { logout, type CurrentUser } from "@/api/auth";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { clearAllSessionStorage, useAuthState } from "@/features/auth/useAuthState";
import { ConfirmDialog } from "@/shared/ui";
import { t } from "@/lib/i18n";
import type { RouteData } from "@/app/Workbench";

type ProtectedLoaderData = {
  currentUser: CurrentUser;
};

function useRouteData<T>(routeId: string) {
  return useRouteLoaderData(routeId) as T | undefined;
}

const Workbench = lazy(() =>
  import("@/app/Workbench").then((module) => ({ default: module.Workbench }))
);

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-page)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          <span style={{ display: "inline-block", width: 20, height: 20, border: "2px solid var(--text-primary)", borderRadius: 4, backgroundImage: "linear-gradient(to right, transparent 0, transparent calc(33.33% - 1px), var(--text-primary) calc(33.33% - 1px), var(--text-primary) 33.33%, transparent 33.33%), linear-gradient(to right, transparent 0, transparent calc(66.66% - 1px), var(--text-primary) calc(66.66% - 1px), var(--text-primary) 66.66%, transparent 66.66%)", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}></span>
          OpenExcel
        </div>
        <div style={{ marginTop: 12, color: "var(--text-secondary)", fontSize: 13 }}>{t("loading", "加载中…")}</div>
      </div>
    </div>
  );
}

function AuthPage() {
  const auth = useAuthState();
  const navigate = useNavigate();
  const location = useLocation();

  const authMode = location.pathname === "/register" ? "register" : "login";

  useEffect(() => {
    if (!auth.loading && auth.currentUser && (location.pathname === "/login" || location.pathname === "/register")) {
      navigate("/", { replace: true });
    }
  }, [auth.currentUser, auth.loading, location.pathname, navigate]);

  if (auth.loading) return <LoadingScreen />;
  return (
    <AuthScreen
      mode={authMode}
      submitting={auth.submitting}
      error={auth.error}
      onLogin={auth.signIn}
      onRegister={auth.signUp}
      onSwitchMode={() => navigate(authMode === "login" ? "/register" : "/login")}
    />
  );
}

function useWorkbenchRouteData() {
  const workspaceData = useRouteData<RouteData>("workspace-route");
  const workbookData = useRouteData<RouteData>("workbook-route");
  const sessionData = useRouteData<RouteData>("session-route");

  return sessionData ?? workbookData ?? workspaceData;
}

function WorkbenchPage() {
  const navigate = useNavigate();
  const protectedData = useRouteData<ProtectedLoaderData>("protected");

  if (!protectedData) {
    return <LoadingScreen />;
  }

  const user = protectedData.currentUser;
  const routeData = useWorkbenchRouteData();

  const handleLogout = async () => {
    await logout();
    clearAllSessionStorage();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        <Workbench currentUser={user} onLogout={handleLogout} routeData={routeData} />
      </Suspense>
      <ConfirmDialog />
    </>
  );
}

export default function App() {
  const location = useLocation();

  if (location.pathname === "/login" || location.pathname === "/register") {
    return <AuthPage />;
  }

  return <WorkbenchPage />;
}
