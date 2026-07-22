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

  it("keeps public cases available without promotional navigation", () => {
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
      screen.getByRole("heading", {
        name: /让 AI 辅助您的数据分析和处理工作/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "真实案例" })).not.toBeInTheDocument();
    expect(window.location.pathname).not.toBe("/login");
  });
});
