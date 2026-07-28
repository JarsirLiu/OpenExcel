import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePanelResize } from "./usePanelResize";

describe("usePanelResize", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("updates width during a drag and clamps to the minimum", () => {
    const { result } = renderHook(() =>
      usePanelResize({
        initialWidth: 320,
        minWidth: 240,
        edge: "left",
      }),
    );

    act(() => {
      result.current.handleMouseDown({
        preventDefault: vi.fn(),
        clientX: 500,
      } as unknown as React.MouseEvent);
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 440 }));
    });

    expect(result.current.width).toBe(380);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });

    expect(result.current.width).toBe(380);
  });
});
