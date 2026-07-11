import { describe, expect, it } from "vitest";
import { formatAIError } from "./formatAIError.js";

describe("formatAIError", () => {
  it("extracts a readable message from a nested retry error", () => {
    expect(
      formatAIError({
        message: "Failed after 3 attempts",
        lastError: { message: "Cannot connect to API: read ECONNRESET" },
      }),
    ).toBe("模型服务连接失败，请稍后重试");
  });

  it("extracts the provider message from a response body", () => {
    expect(
      formatAIError({
        statusCode: 429,
        responseBody: JSON.stringify({ error: { message: "rate limit exceeded" } }),
      }),
    ).toBe("模型服务请求过于频繁，请稍后重试");
  });

  it("does not include a stack trace", () => {
    const error = new Error("模型服务失败");
    error.stack = "Error: 模型服务失败\n    at internal/path.ts:1:1";

    expect(formatAIError(error)).toBe("模型服务失败");
  });
});
