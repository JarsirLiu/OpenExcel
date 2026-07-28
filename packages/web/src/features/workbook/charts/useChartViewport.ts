import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createSheetViewport, type SheetViewport } from "./sheetViewport";

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerRef: React.RefObject<HTMLDivElement | null>;
  sheetId: string;
};

type RawViewport = Omit<SheetViewport, "rectToViewport">;

const EMPTY_VIEWPORT: RawViewport = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  cellOriginLeft: 0,
  cellOriginTop: 0,
};

function rectRelativeTo(rect: DOMRect, parent: DOMRect) {
  return { left: rect.left - parent.left, top: rect.top - parent.top };
}

/**
 * Adapts FortuneSheet's DOM coordinates to the chart layer's local viewport.
 * FortuneSheet's container is the grid viewport; its canvas is the coordinate
 * origin used by the chart anchor geometry.
 */
export function useChartViewport({ containerRef, layerRef, sheetId }: Props): SheetViewport {
  const [viewport, setViewport] = useState<RawViewport>(EMPTY_VIEWPORT);

  const syncViewport = useCallback(() => {
    const root = containerRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;

    const sheetViewport = root.querySelector<HTMLElement>(".fortune-sheet-container");
    const cellCanvas = root.querySelector<HTMLElement>(".fortune-sheet-canvas");
    const offsetParent = layer.offsetParent as HTMLElement | null;
    if (!sheetViewport || !cellCanvas || !offsetParent) {
      layer.dataset.ready = "false";
      setViewport(EMPTY_VIEWPORT);
      return;
    }

    const parentRect = offsetParent.getBoundingClientRect();
    const sheetRect = sheetViewport.getBoundingClientRect();
    const cellRect = cellCanvas.getBoundingClientRect();
    const sheetOffset = rectRelativeTo(sheetRect, parentRect);
    const cellOffset = rectRelativeTo(cellRect, sheetRect);
    const next: RawViewport = {
      left: sheetOffset.left,
      top: sheetOffset.top,
      width: sheetRect.width,
      height: sheetRect.height,
      cellOriginLeft: cellOffset.left,
      cellOriginTop: cellOffset.top,
    };

    layer.style.left = `${next.left}px`;
    layer.style.top = `${next.top}px`;
    layer.style.width = `${next.width}px`;
    layer.style.height = `${next.height}px`;
    layer.dataset.ready = "true";
    setViewport((current) =>
      current.left === next.left &&
      current.top === next.top &&
      current.width === next.width &&
      current.height === next.height &&
      current.cellOriginLeft === next.cellOriginLeft &&
      current.cellOriginTop === next.cellOriginTop
        ? current
        : next,
    );
  }, [containerRef, layerRef]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;

    syncViewport();
    const frame = requestAnimationFrame(syncViewport);
    const parent = layer.parentElement ?? root;
    const observer = new MutationObserver(syncViewport);
    observer.observe(parent, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(root);
    const sheetViewport = root.querySelector<HTMLElement>(".fortune-sheet-container");
    const cellCanvas = root.querySelector<HTMLElement>(".fortune-sheet-canvas");
    if (sheetViewport) resizeObserver.observe(sheetViewport);
    if (cellCanvas) resizeObserver.observe(cellCanvas);
    window.addEventListener("resize", syncViewport);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncViewport);
      layer.dataset.ready = "false";
    };
  }, [containerRef, layerRef, sheetId, syncViewport]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const scrollbars = [
      root.querySelector<HTMLElement>(".luckysheet-scrollbar-x"),
      root.querySelector<HTMLElement>(".luckysheet-scrollbar-y"),
    ].filter((element): element is HTMLElement => element !== null);
    const handleScroll = () => syncViewport();
    for (const scrollbar of scrollbars) scrollbar.addEventListener("scroll", handleScroll);

    return () => {
      for (const scrollbar of scrollbars) scrollbar.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef, syncViewport]);

  return useMemo(
    () =>
      createSheetViewport(viewport, {
        left: viewport.cellOriginLeft,
        top: viewport.cellOriginTop,
      }),
    [viewport],
  );
}
