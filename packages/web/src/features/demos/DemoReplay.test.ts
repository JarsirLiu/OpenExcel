import { describe, expect, it } from "vitest";
import { buildDemoMessages } from "./DemoReplay";

describe("DemoReplay", () => {
  it("keeps all streamed text and tool calls in one assistant turn", () => {
    const parts = [
      { type: "text", stepId: "inspect", text: "先读取收费台账。" },
      {
        type: "tool-readSheet",
        toolCallId: "demo-inspect",
        state: "output-available",
        input: { sheetName: "学生应收台账", range: "A1:G7" },
        output: { sheetInfo: { sheetName: "学生应收台账", sheetNo: 1 } },
      },
      { type: "text", stepId: "write", text: "现在写入核对结果。" },
      {
        type: "tool-writeCells",
        toolCallId: "demo-write",
        state: "output-available",
        input: { sheetName: "缴费对账结果", range: "C1:F7" },
        output: { sheetInfo: { sheetName: "缴费对账结果", sheetNo: 4 } },
      },
    ] as any;

    const messages = buildDemoMessages(parts);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1]).toMatchObject({ id: "demo-assistant", role: "assistant" });
    expect(messages[1].parts).toEqual(parts);
  });
});
