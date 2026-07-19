import { describe, expect, it } from "vitest";
import {
  collectSheetPatchUpdates,
  collectWorkbookMutationToolCallIds,
  collectWorkbookStructureUpdates,
} from "../features/chat/hooks/useSheetPatchSync";

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
              sheetInfo: { sheetId: 11, sheetNo: 2, sheetName: "Budget" },
              changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
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
              sheetInfo: { sheetId: 12, sheetNo: 3, sheetName: "Plan" },
              changeSummary: { changedCellCount: 0, rangeOperationCount: 0 },
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
        sheetNo: 3,
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
              sheetInfo: { sheetId: 13, sheetNo: 4, sheetName: "Invalid" },
              changeSummary: { changedCellCount: 0, rangeOperationCount: 0 },
              delta: {
                type: "write",
                cells: [{ row: 0, col: 1, value: "invalid" }],
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
              sheetInfo: { sheetId: 14, sheetNo: 5, sheetName: "Clear" },
              changeSummary: { changedCellCount: 4, rangeOperationCount: 0 },
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
        sheetNo: 5,
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

describe("collectWorkbookStructureUpdates", () => {
  it("collects workbook and sheet creation outputs once", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-5",
            toolName: "createWorkbook",
            state: "output-available",
            input: { sourceSheetId: 9 },
            output: {
              id: 21,
              name: "Monthly Plan",
              order: 4,
              sheets: 1,
              initialSheet: { id: 88, sheetNo: 1, name: "Sheet 1", order: 0 },
            },
          },
        ],
      },
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-6",
            toolName: "createSheet",
            state: "output-available",
            args: { workbookId: 21 },
            output: {
              workbookId: 21,
              id: 89,
              sheetNo: 2,
              name: "Extra",
              order: 1,
            },
          },
        ],
      },
    ];

    const updates = collectWorkbookStructureUpdates(messages, new Set(["tool-5"]));

    expect(updates).toEqual([
      {
        toolCallId: "tool-6",
        kind: "sheet-created",
        workbookId: 21,
        sheetId: 89,
        sheetNo: 2,
        sheetName: "Extra",
        order: 1,
        sourceSheetId: null,
      },
    ]);
  });

  it("detects createSheet with ai-sdk v7 static tool format (type: tool-{name})", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-8",
            type: "tool-createSheet",
            state: "output-available",
            input: { workbookId: 21 },
            output: {
              workbookId: 21,
              id: 91,
              sheetNo: 3,
              name: "NewSheet",
              order: 2,
            },
          },
        ],
      },
    ];

    const updates = collectWorkbookStructureUpdates(messages, new Set());

    expect(updates).toEqual([
      {
        toolCallId: "tool-8",
        kind: "sheet-created",
        workbookId: 21,
        sheetId: 91,
        sheetNo: 3,
        sheetName: "NewSheet",
        order: 2,
        sourceSheetId: null,
      },
    ]);
  });

  it("skips malformed structure outputs", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-7",
            toolName: "createWorkbook",
            state: "output-available",
            output: {
              id: 22,
              name: "Broken",
              order: "bad",
              sheets: 1,
              initialSheet: { id: 90, sheetNo: 1, name: "Sheet 1", order: 0 },
            },
          },
        ],
      },
    ];

    const updates = collectWorkbookStructureUpdates(messages, new Set());

    expect(updates).toEqual([]);
  });
});

describe("collectWorkbookMutationToolCallIds", () => {
  it("collects new sheet and structure tool calls without duplicating seen ids", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-10",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
              delta: {
                type: "clear",
                operations: [{ type: "cell", row: 1, col: 1 }],
              },
            },
          },
          {
            toolCallId: "tool-11",
            toolName: "createSheet",
            state: "output-available",
            output: {
              workbookId: 7,
              id: 32,
              sheetNo: 2,
              name: "Sheet2",
              order: 1,
            },
          },
        ],
      },
    ];

    expect(collectWorkbookMutationToolCallIds(messages, new Set(["tool-10"]))).toEqual(["tool-11"]);
    expect(new Set(collectWorkbookMutationToolCallIds(messages, new Set()))).toEqual(
      new Set(["tool-10", "tool-11"]),
    );
  });

  it("returns an empty list when only historical tool calls are present", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-12",
            toolName: "createWorkbook",
            state: "output-available",
            output: {
              id: 41,
              name: "Budget",
              order: 0,
              sheets: 1,
              initialSheet: { id: 51, sheetNo: 1, name: "Sheet 1", order: 0 },
            },
          },
        ],
      },
    ];

    expect(collectWorkbookMutationToolCallIds(messages, new Set(["tool-12"]))).toEqual([]);
  });
});
