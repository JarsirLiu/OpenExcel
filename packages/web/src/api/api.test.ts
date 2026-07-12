import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMessages, fetchRuns, undoLatestRun } from "./chat";
import { fetchDocumentRange } from "./documents";
import { generateSessionTitle } from "./sessions";
import {
  createSheet,
  deleteSheet,
  downloadTemplateUrl,
  fetchWorkbook,
  fetchWorkbookReferenceCandidates,
  fetchWorkbooks,
} from "./workbooks";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchWorkbooks", () => {
  it("returns parsed workbooks on success", async () => {
    const data = [{ id: 1, name: "WB1", order: 1 }];
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    const result = await fetchWorkbooks(9);
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/workbooks", {});
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(fetchWorkbooks(9)).rejects.toThrow("加载工作簿失败");
  });
});

describe("fetchWorkbook", () => {
  it("calls correct URL", async () => {
    const data = { id: 1, name: "WB1", sheets: [] };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    const result = await fetchWorkbook(9, 1);
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/workbooks/1", {});
  });
});

describe("fetchDocumentRange", () => {
  it("loads only the requested canonical range", async () => {
    const data = {
      sheetId: 7,
      format: "openexcel-document-v1",
      version: 1,
      revision: 4,
      maxRow: 1000,
      maxColumn: 50,
      range: { startRow: 0, startCol: 0, endRow: 127, endCol: 63 },
      cells: [],
      objects: [],
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    const result = await fetchDocumentRange(9, 7, "A1:BL128");

    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workspaces/9/sheets/7/document/range?range=A1%3ABL128",
      {},
    );
  });
});

describe("fetchWorkbookReferenceCandidates", () => {
  it("calls correct URL", async () => {
    const data = [
      {
        id: 1,
        name: "WB1",
        sheets: [{ id: 11, sheetNo: 1, name: "Sheet1" }],
      },
    ];
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    const result = await fetchWorkbookReferenceCandidates(9);
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/workbooks/reference-candidates", {});
  });
});

describe("createSheet", () => {
  it("sends POST with sourceSheetId", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ workbookId: 1, id: 10, sheetNo: 4, name: "New", order: 2 }), {
        status: 200,
      }),
    );

    const result = await createSheet(9, 1, { sourceSheetId: 3 });
    expect(result.workbookId).toBe(1);
    expect(result.id).toBe(10);
    expect(result.sheetNo).toBe(4);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/workbooks/1/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceSheetId: 3 }),
    });
  });
});

describe("deleteSheet", () => {
  it("sends DELETE", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
    await deleteSheet(9, 3, 7);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/workbooks/3/sheets/7", {
      method: "DELETE",
    });
  });
});

describe("fetchMessages", () => {
  it("returns paginated messages", async () => {
    const msgs = [{ id: "1", role: "user", content: "hi" }];
    const body = { messages: msgs, total: 1 };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    const result = await fetchMessages(9, 3);
    expect(result).toEqual(body);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/workspaces/9/sessions/3/messages?limit=40&offset=0",
      {},
    );
  });
});

describe("fetchRuns", () => {
  it("returns parsed runs", async () => {
    const runs = [{ id: 7, status: "completed" }];
    mockFetch.mockResolvedValue(new Response(JSON.stringify(runs), { status: 200 }));

    const result = await fetchRuns(9, 3);
    expect(result).toEqual(runs);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/sessions/3/runs", {});
  });
});

describe("downloadTemplateUrl", () => {
  it("returns correct URL", () => {
    expect(downloadTemplateUrl(9, 4)).toBe("/api/workspaces/9/workbooks/4/template");
  });
});

describe("undoLatestRun", () => {
  it("posts undo request for latest run", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          runId: 8,
          restoredSheetIds: [1, 2],
          undoneUserText: "分析这些数据",
        }),
        { status: 200 },
      ),
    );

    const result = await undoLatestRun(9, 3);
    expect(result).toEqual({
      runId: 8,
      restoredSheetIds: [1, 2],
      undoneUserText: "分析这些数据",
    });
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/sessions/3/runs/undo-latest", {
      method: "POST",
    });
  });
});

describe("generateSessionTitle", () => {
  it("posts first user text to title endpoint", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ title: "数据分析" }), { status: 200 }),
    );

    const result = await generateSessionTitle(9, 3, "分析这些数据");
    expect(result).toEqual({ title: "数据分析" });
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/sessions/3/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstUserText: "分析这些数据" }),
    });
  });
});
