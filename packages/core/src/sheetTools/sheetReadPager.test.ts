import { describe, expect, it } from "vitest";
import { parseSheetToolRange } from "./sheetDataProjection.js";
import { planSheetReadPage, type SheetReadContinuation } from "./sheetReadPager.js";

describe("planSheetReadPage", () => {
  it("pages a narrow range by complete rows", () => {
    const requestedRange = parseSheetToolRange("A1:C10");
    const page = planSheetReadPage(requestedRange, 6);

    expect(page.range).toEqual(parseSheetToolRange("A1:C2"));
    expect(page.continuation).toEqual({ requestedRange, nextRow: 3, nextCol: 1 });
  });

  it("pages a wide range by column blocks within each row", () => {
    const requestedRange = parseSheetToolRange("A1:H2");
    const first = planSheetReadPage(requestedRange, 4);
    const second = planSheetReadPage(
      requestedRange,
      4,
      first.continuation as SheetReadContinuation,
    );
    const third = planSheetReadPage(
      requestedRange,
      4,
      second.continuation as SheetReadContinuation,
    );

    expect(first.range).toEqual(parseSheetToolRange("A1:D1"));
    expect(second.range).toEqual(parseSheetToolRange("E1:H1"));
    expect(third.range).toEqual(parseSheetToolRange("A2:D2"));
  });

  it("does not duplicate or skip cells when both dimensions exceed the budget", () => {
    const requestedRange = parseSheetToolRange("A1:F6");
    const ranges: string[] = [];
    let continuation: SheetReadContinuation | undefined;

    for (;;) {
      const page = planSheetReadPage(requestedRange, 4, continuation);
      ranges.push(JSON.stringify(page.range));
      if (!page.continuation) break;
      continuation = page.continuation;
    }

    expect(ranges).toHaveLength(12);
    expect(new Set(ranges)).toHaveLength(12);
    expect(ranges.at(-1)).toBe(JSON.stringify(parseSheetToolRange("E6:F6")));
  });
});
