import type { SheetCommand } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { sheetCommandFingerprint } from "./sheetCommandFingerprint.js";

describe("sheetCommandFingerprint", () => {
  it("is stable when object keys arrive in a different order", () => {
    const first: SheetCommand = {
      kind: "mutation",
      mutationId: "mutation-1",
      sheetId: 7,
      baseRevision: 2,
      mutation: {
        type: "write",
        operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "x" }],
      },
    };
    const second = JSON.parse(
      JSON.stringify({
        mutation: first.mutation,
        baseRevision: first.baseRevision,
        sheetId: first.sheetId,
        mutationId: first.mutationId,
        kind: first.kind,
      }),
    ) as SheetCommand;

    expect(sheetCommandFingerprint(first)).toBe(sheetCommandFingerprint(second));
  });

  it("does not treat baseRevision as part of the command identity", () => {
    const first: SheetCommand = {
      kind: "mutation",
      mutationId: "mutation-1",
      sheetId: 7,
      baseRevision: 2,
      mutation: {
        type: "write",
        operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "x" }],
      },
    };
    const retry = { ...first, baseRevision: 3 };

    expect(sheetCommandFingerprint(first)).toBe(sheetCommandFingerprint(retry));
  });

  it("ignores undefined optional fields like JSON.stringify does", () => {
    const command: SheetCommand = {
      kind: "mutation",
      mutationId: "mutation-1",
      sheetId: 7,
      baseRevision: 2,
      mutation: {
        type: "write",
        operations: [
          {
            type: "range",
            startRow: 1,
            startCol: 1,
            endRow: 1,
            endCol: 1,
            value: "中文",
            formula: undefined,
          },
        ],
      },
    };
    const withoutOptionalField = structuredClone(command);
    if (
      withoutOptionalField.mutation.type !== "write" ||
      !(
        withoutOptionalField.mutation.type === "write" &&
        "operations" in withoutOptionalField.mutation
      )
    ) {
      throw new Error("Expected a write mutation");
    }
    delete withoutOptionalField.mutation.operations[0].formula;

    expect(sheetCommandFingerprint(command)).toBe(sheetCommandFingerprint(withoutOptionalField));
  });
});
