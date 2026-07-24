import { useCallback, useEffect, useLayoutEffect, useState } from "react";

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  layerRef: React.RefObject<HTMLDivElement | null>;
  sheetId: string;
};

type ScrollPosition = {
  left: number;
  top: number;
};

/** Positions the independent chart layer over FortuneSheet's rendered sheet area. */
export function useChartViewport({ containerRef, layerRef, sheetId }: Props): ScrollPosition {
  const [scroll, setScroll] = useState<ScrollPosition>({ left: 0, top: 0 });

  const notifyLayoutChange = useCallback(() => {
    const root = containerRef.current;
    const next = {
      left: root?.querySelector<HTMLElement>(".luckysheet-scrollbar-x")?.scrollLeft ?? 0,
      top: root?.querySelector<HTMLElement>(".luckysheet-scrollbar-y")?.scrollTop ?? 0,
    };
    setScroll((current) =>
      current.left === next.left && current.top === next.top ? current : next,
    );
  }, [containerRef]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return;

    const syncViewport = () => {
      const sheet = root.querySelector<HTMLElement>(".fortune-sheet-container");
      const offsetParent = layer.offsetParent as HTMLElement | null;
      if (!sheet || !offsetParent) {
        layer.dataset.ready = "false";
        return;
      }

      const sheetRect = sheet.getBoundingClientRect();
      const parentRect = offsetParent.getBoundingClientRect();
      layer.style.left = `${sheetRect.left - parentRect.left}px`;
      layer.style.top = `${sheetRect.top - parentRect.top}px`;
      layer.style.width = `${sheetRect.width}px`;
      layer.style.height = `${sheetRect.height}px`;
      layer.dataset.ready = "true";
      notifyLayoutChange();
    };

    syncViewport();
    const frame = requestAnimationFrame(syncViewport);
    const parent = layer.parentElement ?? root;
    const observer = new MutationObserver(syncViewport);
    observer.observe(parent, { childList: true });
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(root);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      layer.dataset.ready = "false";
    };
  }, [containerRef, layerRef, notifyLayoutChange, sheetId]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const horizontal = root.querySelector<HTMLElement>(".luckysheet-scrollbar-x");
    const vertical = root.querySelector<HTMLElement>(".luckysheet-scrollbar-y");
    const handleScroll = () => notifyLayoutChange();
    horizontal?.addEventListener("scroll", handleScroll);
    vertical?.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);

    return () => {
      horizontal?.removeEventListener("scroll", handleScroll);
      vertical?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [containerRef, notifyLayoutChange]);

  return scroll;
}
