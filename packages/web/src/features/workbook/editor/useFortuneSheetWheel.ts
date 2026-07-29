import { type RefObject, useEffect } from "react";
import { calculateFortuneSheetWheel } from "./fortuneSheetWheel";

const SHEET_CONTAINER_SELECTOR = ".fortune-sheet-container";
const SHEET_FLOATING_LAYER_SELECTOR = '[data-sheet-wheel-owner="true"]';
const HORIZONTAL_SCROLLBAR_SELECTOR = ".luckysheet-scrollbar-x";
const VERTICAL_SCROLLBAR_SELECTOR = ".luckysheet-scrollbar-y";
const SCROLLBAR_SELECTOR = `${HORIZONTAL_SCROLLBAR_SELECTOR},${VERTICAL_SCROLLBAR_SELECTOR}`;

function isElement(value: EventTarget | null): value is Element {
  return value instanceof Element;
}

function getScrollbars(sheetContainer: Element) {
  return {
    horizontal: sheetContainer.querySelector<HTMLElement>(HORIZONTAL_SCROLLBAR_SELECTOR),
    vertical: sheetContainer.querySelector<HTMLElement>(VERTICAL_SCROLLBAR_SELECTOR),
  };
}

function isSheetWheelTarget(root: HTMLElement, target: EventTarget | null): boolean {
  if (!isElement(target)) return false;

  const sheetContainer = target.closest(SHEET_CONTAINER_SELECTOR);
  if (sheetContainer && root.contains(sheetContainer)) return true;

  const floatingLayer = target.closest(SHEET_FLOATING_LAYER_SELECTOR);
  return floatingLayer !== null && root.contains(floatingLayer);
}

/**
 * Keep wheel behavior local to the grid and bypass Fortune Sheet's broken reverse-wheel path.
 */
export function useFortuneSheetWheel(rootRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (!isElement(event.target)) return;

      // Let the browser scroll the custom scrollbar itself when it is the target.
      if (event.target.closest(SCROLLBAR_SELECTOR)) {
        event.stopPropagation();
        return;
      }

      if (!isSheetWheelTarget(root, event.target)) return;

      const sheetContainer = root.querySelector<HTMLElement>(SHEET_CONTAINER_SELECTOR);
      if (!sheetContainer) return;

      const { horizontal, vertical } = getScrollbars(sheetContainer);
      if (!horizontal || !vertical) return;

      const result = calculateFortuneSheetWheel(
        {
          scrollLeft: horizontal.scrollLeft,
          scrollTop: vertical.scrollTop,
          scrollWidth: horizontal.scrollWidth,
          scrollHeight: vertical.scrollHeight,
          clientWidth: horizontal.clientWidth,
          clientHeight: vertical.clientHeight,
        },
        event,
      );

      if (!result.handled) return;
      horizontal.scrollLeft = result.scrollLeft;
      vertical.scrollTop = result.scrollTop;
      event.preventDefault();
      event.stopPropagation();
    };

    root.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => root.removeEventListener("wheel", handleWheel, true);
  }, [enabled, rootRef]);
}
