import { SheetSaveQueue, type SheetSaveTask } from "./sheetSaveQueue";

type PendingSave = {
  baseRevision: number;
  token: number;
  timer: ReturnType<typeof setTimeout>;
};

/** Owns per-Sheet debounce state and delegates ordered execution to the queue. */
export class SheetSaveScheduler {
  private readonly pending = new Map<number, PendingSave>();

  constructor(
    private readonly queue = new SheetSaveQueue(),
    private readonly debounceMs = 500,
  ) {}

  schedule(sheetId: number, baseRevision: number, task: SheetSaveTask): void {
    this.cancel(sheetId);

    const token = this.queue.registerPendingSave(sheetId, baseRevision);
    const timer = setTimeout(() => {
      const pending = this.pending.get(sheetId);
      if (!pending || pending.token !== token) return;
      this.pending.delete(sheetId);
      if (!this.queue.consumePendingSave(sheetId, token)) return;

      void this.queue.enqueue(sheetId, baseRevision, task).catch(() => undefined);
    }, this.debounceMs);

    this.pending.set(sheetId, { baseRevision, token, timer });
  }

  setRevision(sheetId: number, revision: number): void {
    const pending = this.pending.get(sheetId);
    if (pending && pending.baseRevision !== revision) {
      clearTimeout(pending.timer);
      this.pending.delete(sheetId);
      this.queue.cancelPendingSave(sheetId, pending.token);
    }
    this.queue.setRevision(sheetId, revision);
  }

  cancel(sheetId: number): void {
    const pending = this.pending.get(sheetId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(sheetId);
    this.queue.cancelPendingSave(sheetId, pending.token);
  }

  dispose(): void {
    for (const sheetId of this.pending.keys()) {
      this.cancel(sheetId);
    }
  }
}
