import type { FortuneCell } from "@openexcel/core";
import { describe, expect, it, vi } from "vitest";
import { rebaseSheetAfterConflict } from "./sheetConflictRebase";

const remoteCell: FortuneCell = { r: 0, c: 0, v: { v: 4, m: "4" } };

describe("rebaseSheetAfterConflict", () => {
  it("converts the remote response into a rebased editor snapshot", async () => {
    const loadRemote = vi.fn().mockResolvedValue({
      uploadedData: [remoteCell],
      config: null,
    });
    const rebasedSnapshot = {
      celldata: [{ r: 0, c: 0, v: { v: 5, m: "5" } }],
      config: null,
    };
    const rebase = vi.fn().mockReturnValue(rebasedSnapshot);

    await expect(rebaseSheetAfterConflict({ sheetId: 12, loadRemote, rebase })).resolves.toEqual({
      kind: "snapshot",
      sheetId: 12,
      snapshot: rebasedSnapshot,
    });
    expect(loadRemote).toHaveBeenCalledWith(12);
    expect(rebase).toHaveBeenCalledWith(12, {
      celldata: [remoteCell],
      config: null,
    });
  });

  it("returns no editor change when the coordinator cannot rebase", async () => {
    const rebase = vi.fn().mockReturnValue(null);

    await expect(
      rebaseSheetAfterConflict({
        sheetId: 12,
        loadRemote: vi.fn().mockResolvedValue({ config: null }),
        rebase,
      }),
    ).resolves.toBeNull();
    expect(rebase).toHaveBeenCalledWith(12, { celldata: [], config: null });
  });
});
