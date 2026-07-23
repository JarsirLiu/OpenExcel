import { describe, expect, it } from "vitest";
import { assertRunStatusTransition } from "./status.js";

describe("AgentRun status transitions", () => {
  it("allows a running run to finish as cancelled", () => {
    expect(() => assertRunStatusTransition("running", "cancelled")).not.toThrow();
  });

  it("rejects a terminal run changing back to running", () => {
    expect(() => assertRunStatusTransition("completed", "running")).toThrow(
      "非法的 AgentRun 状态转换",
    );
  });

  it("rejects legacy status values at the persistence boundary", () => {
    expect(() => assertRunStatusTransition("error", "failed")).toThrow("未知的 AgentRun 状态");
  });
});
