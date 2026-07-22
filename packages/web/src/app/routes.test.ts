import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";

function matchedPaths(pathname: string) {
  return matchRoutes(routes, pathname)?.map(({ route }) => route.path ?? "index") ?? [];
}

describe("application routes", () => {
  it("matches the demo catalog and detail routes", () => {
    expect(matchedPaths("/demos")).toContain("demos");
    expect(matchedPaths("/demos/bank-transaction-audit")).toContain(":demoId");
  });

  it("keeps the singular demo URL as a compatibility redirect", () => {
    expect(matchedPaths("/demo")).toContain("demo");
    expect(matchedPaths("/demo/bank-transaction-audit")).toContain(":demoId");
  });
});
