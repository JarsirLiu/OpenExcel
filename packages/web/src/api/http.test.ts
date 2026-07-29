import { describe, expect, it } from "vitest";
import { readApiError } from "./http";

describe("readApiError", () => {
  it("reads a structured error code and parameters", async () => {
    const error = await readApiError(
      new Response(
        JSON.stringify({
          errorCode: "WORKBOOK_REVISION_CONFLICT",
          params: { sheetId: 7 },
        }),
        { status: 409 },
      ),
    );

    expect(error).toMatchObject({
      status: 409,
      errorCode: "WORKBOOK_REVISION_CONFLICT",
      params: { sheetId: 7 },
    });
  });

  it("keeps compatibility with the current string error envelope", async () => {
    const error = await readApiError(
      new Response(JSON.stringify({ error: "保存失败" }), { status: 500 }),
    );

    expect(error.message).toBe("保存失败");
    expect(error.errorCode).toBeUndefined();
  });
});
