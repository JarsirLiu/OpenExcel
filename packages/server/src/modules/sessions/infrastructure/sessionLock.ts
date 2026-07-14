const sessionLocks = new Map<number, Promise<void>>();

export async function withSessionLock<T>(sessionId: number, operation: () => Promise<T>) {
  const previous = sessionLocks.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  sessionLocks.set(sessionId, current);
  await previous;

  try {
    return await operation();
  } finally {
    release();
    if (sessionLocks.get(sessionId) === current) {
      sessionLocks.delete(sessionId);
    }
  }
}
