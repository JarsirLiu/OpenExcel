import { lazy, Suspense } from "react";
import { useNavigate, useRouteLoaderData } from "react-router-dom";
import { type CurrentUser, logout } from "@/api/auth";
import type { WorkbenchRouteData } from "@/app/routeData";
import { routePaths } from "@/app/routePaths";
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
          <img
            src="/assets/openexcel-logo.svg"
            alt=""
            aria-hidden="true"
            style={{ width: 24, height: 24 }}
          />
          OpenExcel
        </div>
        <div style={{ marginTop: 12, color: "var(--text-secondary)", fontSize: 13 }}>
          {t("loading")}
        </div>
      </div>
    </div>
  );
}

function useWorkbenchRouteData() {
  return useRouteLoaderData("workspace-route") as WorkbenchRouteData | undefined;
}

export function WorkbenchRoutePage() {
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
