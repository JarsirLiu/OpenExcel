import type { SheetCommandResult } from "@openexcel/core";

/**
 * Adapts the core command result to the existing chat patch contract.
 * The core layer calls the payload a mutation; the chat/Web projection calls it a delta.
 */
export function toSheetToolPatchResult(result: SheetCommandResult) {
  return {
    delta: result.mutation,
    baseRevision: result.baseRevision,
    revision: result.revision,
    changeSummary: result.changeSummary,
  };
}
