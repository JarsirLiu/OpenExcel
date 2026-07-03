import { describe, expect, it } from "vitest";
import { buildWorkspaceContext } from "./context.js";

describe("buildWorkspaceContext", () => {
  it("formats workbooks and sheets into prompt text", () => {
    const text = buildWorkspaceContext([
      {
        id: 1,
        name: "销售分析",
        sheets: [
          { id: 10, name: "Q1" },
          { id: 11, name: "Q2" },
        ],
      },
    ]);

    expect(text).toContain("工作簿: 销售分析 (id: 1)");
    expect(text).toContain("Sheet: Q1 (id: 10)");
    expect(text).toContain("Sheet: Q2 (id: 11)");
  });

  it("returns an empty-workspace hint when there are no workbooks", () => {
    expect(buildWorkspaceContext([])).toBe("当前没有可用的工作簿。");
  });
});
