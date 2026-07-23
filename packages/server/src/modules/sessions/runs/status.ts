export const runStatuses = [
  "running",
  "completed",
  "cancelled",
  "failed",
  "persistence_failed",
  "recovery_required",
  "reverted",
] as const;

export type RunStatus = (typeof runStatuses)[number];

export const terminalRunStatuses = new Set<RunStatus>([
  "completed",
  "cancelled",
  "failed",
  "persistence_failed",
  "recovery_required",
  "reverted",
]);

const allowedTransitions: Record<RunStatus, ReadonlySet<RunStatus>> = {
  running: new Set(["completed", "cancelled", "failed", "persistence_failed", "recovery_required"]),
  completed: new Set(["reverted"]),
  cancelled: new Set(["reverted"]),
  failed: new Set(["reverted"]),
  persistence_failed: new Set(),
  recovery_required: new Set(),
  reverted: new Set(),
};

export function isRunStatus(value: string): value is RunStatus {
  return (runStatuses as readonly string[]).includes(value);
}

export function assertRunStatusTransition(from: string, to: RunStatus) {
  if (!isRunStatus(from)) {
    throw new Error(`未知的 AgentRun 状态: ${from}`);
  }
  if (from === to) return;
  if (!allowedTransitions[from].has(to)) {
    throw new Error(`非法的 AgentRun 状态转换: ${from} -> ${to}`);
  }
}
