import { lazy, Suspense, useEffect } from "react";
import { useLocation, useNavigate, useRouteLoaderData } from "react-router-dom";
import { type CurrentUser, logout } from "@/api/auth";
import type { WorkbenchRouteData } from "@/app/routeData";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { useAuthState } from "@/features/auth/useAuthState";
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

function AuthPage() {
  const auth = useAuthState();
  const navigate = useNavigate();
  const location = useLocation();

  const authMode = location.pathname === "/register" ? "register" : "login";

  useEffect(() => {
    if (
      !auth.loading &&
      auth.currentUser &&
      (location.pathname === "/login" || location.pathname === "/register")
    ) {
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
  return useRouteLoaderData("workspace-route") as WorkbenchRouteData | undefined;
}

function WorkbenchPage() {
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
    navigate("/login", { replace: true });
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

export default function App() {
  const location = useLocation();

  if (location.pathname === "/login" || location.pathname === "/register") {
    return <AuthPage />;
  }

  return <WorkbenchPage />;
}
