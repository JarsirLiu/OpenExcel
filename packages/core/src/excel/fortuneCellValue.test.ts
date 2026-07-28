import { describe, expect, it } from "vitest";
import {
  dateTextToExcelSerial,
  excelSerialToDateText,
  fortuneDateCellValue,
  normalizeFortuneCellValue,
} from "./fortuneCellValue.js";

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

describe("Excel date values", () => {
  it("round-trips modern date serials without timezone conversion", () => {
    expect(excelSerialToDateText(44805)).toBe("2022-09-01");
    expect(dateTextToExcelSerial("2022-09-01")).toBe(44805);
    expect(excelSerialToDateText(44805.520833333336)).toBe("2022-09-01 12:30:00");
    expect(dateTextToExcelSerial("2022-09-01 12:30:00")).toBeCloseTo(44805.5208333333);
  });

  it("preserves the Excel 1900 leap-year compatibility value", () => {
    expect(dateTextToExcelSerial("1900-02-29")).toBe(60);
    expect(excelSerialToDateText(60)).toBe("1900-02-29");
    expect(dateTextToExcelSerial("1900-01-01")).toBe(1);
    expect(excelSerialToDateText(1)).toBe("1900-01-01");
  });

  it("rejects invalid or timezone-bearing model date strings", () => {
    expect(() => dateTextToExcelSerial("2022-02-30")).toThrow("日期值无效");
    expect(() => dateTextToExcelSerial("2022-09-01T00:00:00Z")).toThrow("日期必须使用");
  });

  it("keeps an existing date format when constructing a date cell", () => {
    expect(
      fortuneDateCellValue("2022-09-01", {
        v: 44805,
        m: "2022/9/1",
        ct: { t: "d", fa: "m/d/yy" },
      }),
    ).toMatchObject({ v: 44805, ct: { t: "d", fa: "m/d/yy" } });
  });
});
