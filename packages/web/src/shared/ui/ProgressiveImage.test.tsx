import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressiveImage } from "./ProgressiveImage";

describe("ProgressiveImage", () => {
  let triggerIntersection: (() => void) | undefined;

  class IntersectionObserverMock {
    constructor(callback: IntersectionObserverCallback) {
      triggerIntersection = () =>
        callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
    }

    observe = vi.fn();
    disconnect = vi.fn();
  }

  beforeEach(() => {
    triggerIntersection = undefined;
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defers the image request until it approaches the viewport", () => {
    render(<ProgressiveImage src="/demo-covers/example.webp" alt="案例封面" />);

    const image = screen.getByRole("img", { name: "案例封面" });
    expect(image).not.toHaveAttribute("src");

    act(() => triggerIntersection?.());

    expect(image).toHaveAttribute("src", "/demo-covers/example.webp");
  });

  it("loads priority images immediately", () => {
    render(<ProgressiveImage src="/demo-covers/example.webp" alt="首屏案例封面" priority />);

    expect(screen.getByRole("img", { name: "首屏案例封面" })).toHaveAttribute(
      "src",
      "/demo-covers/example.webp",
    );
  });
});
