import { Readable } from "node:stream";
import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { WorkbookSourceAssetStorage } from "../domain/sourceAssetStorage.js";
import { parseWorkbookImportMultipart, WorkbookMultipartError } from "./importMultipart.js";

const sourceAsset = {
  publicId: "asset_test",
  storageKey: "uploads/1/asset_test/original.xlsx",
  originalFileName: "预算.xlsx",
  detectedFormat: "xlsx" as const,
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  sizeBytes: 4,
  sha256: "hash",
};

function requestWithParts(parts: readonly unknown[]): FastifyRequest {
  return {
    parts: async function* () {
      yield* parts;
    },
  } as unknown as FastifyRequest;
}

function createStorage() {
  const storage: WorkbookSourceAssetStorage = {
    store: vi.fn(async (_workspaceId, upload) => {
      for await (const _chunk of upload.file as unknown as AsyncIterable<Buffer>) {
        // Consume the stream so the multipart parser can continue to the next part.
      }
      return sourceAsset;
    }),
    read: vi.fn(async () => new Uint8Array()),
    delete: vi.fn(async () => undefined),
  };
  return storage;
}

describe("parseWorkbookImportMultipart", () => {
  it("parses the payload and stores the original file through the port", async () => {
    const storage = createStorage();
    const request = requestWithParts([
      {
        type: "file",
        fieldname: "file",
        filename: "预算.xlsx",
        mimetype: sourceAsset.mimeType,
        file: Readable.from([Buffer.from("PK\x03\x04")]),
      },
    ]);

    await expect(parseWorkbookImportMultipart(request, 1, storage)).resolves.toEqual(sourceAsset);
    expect(storage.store).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ filename: "预算.xlsx", mimetype: sourceAsset.mimeType }),
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("deletes a stored file when another multipart field is present", async () => {
    const storage = createStorage();
    const request = requestWithParts([
      {
        type: "file",
        fieldname: "file",
        filename: "预算.xlsx",
        mimetype: sourceAsset.mimeType,
        file: Readable.from([Buffer.from("PK\x03\x04")]),
      },
      { type: "field", fieldname: "payload", value: "forbidden" },
    ]);

    await expect(parseWorkbookImportMultipart(request, 1, storage)).rejects.toBeInstanceOf(
      WorkbookMultipartError,
    );
    expect(storage.delete).toHaveBeenCalledWith(sourceAsset.storageKey);
  });

  it("rejects a file field with an unexpected name", async () => {
    const storage = createStorage();
    const request = requestWithParts([
      {
        type: "file",
        fieldname: "other",
        filename: "预算.xlsx",
        mimetype: sourceAsset.mimeType,
        file: Readable.from([Buffer.from("PK\x03\x04")]),
      },
    ]);

    await expect(parseWorkbookImportMultipart(request, 1, storage)).rejects.toMatchObject({
      code: "INVALID_IMPORT_PAYLOAD",
    });
    expect(storage.store).not.toHaveBeenCalled();
  });

  it("rejects an extra multipart field", async () => {
    const storage = createStorage();
    const request = requestWithParts([
      {
        type: "field",
        fieldname: "payload",
        value: JSON.stringify({ workbooks: [] }),
      },
      { type: "field", fieldname: "payload", value: JSON.stringify({ workbooks: [] }) },
    ]);

    await expect(parseWorkbookImportMultipart(request, 1, storage)).rejects.toMatchObject({
      code: "INVALID_IMPORT_PAYLOAD",
    });
  });
});
