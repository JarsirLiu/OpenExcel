import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
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
 * FortuneSheet redraws its canvas when the custom scrollbars move instead of
 * moving the canvas element, so the logical scrollbar positions are part of
 * the chart coordinate conversion.
 */
export function useChartViewport({ containerRef, layerRef, sheetId }: Props): SheetViewport {
  const [viewport, setViewport] = useState<RawViewport>(EMPTY_VIEWPORT);

  const syncViewport = useCallback(() => {
    const root = containerRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;

    const sheetViewport = root.querySelector<HTMLElement>(".fortune-sheet-container");
    const cellArea = root.querySelector<HTMLElement>(".fortune-cell-area");
    const horizontalScrollbar = root.querySelector<HTMLElement>(".luckysheet-scrollbar-x");
    const verticalScrollbar = root.querySelector<HTMLElement>(".luckysheet-scrollbar-y");
    const offsetParent = layer.offsetParent as HTMLElement | null;
    if (!sheetViewport || !cellArea || !offsetParent) {
      layer.dataset.ready = "false";
      setViewport(EMPTY_VIEWPORT);
      return;
    }

    const parentRect = offsetParent.getBoundingClientRect();
    const cellRect = cellArea.getBoundingClientRect();
    const next = createVisibleCellViewport(parentRect, cellRect, {
      left: horizontalScrollbar?.scrollLeft ?? 0,
      top: verticalScrollbar?.scrollTop ?? 0,
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
    const cellArea = root.querySelector<HTMLElement>(".fortune-cell-area");
    if (sheetViewport) resizeObserver.observe(sheetViewport);
    if (cellArea) resizeObserver.observe(cellArea);
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
