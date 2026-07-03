import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

let resolveRef: ((result: boolean) => void) | null = null;

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    resolveRef = resolve;
    window.dispatchEvent(new CustomEvent("confirmDialogShow", { detail: options }));
  });
}

export function ConfirmDialog() {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ title: "", message: "" });

  useEffect(() => {
    const handler = (e: Event) => {
      const opts = (e as CustomEvent).detail as ConfirmOptions;
      if (opts) {
        setOptions(opts);
        setVisible(true);
      }
    };
    window.addEventListener("confirmDialogShow", handler);
    return () => window.removeEventListener("confirmDialogShow", handler);
  }, []);

  useEffect(() => {
    if (!visible) {
      resolveRef = null;
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible]);

  const handleClose = useCallback((result: boolean) => {
    setVisible(false);
    resolveRef?.(result);
    resolveRef = null;
  }, []);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose(false);
    },
    [handleClose],
  );

  if (!visible) return null;

  return createPortal(
    <div
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: "24px 28px",
          minWidth: 320,
          maxWidth: 440,
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#1f2a37" }}>
          {options.title}
        </div>
        <div style={{ fontSize: 14, color: "#5b6473", lineHeight: 1.6, marginBottom: 24 }}>
          {options.message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button
            onClick={() => handleClose(false)}
            style={{
              fontSize: 13,
              padding: "6px 18px",
              border: "1px solid #d8dee9",
              borderRadius: 4,
              background: "#fff",
              cursor: "pointer",
              color: "#5b6473",
            }}
          >
            {options.cancelText ?? "取消"}
          </button>
          <button
            onClick={() => handleClose(true)}
            style={{
              fontSize: 13,
              padding: "6px 18px",
              border: "1px solid #d32f2f",
              borderRadius: 4,
              background: "#d32f2f",
              cursor: "pointer",
              color: "#fff",
            }}
          >
            {options.confirmText ?? "确认"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
