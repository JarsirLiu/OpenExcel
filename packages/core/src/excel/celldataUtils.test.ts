import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORTUNE_FONT_COLOR,
  type FortuneCell,
  normalizeFortuneCellData,
} from "./celldataUtils.js";

describe("normalizeFortuneCellData", () => {
  it("applies the default black color without mutating input cells", () => {
    const input: FortuneCell[] = [{ r: 0, c: 0, v: { v: "文字", m: "文字" } }];

    const result = normalizeFortuneCellData(input);

    expect(result).toEqual([
      { r: 0, c: 0, v: { v: "文字", m: "文字", fc: DEFAULT_FORTUNE_FONT_COLOR } },
    ]);
    expect(input[0]?.v.fc).toBeUndefined();
  });

  it("preserves explicit colors and the original array when no change is needed", () => {
    const input: FortuneCell[] = [{ r: 0, c: 0, v: { v: "文字", m: "文字", fc: "#FFFFFF" } }];

    expect(normalizeFortuneCellData(input)).toBe(input);
  });

  it("flattens a single inline rich-text run without dropping its style", () => {
    const input: FortuneCell[] = [
      {
        r: 3,
        c: 0,
        v: {
          v: "",
          m: "",
          fc: "#000000",
          ct: {
            fa: "General",
            t: "inlineStr",
            s: [{ v: "产能利用率", ff: "仿宋_GB2312", fs: 12, fc: "#000000" }],
          },
        },
      },
    ];

    expect(normalizeFortuneCellData(input)).toEqual([
      {
        r: 3,
        c: 0,
        v: {
          v: "产能利用率",
          m: "产能利用率",
          fc: "#000000",
          ff: "仿宋_GB2312",
          fs: 12,
          ct: { fa: "General", t: "s" },
        },
      },
    ]);
  });
});
