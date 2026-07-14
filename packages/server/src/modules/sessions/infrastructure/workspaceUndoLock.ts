const workspaceUndoLocks = new Map<number, Promise<void>>();

export async function withWorkspaceUndoLock<T>(workspaceId: number, operation: () => Promise<T>) {
  const previous = workspaceUndoLocks.get(workspaceId) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  workspaceUndoLocks.set(workspaceId, current);

  await previous;
  try {
    return await operation();
  } finally {
    releaseCurrent();
    if (workspaceUndoLocks.get(workspaceId) === current) {
      workspaceUndoLocks.delete(workspaceId);
    }
  }
}
