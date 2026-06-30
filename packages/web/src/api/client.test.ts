import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchWorkbooks,
  fetchWorkbook,
  updateSheetData,
  createSheet,
  deleteSheet,
  fetchMessages,
  downloadTemplateUrl,
} from "./client";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchWorkbooks", () => {
  it("returns parsed workbooks on success", async () => {
    const data = [{ id: 1, name: "WB1", order: 1 }];
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    const result = await fetchWorkbooks();
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith("/api/workbooks");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(fetchWorkbooks()).rejects.toThrow("加载工作簿失败");
  });
});

describe("fetchWorkbook", () => {
  it("calls correct URL", async () => {
    const data = { id: 1, name: "WB1", sheets: [] };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    const result = await fetchWorkbook(1);
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith("/api/workbooks/1");
  });
});

describe("updateSheetData", () => {
  it("sends PATCH with celldata", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const data = [["a", "b"], ["c", "d"]];
    await updateSheetData(5, data);

    expect(mockFetch).toHaveBeenCalledWith("/api/sheets/5", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ celldata: data }),
    });
  });
});

describe("createSheet", () => {
  it("sends POST with sourceSheetId", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 10, name: "New", order: 2 }), { status: 200 }));

    const result = await createSheet(1, 3);
    expect(result.id).toBe(10);
    expect(mockFetch).toHaveBeenCalledWith("/api/workbooks/1/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceSheetId: 3 }),
    });
  });
});

describe("deleteSheet", () => {
  it("sends DELETE", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    await deleteSheet(7);
    expect(mockFetch).toHaveBeenCalledWith("/api/sheets/7", { method: "DELETE" });
  });
});

describe("fetchMessages", () => {
  it("returns parsed messages", async () => {
    const msgs = [{ id: "1", role: "user", content: "hi" }];
    mockFetch.mockResolvedValue(new Response(JSON.stringify(msgs), { status: 200 }));

    const result = await fetchMessages(3);
    expect(result).toEqual(msgs);
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions/3/messages");
  });
});

describe("downloadTemplateUrl", () => {
  it("returns correct URL", () => {
    expect(downloadTemplateUrl(4)).toBe("/api/workbooks/4/template");
  });
});
