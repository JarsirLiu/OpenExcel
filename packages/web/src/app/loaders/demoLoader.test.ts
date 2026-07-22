import { describe, expect, it } from "vitest";
import { demoLoader } from "./demoLoader";

describe("demoLoader", () => {
  it("loads only the requested demo definition", async () => {
    const result = await demoLoader({ params: { demoId: "bank-transaction-audit" } });

    expect(result).toMatchObject({
      demo: { id: "bank-transaction-audit" },
    });
  });

  it("returns a 404 response for an unknown demo", async () => {
    await expect(
      demoLoader({ params: { demoId: "unknown-demo" } }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
