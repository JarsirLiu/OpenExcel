export interface ConfirmOptions {
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

export function resolveConfirmDialog(result: boolean) {
  resolveRef?.(result);
  resolveRef = null;
}

export function clearConfirmDialog() {
  resolveRef = null;
}
