import { describe, expect, it } from "vitest";
import { historyFromRuns } from "./transcript.js";

describe("historyFromRuns", () => {
  it("does not rebuild a reverted run into the session transcript", () => {
    const history = historyFromRuns([
      {
        status: "reverted",
        inputText: "修改表格",
        outputText: "已完成",
      },
      {
        status: "completed",
        inputText: "保留这条消息",
        outputText: "好的",
      },
    ] as any);

    expect(history).toEqual([
      { role: "user", content: "保留这条消息" },
      { role: "assistant", content: "好的" },
    ]);
  });
});
