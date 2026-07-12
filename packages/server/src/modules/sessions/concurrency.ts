const sessionLocks = new Map<number, Promise<void>>();

export class SessionBusyError extends Error {
  readonly statusCode = 409;
  readonly code = "SESSION_BUSY";

  constructor() {
    super("上一轮对话仍在处理中，请稍后再发送");
    this.name = "SessionBusyError";
  }
}

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
