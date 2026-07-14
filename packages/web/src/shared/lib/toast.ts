export type ToastVariant = "info" | "warning" | "error" | "success";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

export function toast(options: ToastOptions | string) {
  const detail = typeof options === "string" ? { message: options } : options;
  window.dispatchEvent(new CustomEvent("toastShow", { detail }));
}
