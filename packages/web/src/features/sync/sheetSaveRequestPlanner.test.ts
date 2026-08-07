import { describe, expect, it } from "vitest";
import { planSheetSaveRequest } from "./sheetSaveRequestPlanner";

const emptyChangeSet = {
  valueChanges: [],
  formulaCacheChanges: [],
  formatChanges: [],
  configChanges: [],
};

describe("planSheetSaveRequest", () => {
  it("plans a sparse ChangeSet request without changing its contents", () => {
    const changeSet = {
      ...emptyChangeSet,
      valueChanges: [{ row: 1, col: 1, cell: { v: 9, m: "9" } }],
    };

    expect(
      planSheetSaveRequest({
        baseRevision: 4,
        persistedSnapshot: { celldata: [], config: null },
        desiredSnapshot: { celldata: [], config: null },
        changeSet,
        requiresChunkReplacement: false,
      }),
    ).toEqual({ kind: "changeSet", baseRevision: 4, changeSet });
  });

  it("plans only changed chunks for replacement saves", () => {
    expect(
      planSheetSaveRequest({
        baseRevision: 4,
        persistedSnapshot: { celldata: [], config: null },
        desiredSnapshot: { celldata: [{ r: 0, c: 0, v: { v: 1, m: "1" } }], config: null },
        changeSet: emptyChangeSet,
        requiresChunkReplacement: true,
      }),
    ).toEqual({
      kind: "replaceChunks",
      baseRevision: 4,
      config: null,
      chunks: [
        { chunkRow: 0, chunkCol: 0, payload: '{"celldata":[{"r":0,"c":0,"v":{"v":1,"m":"1"}}]}' },
      ],
    });
  });

  it("does not create a request when the selected save mode has no changes", () => {
    expect(
      planSheetSaveRequest({
        baseRevision: 4,
        persistedSnapshot: { celldata: [], config: null },
        desiredSnapshot: { celldata: [], config: null },
        changeSet: emptyChangeSet,
        requiresChunkReplacement: false,
      }),
    ).toBeNull();
  });
});
