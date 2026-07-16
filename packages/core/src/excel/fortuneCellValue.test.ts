import { describe, expect, it } from "vitest";
import { normalizeFortuneCellValue } from "./fortuneCellValue.js";

describe("normalizeFortuneCellValue", () => {
  it("projects Excel General numeric values to FortuneSheet numeric cells", () => {
    expect(
      normalizeFortuneCellValue({ v: "0.18", m: "0.18" }, { inferGeneralNumeric: true }),
    ).toMatchObject({
      v: 0.18,
      m: "0.18",
      ht: 2,
      ct: { t: "n" },
    });
  });

  it("does not convert quoted numeric text", () => {
    const value = normalizeFortuneCellValue(
      { v: "00123", m: "00123", qp: 1 },
      { inferGeneralNumeric: true },
    );
    expect(value).toMatchObject({ v: "00123", m: "00123" });
    expect(value.ht).toBeUndefined();
  });

  it("preserves explicit alignment", () => {
    const options = { inferGeneralNumeric: true };
    expect(normalizeFortuneCellValue({ v: "0.18", m: "0.18", ht: 1 }, options).ht).toBe(1);
    expect(normalizeFortuneCellValue({ v: "0.18", m: "0.18", ht: 0 }, options).ht).toBe(0);
  });

  it("does not infer untyped values outside the import boundary", () => {
    expect(normalizeFortuneCellValue({ v: "123", m: "123" })).toEqual({
      v: "123",
      m: "123",
    });
  });

  it("treats malformed persisted cell types as unknown instead of throwing", () => {
    const value = normalizeFortuneCellValue({
      v: "legacy",
      m: "legacy",
      ct: { t: 123 as never },
    });

    expect(value).toMatchObject({ v: "legacy", m: "legacy" });
    expect(value.ct).toBeUndefined();
  });
});
