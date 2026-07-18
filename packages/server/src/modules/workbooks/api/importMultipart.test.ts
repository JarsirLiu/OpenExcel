import { Readable } from "node:stream";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AssetService } from "../../assets/application/assetService.js";
import { ASSET_STATES, type StagedAsset } from "../../assets/domain/asset.js";
import { parseWorkbookImportMultipart, WorkbookMultipartError } from "./importMultipart.js";

const stagedAsset: StagedAsset = {
  id: 9,
  publicId: "asset_test",
  workspaceId: 1,
  storageKey: "uploads/1/asset_test/original.xlsx",
  originalFileName: "预算.xlsx",
  detectedFormat: "xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  sizeBytes: 4,
  sha256: "hash",
  state: ASSET_STATES.ready,
};

function requestWithParts(parts: readonly unknown[]): FastifyRequest {
  return {
    parts: async function* () {
      yield* parts;
    },
  } as unknown as FastifyRequest;
}

function createAssets() {
  const assets: AssetService = {
    stageUpload: vi.fn(async (_workspaceId, upload) => {
      for await (const _chunk of upload.file as unknown as AsyncIterable<Buffer>) {
        // Consume the stream so the multipart parser can continue to the next part.
      }
      return stagedAsset;
    }),
    read: vi.fn(),
    markOrphaned: vi.fn(async () => undefined),
    withAssetLease: vi.fn(async (_assetId, action) => action()),
    beginImport: vi.fn(),
    completeImport: vi.fn(),
  };
  return assets;
}

describe("parseWorkbookImportMultipart", () => {
  it("stages the original file through the asset service", async () => {
    const assets = createAssets();
    const request = requestWithParts([
      {
        type: "file",
        fieldname: "file",
        filename: "预算.xlsx",
        mimetype: stagedAsset.mimeType,
        file: Readable.from([Buffer.from("PK\\x03\\x04")]),
      },
    ]);

    await expect(parseWorkbookImportMultipart(request, 1, assets)).resolves.toEqual(stagedAsset);
    expect(assets.stageUpload).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ filename: "预算.xlsx", mimetype: stagedAsset.mimeType }),
    );
    expect(assets.markOrphaned).not.toHaveBeenCalled();
  });

  it("marks a staged asset orphaned when another multipart field is present", async () => {
    const assets = createAssets();
    const request = requestWithParts([
      {
        type: "file",
        fieldname: "file",
        filename: "预算.xlsx",
        mimetype: stagedAsset.mimeType,
        file: Readable.from([Buffer.from("PK\\x03\\x04")]),
      },
      { type: "field", fieldname: "payload", value: "forbidden" },
    ]);

    await expect(parseWorkbookImportMultipart(request, 1, assets)).rejects.toBeInstanceOf(
      WorkbookMultipartError,
    );
    expect(assets.markOrphaned).toHaveBeenCalledWith(9, expect.any(String));
  });

  it("rejects a file field with an unexpected name", async () => {
    const assets = createAssets();
    const request = requestWithParts([
      {
        type: "file",
        fieldname: "other",
        filename: "预算.xlsx",
        mimetype: stagedAsset.mimeType,
        file: Readable.from([Buffer.from("PK\\x03\\x04")]),
      },
    ]);

    await expect(parseWorkbookImportMultipart(request, 1, assets)).rejects.toMatchObject({
      code: "INVALID_IMPORT_PAYLOAD",
    });
    expect(assets.stageUpload).not.toHaveBeenCalled();
  });

  it("rejects extra multipart fields", async () => {
    const assets = createAssets();
    const request = requestWithParts([{ type: "field", fieldname: "payload", value: "forbidden" }]);

    await expect(parseWorkbookImportMultipart(request, 1, assets)).rejects.toMatchObject({
      code: "INVALID_IMPORT_PAYLOAD",
    });
  });
});
