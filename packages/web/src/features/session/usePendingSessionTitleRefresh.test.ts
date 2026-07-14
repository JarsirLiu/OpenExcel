import { describe, expect, it } from "vitest";
import { getTitleRefreshDelay } from "./usePendingSessionTitleRefresh";

describe("getTitleRefreshDelay", () => {
  it("uses the normal interval after a successful refresh", () => {
    expect(getTitleRefreshDelay(0)).toBe(2_000);
  });

  it("backs off title refresh failures and caps the delay", () => {
    expect(getTitleRefreshDelay(1)).toBe(3_000);
    expect(getTitleRefreshDelay(2)).toBe(6_000);
    expect(getTitleRefreshDelay(3)).toBe(12_000);
    expect(getTitleRefreshDelay(10)).toBe(12_000);
  });
});
