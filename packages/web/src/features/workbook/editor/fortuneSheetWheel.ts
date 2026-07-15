export type FortuneSheetScrollable = {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
};

export type FortuneSheetWheelInput = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  shiftKey: boolean;
};

export type FortuneSheetWheelResult = {
  handled: boolean;
  scrollLeft: number;
  scrollTop: number;
};

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const LINE_HEIGHT = 16;

function toPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === DOM_DELTA_LINE) return delta * LINE_HEIGHT;
  if (deltaMode === DOM_DELTA_PAGE) return delta * pageSize;
  return delta;
}

function clampScrollPosition(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

/**
 * Apply native-style wheel movement to Fortune Sheet's hidden scrollbars.
 * Fortune Sheet 1.0.4 uses an off-by-one row calculation for reverse wheel input.
 */
export function calculateFortuneSheetWheel(
  scrollable: FortuneSheetScrollable,
  input: FortuneSheetWheelInput,
): FortuneSheetWheelResult {
  if (input.deltaX === 0 && input.deltaY === 0) {
    return { handled: false, scrollLeft: scrollable.scrollLeft, scrollTop: scrollable.scrollTop };
  }

  const horizontalDelta = toPixels(input.deltaX, input.deltaMode, scrollable.clientWidth);
  const verticalDelta = toPixels(input.deltaY, input.deltaMode, scrollable.clientHeight);
  const shouldUseHorizontalWheel = input.shiftKey && verticalDelta !== 0 && horizontalDelta === 0;
  const nextHorizontalDelta = shouldUseHorizontalWheel ? verticalDelta : horizontalDelta;
  const nextVerticalDelta = shouldUseHorizontalWheel ? 0 : verticalDelta;
  const nextScrollLeft = clampScrollPosition(
    scrollable.scrollLeft + nextHorizontalDelta,
    scrollable.scrollWidth - scrollable.clientWidth,
  );
  const nextScrollTop = clampScrollPosition(
    scrollable.scrollTop + nextVerticalDelta,
    scrollable.scrollHeight - scrollable.clientHeight,
  );

  if (nextScrollLeft === scrollable.scrollLeft && nextScrollTop === scrollable.scrollTop) {
    return {
      handled: false,
      scrollLeft: scrollable.scrollLeft,
      scrollTop: scrollable.scrollTop,
    };
  }

  return { handled: true, scrollLeft: nextScrollLeft, scrollTop: nextScrollTop };
}
