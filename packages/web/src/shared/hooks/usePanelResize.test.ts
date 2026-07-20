import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePanelResize } from "./usePanelResize";

describe("usePanelResize", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("applies width during drag and settles once after mouseup", () => {
    const appliedWidths: number[] = [];
    const onResizeSettled = vi.fn();
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const { result } = renderHook(() =>
      usePanelResize({
        initialWidth: 320,
        minWidth: 240,
        edge: "left",
        applyWidth: (width) => appliedWidths.push(width),
        onResizeSettled,
      }),
    );

    act(() => {
      result.current.handleMouseDown({
        preventDefault: vi.fn(),
        clientX: 500,
      } as unknown as React.MouseEvent);
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 440 }));
    });

    expect(appliedWidths).toEqual([380]);
    expect(onResizeSettled).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(onResizeSettled).not.toHaveBeenCalled();
    expect(animationFrames).toHaveLength(1);

    act(() => {
      animationFrames[0](0);
    });

    expect(result.current.width).toBe(380);
    expect(onResizeSettled).toHaveBeenCalledOnce();
  });
});
