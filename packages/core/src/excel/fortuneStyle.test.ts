import { describe, expect, it } from "vitest";
import {
  excelBorderStyleToFortune,
  excelColorToFortune,
  excelHorizontalToFortune,
  excelVerticalToFortune,
  excelWrapToFortune,
  fortuneBorderStyleToExcel,
  fortuneColorToArgb,
  fortuneHorizontalToExcel,
  fortuneVerticalToExcel,
  fortuneWrapToExcel,
} from "./fortuneStyle.js";

describe("FortuneSheet style mapping", () => {
  it("round-trips alignment and wrapping semantics", () => {
    expect(fortuneHorizontalToExcel(0)).toBe("center");
    expect(fortuneVerticalToExcel(1)).toBe("top");
    expect(fortuneWrapToExcel("1")).toBe(false);
    expect(fortuneWrapToExcel("2")).toBe(true);

    expect(excelHorizontalToFortune("center")).toBe(0);
    expect(excelVerticalToFortune("top")).toBe(1);
    expect(excelVerticalToFortune("middle")).toBe(0);
    expect(excelWrapToFortune(false)).toBe("1");
    expect(excelWrapToFortune(true)).toBe("2");
  });

  it("shares color and border conversion across import and export", () => {
    expect(excelColorToFortune({ indexed: 2 })).toBe("#FF0000");
    expect(excelColorToFortune({ theme: 4, tint: 0.2 })).toBe("#729ACA");
    expect(fortuneColorToArgb("#112233")).toBe("FF112233");
    expect(excelColorToFortune({ rgb: "80112233" })).toBe("#80112233");
    expect(fortuneColorToArgb("#80112233")).toBe("80112233");
    expect(excelBorderStyleToFortune("medium")).toBe(8);
    expect(excelBorderStyleToFortune("dashed")).toBe(4);
    expect(fortuneBorderStyleToExcel(8)).toBe("medium");
    expect(fortuneBorderStyleToExcel(4)).toBe("dashed");
  });
});
