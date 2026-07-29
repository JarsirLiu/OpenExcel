import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChartViewport } from "./useChartViewport";

type FrameCallback = (time: number) => void;

class ResizeObserverStub {
  observe() {}

  disconnect() {}
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

describe("useChartViewport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("moves chart coordinates when the Sheet cell area scrolls", () => {
    const frames = new Map<number, FrameCallback>();
    let nextFrameId = 0;
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameCallback) => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));

    const root = document.createElement("div");
    const inner = document.createElement("div");
    const sheetContainer = document.createElement("div");
    const cellArea = document.createElement("div");
    const layer = document.createElement("div");
    sheetContainer.className = "fortune-sheet-container";
    cellArea.className = "fortune-cell-area";
    root.append(inner, sheetContainer, cellArea);
    inner.append(layer);
    document.body.append(root);
    Object.defineProperty(layer, "offsetParent", {
      configurable: true,
      get: () => inner,
    });
    vi.spyOn(inner, "getBoundingClientRect").mockReturnValue(rect(40, 80, 900, 600));
    vi.spyOn(sheetContainer, "getBoundingClientRect").mockReturnValue(rect(40, 80, 900, 600));
    vi.spyOn(cellArea, "getBoundingClientRect").mockReturnValue(rect(140, 220, 600, 400));

    const containerRef = { current: root };
    const layerRef = { current: layer };
    const { result, unmount } = renderHook(() =>
      useChartViewport({ containerRef, layerRef, sheetId: "sheet-1" }),
    );

    expect(result.current.rectToViewport({ left: 200, top: 450, width: 240, height: 160 })).toEqual(
      expect.objectContaining({ left: 200, top: 450 }),
    );
    expect(layer.dataset.ready).toBe("true");
    act(() => {
      for (const callback of frames.values()) callback(0);
      frames.clear();
    });

    cellArea.scrollLeft = 120;
    cellArea.scrollTop = 380;
    act(() => {
      cellArea.dispatchEvent(new Event("scroll"));
      expect(cellArea.scrollLeft).toBe(120);
      for (const callback of frames.values()) callback(0);
      frames.clear();
    });

    expect(result.current.rectToViewport({ left: 200, top: 450, width: 240, height: 160 })).toEqual(
      expect.objectContaining({ left: 80, top: 70 }),
    );
    expect(layer.style.left).toBe("100px");
    expect(layer.style.top).toBe("140px");

    unmount();
    root.remove();
  });
});
