import { describe, expect, it } from "vitest";
import type { DemoDefinition } from "./replayTypes";
import { validateDemoDefinition } from "./validateDemoDefinition";

function definition(overrides: Partial<DemoDefinition> = {}): DemoDefinition {
  return {
    id: "demo",
    route: "/demos/demo",
    workspace: { id: 1, publicId: "demo", name: "Demo", order: 0 },
    sessionName: "Demo",
    prompt: "核查数据",
    initialWorkbooks: [
      {
        name: "目标文件",
        publicId: "target",
        sheets: [{ name: "Sheet1", columns: ["A"], rows: [[{ value: "" }]] }],
      },
    ],
    timeline: [],
    ...overrides,
  };
}

describe("validateDemoDefinition", () => {
  it("accepts valid workbook references and patches", () => {
    expect(
      validateDemoDefinition(
        definition({
          timeline: [
            {
              id: "write",
              phase: "写入",
              title: "写入",
              assistantText: "写入",
              tokens: ["写入"],
              patch: {
                workbook: "目标文件",
                sheet: "Sheet1",
                row: 1,
                startCol: 1,
                values: [{ value: 10 }],
              },
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("reports duplicate steps and invalid references", () => {
    const errors = validateDemoDefinition(
      definition({
        timeline: [
          {
            id: "same",
            phase: "读取",
            title: "读取",
            assistantText: "读取",
            tokens: ["读取"],
            activeWorkbook: "不存在",
          },
          {
            id: "same",
            phase: "写入",
            title: "写入",
            assistantText: "写入",
            tokens: ["写入"],
            patch: {
              workbook: "目标文件",
              sheet: "Sheet1",
              row: 1,
              startCol: 2,
              values: [{ value: 10 }],
            },
          },
        ],
      }),
    );

    expect(errors).toEqual([
      "unknown workbook in step same: 不存在",
      "duplicate step id: same",
      "patch out of bounds in step same",
    ]);
  });

  it("reports invalid playback settings", () => {
    expect(
      validateDemoDefinition(
        definition({
          playback: { textTokenDelay: -1, toolStartDelay: Number.NaN },
        }),
      ),
    ).toEqual([
      "invalid playback setting: textTokenDelay",
      "invalid playback setting: toolStartDelay",
    ]);
  });

  it("reports an invalid step-specific tool execution duration", () => {
    expect(
      validateDemoDefinition(
        definition({
          timeline: [
            {
              id: "write",
              phase: "写入",
              title: "写入",
              assistantText: "写入",
              tokens: ["写入"],
              toolName: "writeCells",
              toolExecutionDuration: -1,
            },
          ],
        }),
      ),
    ).toEqual(["invalid tool execution duration in step write"]);
  });
});
