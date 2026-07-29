import type { ChartRect } from "./chartAnchorGeometry";

export type ViewportBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ViewportRect = Pick<ViewportBounds, "left" | "top" | "width" | "height">;

export type ViewportScroll = {
  left: number;
  top: number;
};

export type SheetViewport = ViewportBounds & {
  cellOriginLeft: number;
  cellOriginTop: number;
  rectToViewport(rect: ChartRect): ChartRect;
};

export type SheetViewportState = Omit<SheetViewport, "rectToViewport">;

/** Maps FortuneSheet's visible cell area and logical scroll into layer coordinates. */
export function createVisibleCellViewport(
  parentRect: Pick<ViewportRect, "left" | "top">,
  cellRect: ViewportRect,
  scroll: ViewportScroll,
): SheetViewportState {
  return {
    left: cellRect.left - parentRect.left,
    top: cellRect.top - parentRect.top,
    width: cellRect.width,
    height: cellRect.height,
    cellOriginLeft: -scroll.left,
    cellOriginTop: -scroll.top,
  };
}

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
