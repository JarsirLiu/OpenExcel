import { describe, expect, it } from "vitest";
import { defaultDemoPlayback, resolveDemoPlayback } from "./replayPlayback";

describe("resolveDemoPlayback", () => {
  it("uses defaults when an example does not configure playback", () => {
    expect(resolveDemoPlayback()).toEqual(defaultDemoPlayback);
  });

  it("overrides only the configured delays", () => {
    expect(resolveDemoPlayback({ textTokenDelay: 8, toolResultDelay: 40 })).toEqual({
      ...defaultDemoPlayback,
      textTokenDelay: 8,
      toolResultDelay: 40,
    });
  });
});
