import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  collectSheetPatchUpdates,
  collectWorkbookMutationToolCallIds,
  collectWorkbookRefreshToolCallIds,
  collectWorkbookStructureUpdates,
  useSheetPatchSync,
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

describe("collectWorkbookRefreshToolCallIds", () => {
  it("does not request a full refresh for handled sheet deltas", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-sheet",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
              delta: { type: "write", cells: [{ row: 1, col: 1, value: "x" }] },
            },
          },
          {
            toolCallId: "tool-chart",
            type: "tool-updateChart",
            state: "output-available",
            output: { success: true },
          },
        ],
      },
    ];

    expect(
      collectWorkbookRefreshToolCallIds(messages, new Set(), { sheetDeltasHandled: true }),
    ).toEqual(["tool-chart"]);
  });
});

describe("useSheetPatchSync", () => {
  it("skips hydrated history and applies later sheet deltas once", async () => {
    const onSheetChanged = vi.fn();
    const history = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "historical-tool",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
              delta: { type: "write", cells: [{ row: 1, col: 1, value: "old" }] },
            },
          },
        ],
      },
    ];
    const nextMessages = [
      ...history,
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "new-tool",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
              delta: { type: "write", cells: [{ row: 2, col: 2, value: "new" }] },
            },
          },
        ],
      },
    ];

    const { rerender } = renderHook(
      ({ messages, historyReady }: { messages: typeof history; historyReady: boolean }) =>
        useSheetPatchSync(messages, onSheetChanged, undefined, historyReady),
      { initialProps: { messages: history, historyReady: true } },
    );

    expect(onSheetChanged).not.toHaveBeenCalled();

    rerender({ messages: nextMessages, historyReady: true });
    await waitFor(() => expect(onSheetChanged).toHaveBeenCalledOnce());
    expect(onSheetChanged).toHaveBeenCalledWith(31, {
      type: "write",
      cells: [{ row: 2, col: 2, value: "new" }],
    });

    rerender({ messages: nextMessages, historyReady: true });
    expect(onSheetChanged).toHaveBeenCalledOnce();
  });

  it("applies live deltas that arrive before history becomes ready", async () => {
    const onSheetChanged = vi.fn();
    const history = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "historical-tool",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
              delta: { type: "write", cells: [{ row: 1, col: 1, value: "old" }] },
            },
          },
        ],
      },
    ];
    const liveMessages = [
      ...history,
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "live-tool",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
              delta: { type: "write", cells: [{ row: 2, col: 2, value: "new" }] },
            },
          },
        ],
      },
    ];
    const historicalToolCallIds = new Set(["historical-tool"]);

    const { rerender } = renderHook(
      ({ messages, historyReady }: { messages: typeof liveMessages; historyReady: boolean }) =>
        useSheetPatchSync(messages, onSheetChanged, undefined, historyReady, historicalToolCallIds),
      { initialProps: { messages: liveMessages, historyReady: false } },
    );

    rerender({ messages: liveMessages, historyReady: true });
    await waitFor(() => expect(onSheetChanged).toHaveBeenCalledOnce());
    expect(onSheetChanged).toHaveBeenCalledWith(31, {
      type: "write",
      cells: [{ row: 2, col: 2, value: "new" }],
    });
  });

  it("does not replay historical deltas added by pagination", async () => {
    const onSheetChanged = vi.fn();
    const currentMessages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "current-tool",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
              delta: { type: "write", cells: [{ row: 1, col: 1, value: "current" }] },
            },
          },
        ],
      },
    ];
    const olderMessage = {
      role: "assistant",
      parts: [
        {
          toolCallId: "older-tool",
          state: "output-available",
          output: {
            sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
            changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
            delta: { type: "write", cells: [{ row: 1, col: 1, value: "old" }] },
          },
        },
      ],
    };
    const historicalToolCallIds = new Set(["current-tool"]);

    const { rerender } = renderHook(
      ({ messages }: { messages: typeof currentMessages }) =>
        useSheetPatchSync(messages, onSheetChanged, undefined, true, historicalToolCallIds),
      { initialProps: { messages: currentMessages } },
    );

    historicalToolCallIds.add("older-tool");
    rerender({ messages: [olderMessage, ...currentMessages] });
    await waitFor(() => expect(onSheetChanged).not.toHaveBeenCalled());
  });
});
