import { describe, expect, it } from "vitest";
import { projectSheetObjects } from "./sheetObjectProjection.js";

describe("projectSheetObjects", () => {
  it("projects a filter selection", () => {
    expect(
      projectSheetObjects(
        { config: { filter_select: { row: [0, 10], column: [0, 3] } } },
        "filters",
      ),
    ).toEqual([{ kind: "filter", range: "A1:D11" }]);
  });

  it("returns no filter when the sheet has no active filter selection", () => {
    expect(projectSheetObjects({ config: null }, "filters")).toEqual([]);
  });
});
