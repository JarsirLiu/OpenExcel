import { render, screen } from "@testing-library/react";
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

  it("renders the login screen without promotional navigation", () => {
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
    expect(
      screen.getByRole("heading", { name: "AI 操控 Excel，表格工作事半功倍" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "真实案例" })).not.toBeInTheDocument();
    expect(window.location.pathname).not.toBe("/login");
  });
});
