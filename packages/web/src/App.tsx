import { lazy, Suspense } from "react";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { useAuthState } from "@/features/auth/useAuthState";
import { ConfirmDialog } from "@/shared/ui";
import { t } from "@/lib/i18n";

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

export default function App() {
  const auth = useAuthState();

  if (auth.loading) {
    return <LoadingScreen />;
  }

  if (!auth.currentUser) {
    return (
      <AuthScreen
        submitting={auth.submitting}
        error={auth.error}
        onLogin={auth.signIn}
        onRegister={auth.signUp}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        <Workbench currentUser={auth.currentUser} onLogout={() => void auth.signOut()} />
      </Suspense>
      <ConfirmDialog />
    </>
  );
}