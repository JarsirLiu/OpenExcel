import { describe, expect, it } from "vitest";
import { buildExampleSheetPersistence } from "./exampleSheetPersistence.js";

describe("buildExampleSheetPersistence", () => {
  it("stores template headers as canonical cells and offsets merges", () => {
    const result = buildExampleSheetPersistence({
      name: "Data",
      columns: [{ label: "Name" }, { label: "Value" }],
      rows: [["A", "1"]],
      merges: [{ row: [0, 1], col: [0, 0] }],
    });

    expect(JSON.parse(result.uploadedData)).toEqual([
      { r: 0, c: 0, v: { v: "Name", m: "Name" } },
      { r: 0, c: 1, v: { v: "Value", m: "Value" } },
      { r: 1, c: 0, v: { v: "A", m: "A" } },
      { r: 1, c: 1, v: { v: "1", m: "1" } },
    ]);
    expect(JSON.parse(result.merges)).toEqual([{ row: [1, 2], col: [0, 0] }]);
  });

  it("does not add a row when the template has no column metadata", () => {
    const result = buildExampleSheetPersistence({
      name: "Data",
      columns: [],
      rows: [["A"]],
    });

    expect(JSON.parse(result.uploadedData)).toEqual([{ r: 0, c: 0, v: { v: "A", m: "A" } }]);
  });
});
