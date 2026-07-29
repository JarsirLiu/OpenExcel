import { describe, expect, it } from "vitest";
import { createSheetViewport, createVisibleCellViewport } from "./sheetViewport";

describe("sheet viewport", () => {
  it("anchors the chart layer to the cell area and subtracts logical scroll", () => {
    const state = createVisibleCellViewport(
      { left: 40, top: 80 },
      { left: 140, top: 220, width: 600, height: 400 },
      { left: 120, top: 380 },
    );
    const viewport = createSheetViewport(state, {
      left: state.cellOriginLeft,
      top: state.cellOriginTop,
    });

    expect(viewport.rectToViewport({ left: 200, top: 450, width: 240, height: 160 })).toEqual({
      left: 80,
      top: 70,
      width: 240,
      height: 160,
    });
    expect(viewport.left).toBe(100);
    expect(viewport.top).toBe(140);
    expect(viewport.width).toBe(600);
    expect(viewport.height).toBe(400);
  });
});
