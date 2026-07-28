import type { ChartRect } from "./chartAnchorGeometry";

export type ViewportBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SheetViewport = ViewportBounds & {
  cellOriginLeft: number;
  cellOriginTop: number;
  rectToViewport(rect: ChartRect): ChartRect;
};

export function createSheetViewport(
  bounds: ViewportBounds,
  cellOrigin: { left: number; top: number },
): SheetViewport {
  return {
    ...bounds,
    cellOriginLeft: cellOrigin.left,
    cellOriginTop: cellOrigin.top,
    rectToViewport: (rect) => ({
      ...rect,
      left: cellOrigin.left + rect.left,
      top: cellOrigin.top + rect.top,
    }),
  };
}
