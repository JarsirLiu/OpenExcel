import { describe, expect, it } from "vitest";
import { calculateFortuneSheetWheel, type FortuneSheetScrollable } from "./fortuneSheetWheel";

function createScrollable(overrides: Partial<FortuneSheetScrollable> = {}): FortuneSheetScrollable {
  return {
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 1000,
    scrollHeight: 2000,
    clientWidth: 500,
    clientHeight: 500,
    ...overrides,
  };
}

describe("applyFortuneSheetWheel", () => {
  it("moves down and then all the way back up", () => {
    const scrollable = createScrollable();

    const down = calculateFortuneSheetWheel(scrollable, {
      deltaX: 0,
      deltaY: 120,
      deltaMode: 0,
      shiftKey: false,
    });
    const afterDown = { ...scrollable, scrollTop: down.scrollTop, scrollLeft: down.scrollLeft };
    const up = calculateFortuneSheetWheel(afterDown, {
      deltaX: 0,
      deltaY: -120,
      deltaMode: 0,
      shiftKey: false,
    });
    const afterUp = { ...afterDown, scrollTop: up.scrollTop, scrollLeft: up.scrollLeft };
    const result = calculateFortuneSheetWheel(afterUp, {
      deltaX: 0,
      deltaY: -120,
      deltaMode: 0,
      shiftKey: false,
    });

    expect(result.handled).toBe(false);
    expect(result.scrollTop).toBe(0);
  });

  it("supports line-mode and shift-wheel horizontal scrolling", () => {
    const scrollable = createScrollable();

    const vertical = calculateFortuneSheetWheel(scrollable, {
      deltaX: 0,
      deltaY: 3,
      deltaMode: 1,
      shiftKey: false,
    });
    const result = calculateFortuneSheetWheel(
      { ...scrollable, scrollTop: vertical.scrollTop, scrollLeft: vertical.scrollLeft },
      {
        deltaX: 0,
        deltaY: 2,
        deltaMode: 1,
        shiftKey: true,
      },
    );

    expect(result.scrollTop).toBe(48);
    expect(result.scrollLeft).toBe(32);
    expect(scrollable.scrollTop).toBe(0);
  });

  it("clamps both axes to their valid ranges", () => {
    const scrollable = createScrollable({ scrollLeft: 490, scrollTop: 1490 });

    const result = calculateFortuneSheetWheel(scrollable, {
      deltaX: 1000,
      deltaY: 1000,
      deltaMode: 0,
      shiftKey: false,
    });

    expect(result.scrollLeft).toBe(500);
    expect(result.scrollTop).toBe(1500);
  });
});
