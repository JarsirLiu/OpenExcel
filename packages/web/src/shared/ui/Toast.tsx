import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Alert } from "@/components/ui/Alert/Alert";
import type { ToastOptions } from "@/shared/lib/toast";
import styles from "./Toast.module.css";

const DEFAULT_DURATION = 3000;

export function Toast() {
  const [current, setCurrent] = useState<ToastOptions | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handler = (event: Event) => {
      const options = (event as CustomEvent<ToastOptions>).detail;
      if (!options?.message) return;

      if (timeoutId !== undefined) clearTimeout(timeoutId);
      setCurrent(options);
      timeoutId = setTimeout(() => {
        setCurrent(null);
        timeoutId = undefined;
      }, options.duration ?? DEFAULT_DURATION);
    };

    window.addEventListener("toastShow", handler);
    return () => {
      window.removeEventListener("toastShow", handler);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  if (!current) return null;

  return createPortal(
    <Alert variant={current.variant ?? "info"} className={styles.toast}>
      {current.message}
    </Alert>,
    document.body,
  );
}
