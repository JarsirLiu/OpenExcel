import { describe, expect, it } from "vitest";
import {
  applyDocumentOperationSchema,
  applyDocumentOperationsSchema,
  compactDocumentOperationsSchema,
} from "./dto.js";

describe("applyDocumentOperationSchema", () => {
  it("accepts a sparse cell write with optimistic revision", () => {
    const result = applyDocumentOperationSchema.safeParse({
      expectedRevision: 4,
      operation: {
        type: "setCell",
        row: 12,
        col: 3,
        value: { value: 42, displayValue: "42" },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects malformed ranges", () => {
    const result = applyDocumentOperationSchema.safeParse({
      operation: {
        type: "clearRange",
        range: { startRow: -1, startCol: 0, endRow: 2, endCol: 2 },
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts an atomic batch of document operations", () => {
    const result = applyDocumentOperationsSchema.safeParse({
      expectedRevision: 4,
      operations: [
        {
          type: "setCell",
          row: 0,
          col: 0,
          value: { value: "A", displayValue: "A" },
        },
        { type: "clearRange", range: { startRow: 1, startCol: 0, endRow: 1, endCol: 0 } },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts bounded batch and idempotency metadata", () => {
    const result = applyDocumentOperationsSchema.safeParse({
      batchId: "editor-batch-1",
      idempotencyKey: "request-1",
      operations: [
        {
          type: "setCell",
          row: 0,
          col: 0,
          value: { value: "A" },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(
      applyDocumentOperationsSchema.safeParse({
        batchId: "x".repeat(129),
        operations: [],
      }).success,
    ).toBe(false);
  });

  it("accepts an optional revision precondition for compaction", () => {
    expect(compactDocumentOperationsSchema.safeParse({ expectedRevision: 12 }).success).toBe(true);
    expect(compactDocumentOperationsSchema.safeParse({ expectedRevision: -1 }).success).toBe(false);
  });
});
