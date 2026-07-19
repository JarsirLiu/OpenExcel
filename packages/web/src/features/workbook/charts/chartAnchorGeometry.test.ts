import { describe, expect, it } from "vitest";
import { adaptFortuneSheetLayout } from "../layout/fortuneSheetLayout";
import { chartAnchorToRect, rectToChartAnchor } from "./chartAnchorGeometry";

const layout = adaptFortuneSheetLayout({
  columnWidths: { 0: 99, 1: 120 },
  config: { config: { rowlen: { 1: 30 } }, zoomRatio: 1 },
});

describe("chart anchor geometry", () => {
  it("uses FortuneSheet cell dimensions for one-cell anchors", () => {
    expect(
      chartAnchorToRect(
        {
          kind: "oneCell",
          from: { row: 1, col: 1 },
          widthEmu: 95_250,
          heightEmu: 190_500,
        },
        layout,
      ),
    ).toEqual({ left: 100, top: 20, width: 10, height: 20 });
  });

  it("round trips a moved and resized one-cell chart", () => {
    const anchor = rectToChartAnchor(
      { left: 101, top: 41, width: 300, height: 180 },
      layout,
      "oneCell",
    );
    expect(anchor).toEqual({
      kind: "oneCell",
      from: { row: 1, col: 1, offsetXEmu: 9_525, offsetYEmu: 200_025 },
      widthEmu: 2_857_500,
      heightEmu: 1_714_500,
    });
    expect(chartAnchorToRect(anchor, layout)).toEqual({
      left: 101,
      top: 41,
      width: 300,
      height: 180,
    });
  });

  it("preserves two-cell anchor semantics", () => {
    const anchor = rectToChartAnchor(
      { left: 73, top: 20, width: 220, height: 40 },
      layout,
      "twoCell",
    );
    expect(anchor).toEqual({
      kind: "twoCell",
      from: { row: 1, col: 0, offsetXEmu: 695_325, offsetYEmu: 0 },
      to: { row: 2, col: 2, offsetXEmu: 685_800, offsetYEmu: 85_725 },
    });
  });

  it("uses nested layout config without mutating the source", () => {
    const config = { config: { columnlen: { 0: 120 }, rowlen: { 1: 32 } } };
    const result = adaptFortuneSheetLayout({ config, columnWidths: { 0: 99 } });

    expect(result.columnWidths).toEqual({ 0: 120 });
    expect(result.rowHeights).toEqual({ 1: 32 });
    expect(config).toEqual({ config: { columnlen: { 0: 120 }, rowlen: { 1: 32 } } });
  });

  it("accounts for hidden axes and zoom in the standard layout", () => {
    const result = adaptFortuneSheetLayout({
      config: {
        columnlen: { 0: 100 },
        colhidden: { 0: 1 },
        zoomRatio: 1.5,
      },
    });

    expect(
      chartAnchorToRect(
        { kind: "oneCell", from: { row: 0, col: 1 }, widthEmu: 9_525, heightEmu: 9_525 },
        result,
      ),
    ).toEqual({
      left: 0,
      top: 0,
      width: 1.5,
      height: 1.5,
    });
  });
});
