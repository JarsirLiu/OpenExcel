export const MAX_PARALLEL_TOOL_CALLS = 10;

export type ToolConcurrencyGate = {
  tryAcquire: () => (() => void) | undefined;
  resetBatch: () => void;
};

/** Enforces both the active-call limit and the per-step admission limit. */
export function createToolConcurrencyGate(maxParallelToolCalls: number): ToolConcurrencyGate {
  if (!Number.isInteger(maxParallelToolCalls) || maxParallelToolCalls < 1) {
    throw new Error("maxParallelToolCalls must be a positive integer");
  }

  let activeCalls = 0;
  let batchCalls = 0;
  return {
    tryAcquire() {
      if (activeCalls >= maxParallelToolCalls || batchCalls >= maxParallelToolCalls) {
        return undefined;
      }
      batchCalls += 1;
      activeCalls += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        activeCalls -= 1;
      };
    },
    resetBatch() {
      if (activeCalls > 0) {
        throw new Error("Cannot reset tool call batch while tool calls are active");
      }
      batchCalls = 0;
    },
  };
}
