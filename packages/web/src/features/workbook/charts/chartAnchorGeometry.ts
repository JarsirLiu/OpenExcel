import type { ChartAnchor, ChartAnchorPoint, ChartSpec } from "@openexcel/core";
import type { SheetGridLayout } from "../layout/fortuneSheetLayout";

const EMU_PER_PIXEL = 9_525;
const MAX_AXIS_INDEX = 100_000;

export type ChartRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type { SheetGridLayout } from "../layout/fortuneSheetLayout";

type AxisPoint = {
  index: number;
  start: number;
  offset: number;
};

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function rawColumnWidth(layout: SheetGridLayout, index: number): number {
  return numberOr(layout.columnWidths[String(index)], layout.defaultColumnWidth);
}

function rawRowHeight(layout: SheetGridLayout, index: number): number {
  return numberOr(layout.rowHeights[String(index)], layout.defaultRowHeight);
}

function axisSize(layout: SheetGridLayout, axis: "column" | "row", index: number): number {
  const hidden = axis === "column" ? layout.hiddenColumns : layout.hiddenRows;
  if (hidden[String(index)] != null) return 0;

  const raw = axis === "column" ? rawColumnWidth(layout, index) : rawRowHeight(layout, index);
  return Math.round((raw + 1) * layout.zoomRatio);
}

function axisStart(layout: SheetGridLayout, axis: "column" | "row", index: number): number {
  let result = 0;
  for (let current = 0; current < index; current += 1) {
    result += axisSize(layout, axis, current);
  }
  return result;
}

function locateAxis(layout: SheetGridLayout, axis: "column" | "row", position: number): AxisPoint {
  const target = Math.max(0, position);
  let start = 0;

  for (let index = 0; index < MAX_AXIS_INDEX; index += 1) {
    const size = axisSize(layout, axis, index);
    if (size > 0 && target < start + size) {
      return { index, start, offset: target - start };
    }
    start += size;
  }

  const fallbackSize = axisSize(layout, axis, 0) || 1;
  const index = Math.floor(target / fallbackSize);
  return {
    index,
    start: index * fallbackSize,
    offset: target - index * fallbackSize,
  };
}

function emuToPixels(value: number, zoomRatio: number): number {
  return (value / EMU_PER_PIXEL) * zoomRatio;
}

function pixelsToEmu(value: number, zoomRatio: number): number {
  return Math.max(0, Math.round((value / zoomRatio) * EMU_PER_PIXEL));
}

function pointToPixels(layout: SheetGridLayout, point: ChartAnchorPoint): { x: number; y: number } {
  return {
    x:
      axisStart(layout, "column", point.col) + emuToPixels(point.offsetXEmu ?? 0, layout.zoomRatio),
    y: axisStart(layout, "row", point.row) + emuToPixels(point.offsetYEmu ?? 0, layout.zoomRatio),
  };
}

function pixelsToPoint(layout: SheetGridLayout, x: number, y: number): ChartAnchorPoint {
  const column = locateAxis(layout, "column", x);
  const row = locateAxis(layout, "row", y);
  return {
    col: column.index,
    row: row.index,
    offsetXEmu: pixelsToEmu(column.offset, layout.zoomRatio),
    offsetYEmu: pixelsToEmu(row.offset, layout.zoomRatio),
  };
}

export function chartAnchorToRect(anchor: ChartAnchor, layout: SheetGridLayout): ChartRect {
  if (anchor.kind === "absolute") {
    return {
      left: emuToPixels(anchor.xEmu, layout.zoomRatio),
      top: emuToPixels(anchor.yEmu, layout.zoomRatio),
      width: emuToPixels(anchor.widthEmu, layout.zoomRatio),
      height: emuToPixels(anchor.heightEmu, layout.zoomRatio),
    };
  }

  const from = pointToPixels(layout, anchor.from);
  if (anchor.kind === "oneCell") {
    return {
      left: from.x,
      top: from.y,
      width: emuToPixels(anchor.widthEmu, layout.zoomRatio),
      height: emuToPixels(anchor.heightEmu, layout.zoomRatio),
    };
  }

  const to = pointToPixels(layout, anchor.to);
  return {
    left: from.x,
    top: from.y,
    width: Math.max(1, to.x - from.x),
    height: Math.max(1, to.y - from.y),
  };
}

export function rectToChartAnchor(
  rect: ChartRect,
  layout: SheetGridLayout,
  kind: ChartAnchor["kind"],
): ChartAnchor {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);

  if (kind === "absolute") {
    return {
      kind,
      xEmu: pixelsToEmu(left, layout.zoomRatio),
      yEmu: pixelsToEmu(top, layout.zoomRatio),
      widthEmu: pixelsToEmu(width, layout.zoomRatio),
      heightEmu: pixelsToEmu(height, layout.zoomRatio),
    };
  }

  const from = pixelsToPoint(layout, left, top);
  if (kind === "oneCell") {
    return {
      kind,
      from,
      widthEmu: pixelsToEmu(width, layout.zoomRatio),
      heightEmu: pixelsToEmu(height, layout.zoomRatio),
    };
  }

  return {
    kind,
    from,
    to: pixelsToPoint(layout, left + width, top + height),
  };
}

export function chartRectEquals(left: ChartRect, right: ChartRect): boolean {
  return (
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  );
}

export function chartAnchorKind(chart: ChartSpec): ChartAnchor["kind"] {
  return chart.anchor.kind;
}
