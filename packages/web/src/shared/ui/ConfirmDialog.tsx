import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/Button/Button";
import { clearConfirmDialog, resolveConfirmDialog, type ConfirmOptions } from "@/shared/lib/confirmDialog";
import styles from "./ConfirmDialog.module.css";

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
      clearConfirmDialog();
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
    resolveConfirmDialog(result);
  }, []);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleClose(false);
    },
    [handleClose],
  );

  if (!visible) return null;

  return createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.panel}>
        <div className={styles.title}>{options.title}</div>
        <div className={styles.message}>{options.message}</div>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => handleClose(false)}>
            {options.cancelText ?? t("cancel", "取消")}
          </Button>
          <Button variant="danger" onClick={() => handleClose(true)}>
            {options.confirmText ?? t("confirm", "确认")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}