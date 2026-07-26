import { describe, expect, it } from "vitest";
import {
  projectRunCheckpoint,
  projectRunTranscript,
  projectStreamedAssistantMessages,
} from "./runCheckpointProjector.js";

describe("projectStreamedAssistantMessages", () => {
  it("groups text and reasoning deltas by message and part", () => {
    const messages = projectStreamedAssistantMessages([
      {
        eventId: "2",
        sequence: 2,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "second", partId: "second-text", delta: "B" },
      },
      {
        eventId: "1",
        sequence: 1,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "first", partId: "first-text", delta: "A" },
      },
      {
        eventId: "3",
        sequence: 3,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "first", partId: "first-text", delta: "1" },
      },
      {
        eventId: "4",
        sequence: 4,
        type: "reasoning.delta",
        occurredAt: "",
        payload: { messageId: "first", partId: "first-reasoning", delta: "why" },
      },
    ]);

    expect(messages).toEqual([
      {
        id: "first",
        role: "assistant",
        parts: [
          { id: "first-text", type: "text", text: "A1" },
          { id: "first-reasoning", type: "reasoning", text: "why" },
        ],
      },
      { id: "second", role: "assistant", parts: [{ id: "second-text", type: "text", text: "B" }] },
    ]);
  });

  it("replays a tool call and its result under the assistant turn", () => {
    expect(
      projectStreamedAssistantMessages([
        {
          eventId: "tool-start",
          sequence: 1,
          type: "tool.started",
          occurredAt: "",
          payload: {
            turnId: "turn-1",
            stepIndex: 1,
            toolCallId: "call-1",
            toolName: "createChart",
            input: { title: "收入" },
          },
        },
        {
          eventId: "tool-finish",
          sequence: 2,
          type: "tool.finished",
          occurredAt: "",
          payload: {
            turnId: "turn-1",
            stepIndex: 1,
            toolCallId: "call-1",
            toolName: "createChart",
            output: { chartId: 7 },
          },
        },
      ]),
    ).toEqual([
      {
        id: "turn-1-assistant",
        role: "assistant",
        parts: [
          {
            id: "tool-call-1",
            type: "tool-createChart",
            toolCallId: "call-1",
            state: "output-available",
            input: { title: "收入" },
            output: { chartId: 7 },
          },
        ],
      },
    ]);
  });

  it("closes a pending tool when the run is cancelled", () => {
    expect(
      projectStreamedAssistantMessages([
        {
          eventId: "tool-start",
          sequence: 1,
          type: "tool.started",
          occurredAt: "",
          payload: {
            turnId: "turn-1",
            toolCallId: "call-1",
            toolName: "writeCells",
            input: {},
          },
        },
        {
          eventId: "run-cancelled",
          sequence: 2,
          type: "run.cancelled",
          occurredAt: "",
          payload: {},
        },
      ]),
    ).toEqual([
      {
        id: "turn-1-assistant",
        role: "assistant",
        parts: [
          {
            id: "tool-call-1",
            type: "tool-writeCells",
            toolCallId: "call-1",
            state: "output-error",
            input: {},
            errorText: "工具执行已中断",
          },
        ],
      },
    ]);
  });

  it("groups all model steps into one assistant message", () => {
    expect(
      projectStreamedAssistantMessages([
        {
          eventId: "text-1",
          sequence: 1,
          type: "message.delta",
          occurredAt: "",
          payload: {
            turnId: "turn-1",
            stepIndex: 1,
            messageId: "turn-1-assistant",
            partId: "turn-1-text-1",
            delta: "先读取。",
          },
        },
        {
          eventId: "tool-start",
          sequence: 2,
          type: "tool.started",
          occurredAt: "",
          payload: {
            turnId: "turn-1",
            stepIndex: 1,
            messageId: "turn-1-assistant",
            toolCallId: "call-1",
            toolName: "readSheetData",
            input: { sheetId: 1 },
          },
        },
        {
          eventId: "tool-finish",
          sequence: 3,
          type: "tool.finished",
          occurredAt: "",
          payload: {
            turnId: "turn-1",
            stepIndex: 1,
            messageId: "turn-1-assistant",
            toolCallId: "call-1",
            toolName: "readSheetData",
            input: { sheetId: 1 },
            output: { cells: [[1]] },
          },
        },
        {
          eventId: "text-2",
          sequence: 4,
          type: "message.delta",
          occurredAt: "",
          payload: {
            turnId: "turn-1",
            stepIndex: 2,
            messageId: "turn-1-assistant",
            partId: "turn-1-text-2",
            delta: "读取完成。",
          },
        },
      ]),
    ).toEqual([
      {
        id: "turn-1-assistant",
        role: "assistant",
        parts: [
          { id: "turn-1-text-1", type: "text", text: "先读取。" },
          {
            id: "tool-call-1",
            type: "tool-readSheetData",
            toolCallId: "call-1",
            state: "output-available",
            input: { sheetId: 1 },
            output: { cells: [[1]] },
          },
          { id: "turn-1-text-2", type: "text", text: "读取完成。" },
        ],
      },
    ]);
  });
});

describe("projectRunCheckpoint", () => {
  it("keeps reasoning separate and preserves tool events by sequence", () => {
    const checkpoint = projectRunCheckpoint(
      [
        {
          eventId: "reasoning-1",
          sequence: 1,
          type: "reasoning.delta",
          occurredAt: "",
          payload: { delta: "think " },
        },
        {
          eventId: "tool-1",
          sequence: 2,
          type: "tool.started",
          occurredAt: "",
          payload: { toolCallId: "call-1", toolName: "createChart" },
        },
        {
          eventId: "message-1",
          sequence: 3,
          type: "message.delta",
          occurredAt: "",
          payload: { messageId: "message-1", partId: "message-1-text", delta: "done" },
        },
      ],
      [{ role: "assistant", parts: [{ type: "text", text: "done" }] }],
    );

    expect(checkpoint).toEqual({
      checkpointSequence: 3,
      transcript: [{ role: "assistant", parts: [{ type: "text", text: "done" }] }],
      reasoning: "think ",
      toolState: [
        { type: "tool.started", payload: { toolCallId: "call-1", toolName: "createChart" } },
      ],
    });
  });
});

describe("projectRunTranscript", () => {
  it("merges later deltas into the existing message and part", () => {
    const transcript = projectRunTranscript(
      [
        {
          eventId: "text-2",
          sequence: 2,
          type: "message.delta",
          occurredAt: "",
          payload: { messageId: "assistant-1", partId: "text-1", delta: "后半段" },
        },
      ],
      [
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ id: "text-1", type: "text", text: "前半段" }],
        },
      ],
    );

    expect(transcript).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ id: "text-1", type: "text", text: "前半段后半段" }],
      },
    ]);
  });
});
