import { describe, expect, it } from "vitest";
import { buildDemoMessages, buildToolPart } from "./replayChat";
import type { DemoStep, DemoWorkbook } from "./replayTypes";

describe("replay chat projection", () => {
  it("keeps all streamed text and tool calls in one assistant turn", () => {
    const parts = [
      { type: "text", stepId: "inspect", text: "先读取库存表。" },
      {
        type: "tool-readSheetData",
        toolCallId: "demo-inspect",
        state: "output-available",
        input: { sheetName: "库存查询", range: "A1:G7" },
        output: { sheetInfo: { sheetName: "库存查询", sheetNo: 1 } },
      },
      { type: "text", stepId: "write", text: "现在写入核查结果。" },
      {
        type: "tool-writeCells",
        toolCallId: "demo-write",
        state: "output-available",
        input: { sheetName: "4月", range: "C1:F7" },
        output: { sheetInfo: { sheetName: "4月", sheetNo: 1 } },
      },
    ] as any;

    const messages = buildDemoMessages(parts);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1]).toMatchObject({ id: "demo-assistant", role: "assistant" });
    expect(messages[1].parts).toEqual(parts);
  });

  it("does not render a sheet preview for read steps", () => {
    const workbooks: DemoWorkbook[] = [
      {
        name: "核查文件",
        publicId: "demo-workbook",
        sheets: [
          {
            name: "Sheet1",
            columns: ["名称"],
            rows: [[{ value: "苹果" }]],
          },
        ],
      },
    ];
    const step: DemoStep = {
      id: "read-sheet",
      phase: "分析",
      title: "读取 Sheet",
      toolName: "readSheetData",
      toolInput: "读取 Sheet1",
      toolOutput: "读取完成",
      assistantText: "先读取数据。",
      tokens: ["先读取数据。"],
      activeWorkbook: "核查文件",
      activeSheet: "Sheet1",
      highlight: "A1:A1",
    };

    const part = buildToolPart(step, "output-available", workbooks);

    expect(part.output).not.toHaveProperty("preview");
    expect(part.output).not.toHaveProperty("previewLabel");
    expect(part.output).toMatchObject({
      sheetInfo: { sheetName: "Sheet1" },
      message: "读取完成",
    });
  });
});
