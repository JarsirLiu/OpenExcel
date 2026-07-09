import type { ReactNode } from "react";
import styles from "./Dialog.module.css";

type Props = {
  open: boolean;
  title: string;
  message: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
};

export function Dialog({
  open,
  title,
  message,
  onCancel,
  onConfirm,
  cancelText,
  confirmText,
}: Props) {
  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.title}>{title}</div>
        <div className={styles.message}>{message}</div>
        <div className={styles.actions}>
          <button className="btn" onClick={onCancel}>
            {cancelText ?? "Cancel"}
          </button>
          <button className="btn-primary" onClick={onConfirm}>
            {confirmText ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
