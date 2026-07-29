import type { ChartSpec } from "@openexcel/core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adaptFortuneSheetLayout } from "../layout/fortuneSheetLayout";
import { useChartOverlayInteraction } from "./useChartOverlayInteraction";

const chart: ChartSpec = {
  id: "chart-1",
  workbookId: "workbook-1",
  sheetId: "sheet-1",
  type: "line",
  anchor: { kind: "absolute", xEmu: 0, yEmu: 0, widthEmu: 3_000_000, heightEmu: 2_000_000 },
  series: [],
};

const layout = adaptFortuneSheetLayout({});

describe("useChartOverlayInteraction", () => {
  it("keeps chart pointer interaction out of Sheet event handling", () => {
    const { result } = renderHook(() =>
      useChartOverlayInteraction({
        activeSheetId: "sheet-1",
        charts: [chart],
        layout,
        workspaceId: null,
      }),
    );
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const setPointerCapture = vi.fn();
    const pointerDown = {
      clientX: 100,
      clientY: 120,
      pointerId: 1,
      preventDefault,
      stopPropagation,
      currentTarget: { setPointerCapture },
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.beginInteraction(pointerDown, chart.id, "move", {
        left: 100,
        top: 120,
        width: 320,
        height: 200,
      });
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(setPointerCapture).toHaveBeenCalledWith(1);

    const pointerMove = new Event("pointermove", { cancelable: true });
    Object.defineProperties(pointerMove, { clientX: { value: 140 }, clientY: { value: 150 } });
    window.dispatchEvent(pointerMove);

    expect(pointerMove.defaultPrevented).toBe(true);
  });
});
