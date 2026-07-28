import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbookFull } from "@/api/workbooks";
import { findSheetIndexById } from "../sheetIdentity";
import { useFortuneSheetActiveSheet } from "./useFortuneSheetActiveSheet";

function createWorkbook(): WorkbookFull {
  const sheet = (id: number, name: string, sheetNo: number) => ({
    id,
    sheetNo,
    name,
    order: sheetNo - 1,
    columns: [],
    merges: [],
    uploadedData: null,
    config: null,
    revision: 0,
  });

  return {
    id: 1,
    publicId: "workbook-1",
    name: "Workbook",
    sheets: [sheet(101, "Sheet1", 1), sheet(202, "Sheet2", 2)],
    charts: [],
  };
}

describe("FortuneSheet active sheet synchronization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps the FortuneSheet active sheet ID back to the workbook index", () => {
    expect(findSheetIndexById([{ id: 101 }, { id: 202 }], "202")).toBe(1);
  });

  it("updates the external index when FortuneSheet changes the active tab", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div id="fortune-sheettab-container">
        <div class="luckysheet-sheets-item luckysheet-sheets-item-active">
          <span class="luckysheet-sheets-item-name">Sheet1</span>
        </div>
        <div class="luckysheet-sheets-item">
          <span class="luckysheet-sheets-item-name">Sheet2</span>
        </div>
      </div>
    `;

    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const containerRef = { current: root };
    const onSheetIndexChange = vi.fn();
    const workbook = createWorkbook();
    const { unmount } = renderHook(() =>
      useFortuneSheetActiveSheet({
        containerRef,
        workbook,
        currentSheetIndex: 0,
        onSheetIndexChange,
      }),
    );

    act(() => animationFrames.at(-1)?.(0));

    const tabs = root.querySelectorAll<HTMLElement>(".luckysheet-sheets-item");
    act(() => {
      tabs[0]?.classList.remove("luckysheet-sheets-item-active");
      tabs[1]?.classList.add("luckysheet-sheets-item-active");
    });

    await act(async () => {
      await Promise.resolve();
    });
    act(() => animationFrames.at(-1)?.(0));

    expect(onSheetIndexChange).toHaveBeenCalledWith(1);
    unmount();
  });
});
