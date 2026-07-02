import { describe, expect, it } from "vitest";
import { collectSheetPatchUpdates } from "./useSheetPatchSync";

describe("collectSheetPatchUpdates", () => {
  it("collects valid completed patch outputs once", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-1",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 11, sheetName: "Budget" },
              delta: {
                type: "write",
                cells: [{ row: 1, col: 2, value: "123" }],
              },
            },
          },
        ],
      },
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-2",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 12, sheetName: "Plan" },
              delta: null,
            },
          },
        ],
      },
    ];

    const updates = collectSheetPatchUpdates(messages, new Set(["tool-1"]));

    expect(updates).toEqual([
      {
        toolCallId: "tool-2",
        sheetId: 12,
        delta: null,
      },
    ]);
  });

  it("skips malformed tool outputs", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-3",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 13, sheetName: "Invalid" },
              delta: {
                type: "write",
                cells: [],
              },
            },
          },
        ],
      },
    ];

    const updates = collectSheetPatchUpdates(messages, new Set());

    expect(updates).toEqual([]);
  });

  it("accepts clear outputs", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-4",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 14, sheetName: "Clear" },
              delta: {
                type: "clear",
                operations: [
                  { type: "cell", row: 1, col: 1 },
                  { type: "range", startRow: 2, startCol: 2, endRow: 3, endCol: 3 },
                ],
              },
            },
          },
        ],
      },
    ];

    const updates = collectSheetPatchUpdates(messages, new Set());

    expect(updates).toEqual([
      {
        toolCallId: "tool-4",
        sheetId: 14,
        delta: {
          type: "clear",
          operations: [
            { type: "cell", row: 1, col: 1 },
            { type: "range", startRow: 2, startCol: 2, endRow: 3, endCol: 3 },
          ],
        },
      },
    ]);
  });
});
