import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelRun, fetchMessages, undoLatestRun } from "./chat";
import { generateSessionTitle } from "./sessions";
import {
  createSheet,
  deleteSheet,
  downloadTemplateUrl,
  executeSheetCommand,
  fetchSheet,
  fetchWorkbook,
  fetchWorkbookForEditor,
  fetchWorkbookReferenceCandidates,
  fetchWorkbookStructure,
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
    const data = { id: 1, name: "WB1", sheets: [], charts: [] };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    const result = await fetchWorkbook(9, 1);
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/workbooks/1", {});
  });
});

describe("fetchWorkbookStructure", () => {
  it("loads structure without using the full workbook endpoint", async () => {
    const data = {
      id: 1,
      publicId: "wb_1",
      name: "WB1",
      sheets: [{ id: 11, sheetNo: 1, name: "Sheet1", order: 0, revision: 2 }],
      charts: [],
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    await expect(fetchWorkbookStructure(9, 1)).resolves.toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/workbooks/1/structure", {});
  });
});

describe("fetchSheet", () => {
  it("marks the response as loaded", async () => {
    const data = {
      id: 11,
      sheetNo: 1,
      name: "Sheet1",
      order: 0,
      columns: [],
      merges: [],
      uploadedData: [],
      config: null,
      revision: 2,
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));

    await expect(fetchSheet(9, 11)).resolves.toMatchObject({ ...data, loaded: true });
  });
});

describe("fetchWorkbookForEditor", () => {
  it("combines structure with only the requested Sheet data", async () => {
    const structure = {
      id: 1,
      publicId: "wb_1",
      name: "WB1",
      sheets: [
        { id: 11, sheetNo: 1, name: "Sheet1", order: 0, revision: 2 },
        { id: 12, sheetNo: 2, name: "Sheet2", order: 1, revision: 3 },
      ],
      charts: [],
    };
    const sheet = {
      id: 12,
      sheetNo: 2,
      name: "Sheet2",
      order: 1,
      columns: [],
      merges: [],
      uploadedData: [{ r: 0, c: 0, v: { v: "loaded" } }],
      config: null,
      revision: 3,
    };
    mockFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(structure), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(sheet), { status: 200 }));

    const result = await fetchWorkbookForEditor(9, 1, { sheetIds: [12] });

    expect(result.sheets[0]?.loaded).toBe(false);
    expect(result.sheets[0]?.uploadedData).toBeNull();
    expect(result.sheets[1]).toMatchObject({ loaded: true, uploadedData: sheet.uploadedData });
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

describe("executeSheetCommand", () => {
  it("sends the unified replaceSnapshot command", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ revision: 1 }), { status: 200 }));

    const command = {
      kind: "replaceSnapshot" as const,
      mutationId: "web-test-1",
      sheetId: 5,
      baseRevision: 0,
      snapshot: { celldata: [], config: null },
    };
    await executeSheetCommand(9, command);

    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/sheets/5", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
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

describe("cancelRun", () => {
  it("posts an explicit cancellation request", async () => {
    const result = { runId: 7, status: "running", cancelRequested: true };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));

    await expect(cancelRun(9, 3, 7)).resolves.toEqual(result);
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/sessions/3/runs/7/cancel", {
      method: "POST",
    });
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
  it("posts to the title endpoint without duplicating chat input", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ title: "数据分析" }), { status: 200 }),
    );

    const result = await generateSessionTitle(9, 3);
    expect(result).toEqual({ title: "数据分析" });
    expect(mockFetch).toHaveBeenCalledWith("/api/workspaces/9/sessions/3/title", {
      method: "POST",
    });
  });
});
