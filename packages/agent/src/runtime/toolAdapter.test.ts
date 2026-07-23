import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgentToolSet } from "./toolAdapter.js";

describe("createAgentToolSet", () => {
  it("routes AI SDK tool execution through the injected executor", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const onToolStart = vi.fn();
    const onToolFinish = vi.fn();
    const tools = createAgentToolSet(
      [
        {
          name: "readSheetData",
          description: "Read a sheet",
          inputSchema: z.object({ sheetId: z.number() }),
        },
      ],
      { execute },
      { tenant: "opaque" },
      { onToolStart, onToolFinish },
    );

    const output = await (tools.readSheetData as any).execute(
      { sheetId: 7 },
      { toolCallId: "call-1", abortSignal: undefined },
    );

    expect(output).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith(
      "readSheetData",
      { sheetId: 7 },
      {
        toolCallId: "call-1",
        abortSignal: undefined,
        context: { tenant: "opaque" },
      },
    );
    expect(onToolStart).toHaveBeenCalledWith({
      toolName: "readSheetData",
      toolCallId: "call-1",
      input: { sheetId: 7 },
    });
    expect(onToolFinish).toHaveBeenCalledWith({
      toolName: "readSheetData",
      toolCallId: "call-1",
      input: { sheetId: 7 },
      output: { ok: true },
    });
  });
});
