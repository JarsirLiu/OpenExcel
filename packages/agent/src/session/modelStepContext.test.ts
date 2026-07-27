import { describe, expect, it } from "vitest";
import { ModelStepContext } from "./modelStepContext.js";

describe("ModelStepContext", () => {
  const tools = [
    { name: "readSheetData", description: "读取", inputSchema: {} as any },
    { name: "writeSheetData", description: "写入", inputSchema: {} as any },
  ];

  it("tracks the effective messages, instructions, and active tools for a step", () => {
    const context = new ModelStepContext([{ role: "user", content: "初始" }], "系统", tools);
    const stepMessages = [{ role: "user", content: "实际请求" }];

    expect(
      context.startStep({
        messages: stepMessages,
        instructions: "步骤指令",
        activeTools: ["readSheetData"],
      }),
    ).toEqual({
      messages: stepMessages,
      systemPrompt: "步骤指令",
      toolDefinitions: [tools[0]],
    });

    expect(
      context.startStep({
        messages: stepMessages,
        instructions: undefined,
        activeTools: undefined,
      }),
    ).toEqual({
      messages: stepMessages,
      systemPrompt: undefined,
      toolDefinitions: tools,
    });
  });

  it("uses the SDK request messages as the completed step baseline", () => {
    const context = new ModelStepContext([{ role: "user", content: "初始" }], "系统", tools);
    context.startStep({
      messages: [{ role: "user", content: "步骤输入" }],
      instructions: "系统",
      activeTools: undefined,
    });

    const requestMessages = [
      { role: "user", content: "步骤输入" },
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-1" }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", output: "结果" }] },
    ];

    expect(context.finishStep({ messages: requestMessages }).messages).toEqual(requestMessages);
  });
});
