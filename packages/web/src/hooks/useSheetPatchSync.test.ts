import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  collectSheetMutationToolCallIds,
  collectSheetPatchUpdates,
  parseCommittedMutationToolEvent,
  parseCommittedSheetToolEvent,
  type SheetPatchMessageLike,
  useSheetPatchSync,
} from "../features/chat/hooks/useSheetPatchSync";

describe("collectSheetPatchUpdates", () => {
  it("parses a committed sheet mutation from the live event stream", () => {
    const update = parseCommittedSheetToolEvent({
      eventId: "event-1",
      sequence: 4,
      type: "tool.finished",
      occurredAt: "2026-08-02T00:00:00.000Z",
      payload: {
        toolCallId: "tool-live",
        toolName: "writeCells",
        output: {
          sheetInfo: { sheetId: 11, sheetNo: 2, sheetName: "Budget" },
          changeSummary: {
            changedCellCount: 1,
            changedRanges: ["B1"],
            omittedRangeCount: 0,
            truncated: false,
            operationCount: 1,
          },
          delta: {
            type: "write",
            operations: [
              { type: "range", startRow: 1, startCol: 2, endRow: 1, endCol: 2, value: "123" },
            ],
          },
          baseRevision: 7,
          revision: 8,
        },
      },
    });

    expect(update).toEqual({
      toolCallId: "tool-live",
      sheetId: 11,
      sheetNo: 2,
      delta: {
        type: "write",
        operations: [
          { type: "range", startRow: 1, startCol: 2, endRow: 1, endCol: 2, value: "123" },
        ],
      },
      version: { baseRevision: 7, revision: 8 },
    });
  });

  it("uses eventData for editor sync when the card result is compacted", () => {
    const update = parseCommittedSheetToolEvent({
      eventId: "event-sync",
      sequence: 5,
      type: "tool.finished",
      occurredAt: "2026-08-02T00:00:00.000Z",
      payload: {
        toolCallId: "tool-sync",
        toolName: "writeCells",
        output: {
          sheetInfo: { sheetId: 11, sheetNo: 2, sheetName: "Budget" },
          changeSummary: {
            changedCellCount: 1,
            changedRanges: ["B1"],
            omittedRangeCount: 0,
            truncated: false,
            operationCount: 1,
          },
          delta: null,
        },
        eventData: {
          sheetInfo: { sheetId: 11, sheetNo: 2, sheetName: "Budget" },
          changeSummary: {
            changedCellCount: 1,
            changedRanges: ["B1"],
            omittedRangeCount: 0,
            truncated: false,
            operationCount: 1,
          },
          delta: {
            type: "write",
            operations: [
              { type: "range", startRow: 1, startCol: 2, endRow: 1, endCol: 2, value: "123" },
            ],
          },
          baseRevision: 7,
          revision: 8,
        },
      },
    });

    expect(update?.delta).toEqual({
      type: "write",
      operations: [{ type: "range", startRow: 1, startCol: 2, endRow: 1, endCol: 2, value: "123" }],
    });
  });

  it("ignores failed or read-tool events", () => {
    const baseEvent = {
      eventId: "event-2",
      sequence: 5,
      type: "tool.finished" as const,
      occurredAt: "2026-08-02T00:00:00.000Z",
      payload: {
        toolCallId: "tool-read",
        toolName: "readSheetData",
        output: {},
      },
    };

    expect(parseCommittedSheetToolEvent(baseEvent)).toBeNull();
    expect(
      parseCommittedSheetToolEvent({
        ...baseEvent,
        payload: { ...baseEvent.payload, toolName: "writeCells", error: { kind: "failed" } },
      }),
    ).toBeNull();
  });

  it("accepts a committed formatCells delta as a sheet mutation", () => {
    expect(
      parseCommittedSheetToolEvent({
        eventId: "event-format",
        sequence: 5,
        type: "tool.finished",
        occurredAt: "2026-08-02T00:00:00.000Z",
        payload: {
          toolCallId: "tool-format",
          toolName: "formatCells",
          output: {
            sheetInfo: { sheetId: 11, sheetNo: 2, sheetName: "Budget" },
            changeSummary: {
              changedCellCount: 1,
              changedRanges: ["B1"],
              omittedRangeCount: 0,
              truncated: false,
              operationCount: 1,
            },
            delta: {
              type: "format",
              operations: [
                {
                  type: "range",
                  startRow: 1,
                  startCol: 2,
                  endRow: 1,
                  endCol: 2,
                  fill: "#FFF2CC",
                },
              ],
            },
            baseRevision: 7,
            revision: 8,
          },
        },
      }),
    ).toEqual({
      toolCallId: "tool-format",
      sheetId: 11,
      sheetNo: 2,
      delta: {
        type: "format",
        operations: [
          {
            type: "range",
            startRow: 1,
            startCol: 2,
            endRow: 1,
            endCol: 2,
            fill: "#FFF2CC",
          },
        ],
      },
      version: { baseRevision: 7, revision: 8 },
    });
  });

  it("classifies committed workbook and chart mutations", () => {
    const baseEvent = {
      eventId: "event-mutation",
      sequence: 6,
      type: "tool.finished" as const,
      occurredAt: "2026-08-02T00:00:00.000Z",
      payload: {
        toolCallId: "tool-mutation",
        toolName: "createChart",
        output: { success: true },
      },
    };

    expect(parseCommittedMutationToolEvent(baseEvent)).toEqual({
      kind: "chart",
      toolCallId: "tool-mutation",
    });
    expect(
      parseCommittedMutationToolEvent({
        ...baseEvent,
        payload: { ...baseEvent.payload, toolName: "createSheet" },
      }),
    ).toEqual({ kind: "workbook", toolCallId: "tool-mutation" });
  });

  it("collects valid completed patch outputs once", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-1",
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 11 },
            output: {
              sheetInfo: { sheetId: 11, sheetNo: 2, sheetName: "Budget" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["B1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 1, startCol: 2, endRow: 1, endCol: 2, value: "123" },
                ],
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
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 12 },
            output: {
              sheetInfo: { sheetId: 12, sheetNo: 3, sheetName: "Plan" },
              changeSummary: {
                changedCellCount: 0,
                changedRanges: [],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 0,
              },
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
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 13 },
            output: {
              sheetInfo: { sheetId: 13, sheetNo: 4, sheetName: "Invalid" },
              changeSummary: {
                changedCellCount: 0,
                changedRanges: [],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 0,
              },
              delta: {
                type: "write",
                operations: [
                  {
                    type: "range",
                    startRow: 0,
                    startCol: 2,
                    endRow: 0,
                    endCol: 2,
                    value: "invalid",
                  },
                ],
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
            type: "tool-clearCells",
            state: "output-available",
            input: { sheetId: 14 },
            output: {
              sheetInfo: { sheetId: 14, sheetNo: 5, sheetName: "Clear" },
              changeSummary: {
                changedCellCount: 4,
                changedRanges: ["A1:C3"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 2,
              },
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

describe("collectSheetMutationToolCallIds", () => {
  it("collects new sheet tool calls without duplicating seen ids", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-10",
            type: "tool-clearCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["A1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "clear",
                operations: [{ type: "cell", row: 1, col: 1 }],
              },
            },
          },
        ],
      },
    ];

    expect(collectSheetMutationToolCallIds(messages, new Set(["tool-10"]))).toEqual([]);
    expect(collectSheetMutationToolCallIds(messages, new Set())).toEqual(["tool-10"]);
  });

  it("returns an empty list when only historical tool calls are present", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-12",
            type: "tool-readSheetData",
            state: "output-available",
            input: {},
            output: { cells: [[1]] },
          },
        ],
      },
    ];

    expect(collectSheetMutationToolCallIds(messages, new Set(["tool-12"]))).toEqual([]);
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
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["A1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "old" },
                ],
              },
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
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["B2"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 2, startCol: 2, endRow: 2, endCol: 2, value: "new" },
                ],
              },
            },
          },
        ],
      },
    ];

    const { rerender } = renderHook(
      ({ messages, historyReady }: { messages: typeof history; historyReady: boolean }) =>
        useSheetPatchSync(messages, onSheetChanged, historyReady),
      { initialProps: { messages: history, historyReady: true } },
    );

    expect(onSheetChanged).not.toHaveBeenCalled();

    rerender({ messages: nextMessages, historyReady: true });
    await waitFor(() => expect(onSheetChanged).toHaveBeenCalledOnce());
    expect(onSheetChanged).toHaveBeenCalledWith(31, {
      type: "write",
      operations: [{ type: "range", startRow: 2, startCol: 2, endRow: 2, endCol: 2, value: "new" }],
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
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["A1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "old" },
                ],
              },
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
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["B2"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 2, startCol: 2, endRow: 2, endCol: 2, value: "new" },
                ],
              },
            },
          },
        ],
      },
    ];
    const historicalToolCallIds = new Set(["historical-tool"]);

    const { rerender } = renderHook(
      ({ messages, historyReady }: { messages: typeof liveMessages; historyReady: boolean }) =>
        useSheetPatchSync(messages, onSheetChanged, historyReady, historicalToolCallIds),
      { initialProps: { messages: liveMessages, historyReady: false } },
    );

    rerender({ messages: liveMessages, historyReady: true });
    await waitFor(() => expect(onSheetChanged).toHaveBeenCalledOnce());
    expect(onSheetChanged).toHaveBeenCalledWith(31, {
      type: "write",
      operations: [{ type: "range", startRow: 2, startCol: 2, endRow: 2, endCol: 2, value: "new" }],
    });
  });

  it("retries a live delta when its direct editor application is removed", async () => {
    const onSheetChanged = vi.fn();
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "live-tool",
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["A1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "new" },
                ],
              },
            },
          },
        ],
      },
    ];
    const liveToolCallIds = new Set(["live-tool"]);
    const { rerender } = renderHook(
      ({ liveIds }: { liveIds: ReadonlySet<string> }) =>
        useSheetPatchSync(messages, onSheetChanged, true, new Set(), liveIds),
      { initialProps: { liveIds: liveToolCallIds } },
    );

    expect(onSheetChanged).not.toHaveBeenCalled();

    rerender({ liveIds: new Set() });
    await waitFor(() => expect(onSheetChanged).toHaveBeenCalledOnce());
    expect(onSheetChanged).toHaveBeenCalledWith(31, {
      type: "write",
      operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "new" }],
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
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["A1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  {
                    type: "range",
                    startRow: 1,
                    startCol: 1,
                    endRow: 1,
                    endCol: 1,
                    value: "current",
                  },
                ],
              },
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
          type: "tool-writeCells",
          state: "output-available",
          input: { sheetId: 31 },
          output: {
            sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
            changeSummary: {
              changedCellCount: 1,
              changedRanges: ["A1"],
              omittedRangeCount: 0,
              truncated: false,
              operationCount: 1,
            },
            delta: {
              type: "write",
              operations: [
                { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "old" },
              ],
            },
          },
        },
      ],
    };
    const historicalToolCallIds = new Set(["current-tool"]);

    const { rerender } = renderHook(
      ({ messages }: { messages: typeof currentMessages }) =>
        useSheetPatchSync(messages, onSheetChanged, true, historicalToolCallIds),
      { initialProps: { messages: currentMessages } },
    );

    historicalToolCallIds.add("older-tool");
    rerender({ messages: [olderMessage, ...currentMessages] });
    await waitFor(() => expect(onSheetChanged).not.toHaveBeenCalled());
  });

  it("does not replay an initially applied AI delta after the user edits the sheet", async () => {
    const onSheetChanged = vi.fn();
    const initialMessages: SheetPatchMessageLike[] = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "initial-ai-tool",
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["A1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "ai" },
                ],
              },
            },
          },
        ],
      },
    ];

    const { rerender } = renderHook(
      ({ messages }: { messages: SheetPatchMessageLike[] }) =>
        useSheetPatchSync(messages, onSheetChanged, true, new Set()),
      { initialProps: { messages: initialMessages } },
    );

    await waitFor(() => expect(onSheetChanged).toHaveBeenCalledOnce());

    rerender({
      messages: [
        ...initialMessages,
        { role: "assistant", parts: [{ type: "text", text: "Chart created" }] },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSheetChanged).toHaveBeenCalledOnce();
  });

  it("does not replay a live delta that was already applied from the event stream", async () => {
    const onSheetChanged = vi.fn();
    const liveToolCallIds = new Set(["live-tool"]);
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "live-tool",
            type: "tool-writeCells",
            state: "output-available",
            input: { sheetId: 31 },
            output: {
              sheetInfo: { sheetId: 31, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["A1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "new" },
                ],
              },
            },
          },
        ],
      },
    ];

    renderHook(() => useSheetPatchSync(messages, onSheetChanged, true, new Set(), liveToolCallIds));

    await waitFor(() => expect(onSheetChanged).not.toHaveBeenCalled());
  });
});
