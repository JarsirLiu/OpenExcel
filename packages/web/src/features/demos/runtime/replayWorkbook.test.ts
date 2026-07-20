import { describe, expect, it } from "vitest";
import type { DemoStep, DemoWorkbook } from "./replayTypes";
import { commitDemoWorkbook, stageDemoWorkbookStep } from "./replayWorkbook";

function workbook(): DemoWorkbook {
  return {
    publicId: "workbook-1",
    name: "目标文件",
    sheets: [
      {
        name: "Sheet1",
        columns: ["商品", "数量", "退货"],
        rows: [[{ value: "苹果" }, { value: "" }, { value: "" }]],
      },
    ],
  };
}

function writeStep(value: string, startCol: number): DemoStep {
  return {
    id: `write-${value}`,
    phase: "写入",
    title: "写入结果",
    assistantText: "写入结果。",
    tokens: ["写入结果。"],
    toolName: "writeCells",
    toolInput: `写入 Sheet1 ${startCol === 2 ? "B1" : "C1"}`,
    toolOutput: "写入完成",
    activeWorkbook: "目标文件",
    activeSheet: "Sheet1",
    patch: {
      workbook: "目标文件",
      sheet: "Sheet1",
      row: 1,
      startCol,
      values: [{ value }],
    },
  };
}

describe("demo workbook replay", () => {
  it("keeps reads out of the visible workbook refresh path", () => {
    const visible = [workbook()];
    const readStep: DemoStep = {
      id: "read",
      phase: "分析",
      title: "读取结果",
      assistantText: "读取结果。",
      tokens: ["读取结果。"],
      toolName: "readSheetData",
      toolInput: "读取 Sheet1",
      toolOutput: "读取完成",
      activeWorkbook: "目标文件",
      activeSheet: "Sheet1",
    };
    const state = stageDemoWorkbookStep({ visible, staged: null, hasChanges: false }, readStep);

    expect(state).toEqual({ visible, staged: null, hasChanges: false });
  });

  it("accumulates writes and commits them as one workbook update", () => {
    const visible = [workbook()];
    const staged = stageDemoWorkbookStep(
      { visible, staged: null, hasChanges: false },
      writeStep("10", 2),
    );
    const accumulated = stageDemoWorkbookStep(staged, writeStep("20", 3));
    const committed = commitDemoWorkbook(accumulated);

    expect(committed.visible[0]?.sheets[0]?.rows[0]?.[1]?.value).toBe("10");
    expect(committed.visible[0]?.sheets[0]?.rows[0]?.[2]?.value).toBe("20");
    expect(committed.staged).toBeNull();
    expect(committed.hasChanges).toBe(false);
    expect(accumulated.visible).toBe(visible);
  });
});
