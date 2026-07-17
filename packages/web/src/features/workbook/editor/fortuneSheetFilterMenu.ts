import { type RefObject, useEffect } from "react";

const FILTER_MENU_SELECTOR = ".fortune-filter-menu";
const HORIZONTAL_SCROLLBAR_SELECTOR = ".luckysheet-scrollbar-x";

export function closeFilterMenu(root: HTMLElement): boolean {
  if (!root.querySelector(FILTER_MENU_SELECTOR)) return false;

  // Fortune Sheet's filter menu closes through its document-level outside-click handler.
  root.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  return true;
}

/**
 * Fortune Sheet treats the filter menu as a temporary anchored overlay.
 * Close it when horizontal scrolling changes that anchor's visible position.
 */
export function useFortuneSheetFilterMenu(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    const subscriptions = new Map<HTMLElement, () => void>();

    const subscribe = (scrollbar: HTMLElement) => {
      if (subscriptions.has(scrollbar)) return;

      let previousScrollLeft = scrollbar.scrollLeft;
      const handleScroll = () => {
        const scrollDelta = scrollbar.scrollLeft - previousScrollLeft;
        previousScrollLeft = scrollbar.scrollLeft;
        if (scrollDelta !== 0) closeFilterMenu(root);
      };

      scrollbar.addEventListener("scroll", handleScroll);
      subscriptions.set(scrollbar, () => scrollbar.removeEventListener("scroll", handleScroll));
    };

    const syncSubscriptions = () => {
      root.querySelectorAll<HTMLElement>(HORIZONTAL_SCROLLBAR_SELECTOR).forEach(subscribe);

      for (const [scrollbar, unsubscribe] of subscriptions) {
        if (!root.contains(scrollbar)) {
          unsubscribe();
          subscriptions.delete(scrollbar);
        }
      }
    };

    syncSubscriptions();
    const observer = new MutationObserver(syncSubscriptions);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      for (const unsubscribe of subscriptions.values()) unsubscribe();
    };
  }, [enabled, rootRef]);
}
