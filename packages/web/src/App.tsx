import { lazy, Suspense } from "react";
import { AuthScreen } from "./features/auth/AuthScreen";
import { useAuthState } from "./features/auth/useAuthState";
import { ConfirmDialog } from "./shared/ui";

const Workbench = lazy(() => import("./app/Workbench").then((module) => ({ default: module.Workbench })));

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--background)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.02em" }}>
          <span style={{ display: "inline-block", width: 20, height: 20, border: "2px solid var(--foreground)", borderRadius: 4, backgroundImage: "linear-gradient(to right, transparent 0, transparent calc(33.33% - 1px), var(--foreground) calc(33.33% - 1px), var(--foreground) 33.33%, transparent 33.33%), linear-gradient(to right, transparent 0, transparent calc(66.66% - 1px), var(--foreground) calc(66.66% - 1px), var(--foreground) 66.66%, transparent 66.66%)", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }}></span>
          OpenExcel
        </div>
        <div style={{ marginTop: 12, color: "var(--muted-foreground)", fontSize: 13 }}>加载中…</div>
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
