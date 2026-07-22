import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "./AuthScreen";

class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe("AuthScreen", () => {
  beforeAll(() => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  it("scrolls to public cases without changing the route", () => {
    const scrollIntoView = vi.fn();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthScreen
          mode="login"
          submitting={false}
          error={null}
          onLogin={vi.fn()}
          onRegister={vi.fn()}
          onSwitchMode={vi.fn()}
          showMarketing
        />
      </MemoryRouter>,
    );
    const heading = screen.getByRole("heading", {
      name: /从原始表格.*到可以直接行动的结论/,
    });
    Object.defineProperty(heading, "scrollIntoView", { value: scrollIntoView });

    fireEvent.click(screen.getByRole("button", { name: "真实案例" }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(window.location.pathname).not.toBe("/login");
  });
});
