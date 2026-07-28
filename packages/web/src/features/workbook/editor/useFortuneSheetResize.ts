import { useLayoutEffect } from "react";

type Props = {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled: boolean;
};

/**
 * FortuneSheet currently recalculates its canvas on window resize only.
 * Keep that library lifecycle detail at the editor boundary so panel layout
 * changes do not leak into workbook state or recreate the editor instance.
 */
export function useFortuneSheetResize({ containerRef, enabled }: Props) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container || typeof ResizeObserver === "undefined") return;

    let frame: number | null = null;
    let lastWidth = container.getBoundingClientRect().width;
    let lastHeight = container.getBoundingClientRect().height;

    const notify = () => {
      frame = null;
      const rect = container.getBoundingClientRect();
      if (rect.width === lastWidth && rect.height === lastHeight) return;
      lastWidth = rect.width;
      lastHeight = rect.height;
      window.dispatchEvent(new Event("resize"));
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(notify);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    schedule();

    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [containerRef, enabled]);
}
