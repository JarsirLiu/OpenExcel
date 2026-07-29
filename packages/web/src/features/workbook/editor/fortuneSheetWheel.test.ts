import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { calculateFortuneSheetWheel, type FortuneSheetScrollable } from "./fortuneSheetWheel";
import { useFortuneSheetWheel } from "./useFortuneSheetWheel";

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

describe("useFortuneSheetWheel", () => {
  it("scrolls the Sheet when the pointer is over a chart layer", () => {
    const root = document.createElement("div");
    const sheetContainer = document.createElement("div");
    sheetContainer.className = "fortune-sheet-container";
    const horizontal = document.createElement("div");
    horizontal.className = "luckysheet-scrollbar-x";
    const vertical = document.createElement("div");
    vertical.className = "luckysheet-scrollbar-y";
    const chartLayer = document.createElement("div");
    chartLayer.dataset.sheetWheelOwner = "true";
    const chartCanvas = document.createElement("canvas");

    Object.defineProperties(horizontal, {
      clientWidth: { value: 500 },
      scrollWidth: { value: 1000 },
    });
    Object.defineProperties(vertical, {
      clientHeight: { value: 500 },
      scrollHeight: { value: 2000 },
    });
    sheetContainer.append(horizontal, vertical);
    chartLayer.append(chartCanvas);
    root.append(sheetContainer, chartLayer);

    const { unmount } = renderHook(() => useFortuneSheetWheel({ current: root }, true));
    const event = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
    chartCanvas.dispatchEvent(event);

    expect(vertical.scrollTop).toBe(120);
    expect(event.defaultPrevented).toBe(true);
    unmount();
  });

  it("does not hijack wheel events outside the Sheet and its floating layers", () => {
    const root = document.createElement("div");
    const toolbar = document.createElement("div");
    const sheetContainer = document.createElement("div");
    sheetContainer.className = "fortune-sheet-container";
    const horizontal = document.createElement("div");
    horizontal.className = "luckysheet-scrollbar-x";
    const vertical = document.createElement("div");
    vertical.className = "luckysheet-scrollbar-y";
    Object.defineProperties(horizontal, {
      clientWidth: { value: 500 },
      scrollWidth: { value: 1000 },
    });
    Object.defineProperties(vertical, {
      clientHeight: { value: 500 },
      scrollHeight: { value: 2000 },
    });
    sheetContainer.append(horizontal, vertical);
    root.append(toolbar, sheetContainer);

    const { unmount } = renderHook(() => useFortuneSheetWheel({ current: root }, true));
    const event = new WheelEvent("wheel", { deltaY: 120, cancelable: true });
    toolbar.dispatchEvent(event);

    expect(vertical.scrollTop).toBe(0);
    expect(event.defaultPrevented).toBe(false);
    unmount();
  });
});
