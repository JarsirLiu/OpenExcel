import { describe, expect, it } from "vitest";
import { getInternalReturnTo, routePaths } from "./routePaths";

describe("getInternalReturnTo", () => {
  it("accepts an internal path with its query and hash", () => {
    expect(getInternalReturnTo("/workspaces/ws_existing?tab=chat#messages")).toBe(
      "/workspaces/ws_existing?tab=chat#messages",
    );
  });

  it("rejects external and backslash-normalized destinations", () => {
    expect(getInternalReturnTo("https://attacker.example")).toBeNull();
    expect(getInternalReturnTo("//attacker.example")).toBeNull();
    expect(getInternalReturnTo("/\\\\attacker.example")).toBeNull();
  });

  it("does not return users to authentication routes", () => {
    expect(getInternalReturnTo(routePaths.login)).toBeNull();
    expect(getInternalReturnTo(`${routePaths.register}?returnTo=/`)).toBeNull();
  });
});
