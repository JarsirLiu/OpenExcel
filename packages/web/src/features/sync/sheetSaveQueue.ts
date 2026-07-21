export type SheetSaveResult = { revision: number };
export type SheetSaveTask = (baseRevision: number) => Promise<SheetSaveResult>;

export class SheetSaveInvalidatedError extends Error {
  constructor(sheetId: number) {
    super(`Sheet ${sheetId} 的排队保存已失效`);
    this.name = "SheetSaveInvalidatedError";
  }
}

/** Serializes saves per Sheet while allowing independent Sheets to save in parallel. */
export class SheetSaveQueue {
  private readonly tails = new Map<number, Promise<void>>();
  private readonly revisions = new Map<number, number>();
  private readonly invalidated = new Set<number>();
  private readonly pending = new Map<number, { baseRevision: number; token: number }>();
  private nextPendingToken = 1;

  registerPendingSave(sheetId: number, baseRevision: number): number {
    const token = this.nextPendingToken++;
    this.pending.set(sheetId, { baseRevision, token });
    return token;
  }

  cancelPendingSave(sheetId: number, token: number): void {
    if (this.pending.get(sheetId)?.token === token) this.pending.delete(sheetId);
  }

  consumePendingSave(sheetId: number, token: number): boolean {
    if (this.pending.get(sheetId)?.token !== token) return false;
    this.pending.delete(sheetId);
    return true;
  }

  setRevision(sheetId: number, revision: number): void {
    const pending = this.pending.get(sheetId);
    if (pending && pending.baseRevision !== revision) {
      this.pending.delete(sheetId);
    }
    if (this.tails.has(sheetId) && this.revisions.get(sheetId) !== revision) {
      this.invalidated.add(sheetId);
    }
    this.revisions.set(sheetId, revision);
  }

  enqueue(sheetId: number, baseRevision: number, task: SheetSaveTask): Promise<SheetSaveResult> {
    const previous = this.tails.get(sheetId) ?? Promise.resolve();
    const run = previous.then(async () => {
      if (this.invalidated.delete(sheetId)) {
        throw new SheetSaveInvalidatedError(sheetId);
      }
      const effectiveBaseRevision = this.revisions.get(sheetId) ?? baseRevision;
      const result = await task(effectiveBaseRevision);
      this.revisions.set(sheetId, result.revision);
      return result;
    });

    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(sheetId, tail);
    void tail.then(() => {
      if (this.tails.get(sheetId) === tail) this.tails.delete(sheetId);
    });

    return run;
  }
}
