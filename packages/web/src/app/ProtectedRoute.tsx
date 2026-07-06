import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthState } from "@/features/auth/useAuthState";
import { t } from "@/lib/i18n";

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

export function ProtectedRoute() {
  const auth = useAuthState();
  const location = useLocation();

  if (auth.loading) return <LoadingScreen />;
  if (!auth.currentUser) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}