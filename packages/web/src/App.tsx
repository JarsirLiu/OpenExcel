import { lazy, Suspense } from "react";
import { AuthScreen } from "./features/auth/AuthScreen";
import { useAuthState } from "./features/auth/useAuthState";
import { ConfirmDialog } from "./shared/ui";

const Workbench = lazy(() => import("./app/Workbench").then((module) => ({ default: module.Workbench })));

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 26%), radial-gradient(circle at 90% 100%, rgba(16, 185, 129, 0.08), transparent 28%), linear-gradient(180deg, #f8fafc 0%, #eef3f9 100%)",
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          padding: "28px 30px",
          borderRadius: 24,
          border: "1px solid var(--border)",
          background: "rgba(255, 255, 255, 0.9)",
          boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
          color: "var(--foreground)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase" }}>OpenExcel</div>
        <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>正在校验登录状态</div>
        <div style={{ marginTop: 8, color: "var(--muted-foreground)", fontSize: 14, lineHeight: 1.7 }}>
          我们正在恢复你的工作区上下文，马上就能继续编辑。
        </div>
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
