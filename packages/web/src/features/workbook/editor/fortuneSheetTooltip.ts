import { type RefObject, useEffect } from "react";

const TOOLBAR_ITEM_SELECTOR = ".fortune-toolbar-button, .fortune-toolbar-combo";
const TOOLTIP_SELECTOR = ".fortune-tooltip";
const VIEWPORT_PADDING = 8;

interface TooltipRect {
  left: number;
  right: number;
}

export function calculateTooltipShiftX(
  rect: TooltipRect,
  viewportWidth: number,
  padding = VIEWPORT_PADDING,
): number {
  if (rect.left < padding) return padding - rect.left;
  if (rect.right > viewportWidth - padding) return viewportWidth - padding - rect.right;
  return 0;
}

function alignTooltip(tooltip: HTMLElement): void {
  const rect = tooltip.getBoundingClientRect();
  const shiftX = calculateTooltipShiftX(rect, window.innerWidth);
  tooltip.style.setProperty("--fortune-tooltip-shift-x", `${shiftX}px`);
}

/** Keep FortuneSheet tooltips visible when the toolbar reaches a viewport edge. */
export function useFortuneSheetTooltip(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    const alignItemTooltip = (item: Element) => {
      const tooltip = item.querySelector<HTMLElement>(TOOLTIP_SELECTOR);
      if (tooltip) alignTooltip(tooltip);
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const item = event.target.closest(TOOLBAR_ITEM_SELECTOR);
      if (item && root.contains(item)) alignItemTooltip(item);
    };

    const handleResize = () => {
      root.querySelectorAll(TOOLBAR_ITEM_SELECTOR).forEach(alignItemTooltip);
    };

    root.addEventListener("pointerover", handlePointerOver);
    window.addEventListener("resize", handleResize);
    return () => {
      root.removeEventListener("pointerover", handlePointerOver);
      window.removeEventListener("resize", handleResize);
    };
  }, [enabled, rootRef]);
}
