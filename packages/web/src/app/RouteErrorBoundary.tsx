import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { t } from "@/lib/i18n";

export function RouteErrorBoundary() {
  const error = useRouteError();

  let title = t("error_boundary_title", "页面出错了");
  let message = t("error_boundary_message", "发生了意外错误，请重试。");

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data?.message ?? message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-page)" }}>
      <div style={{ textAlign: "center", maxWidth: 480, padding: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>{title}</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>{message}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 24px",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 6,
            border: "none",
            background: "var(--accent)",
            color: "var(--bg-page)",
            cursor: "pointer",
          }}
        >
          {t("retry", "重试")}
        </button>
      </div>
    </div>
  );
}