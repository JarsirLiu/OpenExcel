import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("createApp", () => {
  let app: Awaited<ReturnType<typeof createApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns JSON 404 responses for unknown API paths with query strings", async () => {
    app = await createApp();

    const response = await app.inject({ method: "GET", url: "/api/unknown?format=json" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });
});
