import { describe, expect, it, vi } from "vitest";
import { closeFilterMenu } from "./fortuneSheetFilterMenu";

describe("closeFilterMenu", () => {
  it("dispatches an outside click for an open filter menu", () => {
    const root = document.createElement("div");
    const menu = document.createElement("div");
    menu.className = "fortune-filter-menu";
    root.append(menu);
    document.body.append(root);
    const handleMouseDown = vi.fn();
    document.addEventListener("mousedown", handleMouseDown);

    expect(closeFilterMenu(root)).toBe(true);

    expect(handleMouseDown).toHaveBeenCalledOnce();
    expect(handleMouseDown.mock.calls[0]?.[0]).toMatchObject({ target: root });
    document.removeEventListener("mousedown", handleMouseDown);
    root.remove();
  });

  it("does nothing when the filter menu is closed", () => {
    const root = document.createElement("div");

    expect(closeFilterMenu(root)).toBe(false);
  });
});
