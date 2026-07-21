import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MarketingShowcase } from "./MarketingShowcase";

class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

describe("MarketingShowcase", () => {
  beforeAll(() => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
  });

  it("renders all demos with links to their replay routes", () => {
    render(
      <MemoryRouter>
        <MarketingShowcase />
      </MemoryRouter>,
    );

    expect(screen.getAllByLabelText(/^观看.+完整回放$/)).toHaveLength(13);
    expect(screen.getByRole("link", { name: "观看学费住宿费欠费核查完整回放" })).toHaveAttribute(
      "href",
      "/demos/student-fee-reconciliation",
    );
    expect(screen.getByRole("link", { name: "观看科研经费预算执行分析完整回放" })).toHaveAttribute(
      "href",
      "/demos/research-fund-execution",
    );
    expect(screen.getByRole("link", { name: "观看企业财务健康分析完整回放" })).toHaveAttribute(
      "href",
      "/demos/financial-health-analysis",
    );
  });

  it("filters the case list without changing routes", () => {
    render(
      <MemoryRouter>
        <MarketingShowcase />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /教育/ }));
    expect(screen.getAllByLabelText(/^观看.+完整回放$/)).toHaveLength(1);
    expect(screen.getByRole("link", { name: "观看考试成绩分析完整回放" })).toHaveAttribute(
      "href",
      "/demos/exam-score-analysis",
    );
  });
});
