import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createSheetViewport,
  createVisibleCellViewport,
  type SheetViewport,
  type SheetViewportState,
} from "./sheetViewport";

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerRef: React.RefObject<HTMLDivElement | null>;
  sheetId: string;
};

type RawViewport = SheetViewportState;

const EMPTY_VIEWPORT: RawViewport = {
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  cellOriginLeft: 0,
  cellOriginTop: 0,
};

/**
 * Adapts FortuneSheet's content coordinates to the visible cell viewport.
 * FortuneSheet redraws its canvas when the custom scrollbars move and mirrors
 * the resulting position to the cell area. The cell area is therefore the
 * single scroll-coordinate source for charts.
 */
export function useChartViewport({ containerRef, layerRef, sheetId }: Props): SheetViewport {
  const [viewport, setViewport] = useState<RawViewport>(EMPTY_VIEWPORT);
  const syncFrameRef = useRef<number | null>(null);

  const syncViewport = useCallback(() => {
    const root = containerRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;

    const sheetViewport = root.querySelector<HTMLElement>(".fortune-sheet-container");
    const cellArea = root.querySelector<HTMLElement>(".fortune-cell-area");
    const offsetParent = layer.offsetParent as HTMLElement | null;
    if (!sheetViewport || !cellArea || !offsetParent) {
      layer.dataset.ready = "false";
      setViewport(EMPTY_VIEWPORT);
      return;
    }

    const parentRect = offsetParent.getBoundingClientRect();
    const cellRect = cellArea.getBoundingClientRect();
    const next = createVisibleCellViewport(parentRect, cellRect, {
      left: cellArea.scrollLeft,
      top: cellArea.scrollTop,
    });

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

  const scheduleViewportSync = useCallback(() => {
    if (syncFrameRef.current !== null) return;
    syncFrameRef.current = requestAnimationFrame(() => {
      syncFrameRef.current = null;
      syncViewport();
    });
  }, [syncViewport]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;

    syncViewport();
    syncFrameRef.current = requestAnimationFrame(() => {
      syncFrameRef.current = null;
      syncViewport();
    });
    const parent = layer.parentElement ?? root;
    const observer = new MutationObserver(syncViewport);
    observer.observe(parent, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(root);
    const sheetViewport = root.querySelector<HTMLElement>(".fortune-sheet-container");
    const cellArea = root.querySelector<HTMLElement>(".fortune-cell-area");
    if (sheetViewport) resizeObserver.observe(sheetViewport);
    if (cellArea) resizeObserver.observe(cellArea);
    window.addEventListener("resize", syncViewport);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      if (syncFrameRef.current !== null) {
        cancelAnimationFrame(syncFrameRef.current);
        syncFrameRef.current = null;
      }
      window.removeEventListener("resize", syncViewport);
      layer.dataset.ready = "false";
    };
  }, [containerRef, layerRef, sheetId, syncViewport]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const handleScroll = () => scheduleViewportSync();
    // FortuneSheet creates and replaces its custom scrollbars asynchronously.
    // Capture the event on the stable root so the binding survives that DOM lifecycle.
    root.addEventListener("scroll", handleScroll, true);

    return () => {
      root.removeEventListener("scroll", handleScroll, true);
    };
  }, [containerRef, scheduleViewportSync]);

  return useMemo(
    () =>
      createSheetViewport(viewport, {
        left: viewport.cellOriginLeft,
        top: viewport.cellOriginTop,
      }),
    [viewport],
  );
}
