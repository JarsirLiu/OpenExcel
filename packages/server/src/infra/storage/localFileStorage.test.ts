import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { type AssetUploadFile, describeAssetUpload } from "../../modules/assets/domain/asset.js";
import { createLocalAssetStorage, FileStorageError } from "./localFileStorage.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openexcel-storage-"));
  temporaryRoots.push(root);
  return root;
}

function filePart(filename: string, bytes: Uint8Array): AssetUploadFile {
  return {
    filename,
    mimetype: "application/octet-stream",
    file: Readable.from([bytes]),
  };
}

describe("writeAsset", () => {
  it("stores an XLSX as an immutable asset and returns its hash", async () => {
    const rootDir = await createRoot();
    const storage = createLocalAssetStorage({ rootDir });
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]);
    const storageKey = "uploads/7/asset_test/original.xlsx";
    const content = await storage.write(storageKey, "xlsx", filePart("预算.xlsx", bytes));

    expect(content.sizeBytes).toBe(bytes.byteLength);
    expect(content.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(await readFile(join(rootDir, storageKey))).toEqual(bytes);

    await storage.delete(storageKey);
    await expect(readFile(join(rootDir, storageKey))).rejects.toThrow();
  });

  it("accepts XLS files and rejects invalid signatures", async () => {
    const rootDir = await createRoot();
    const storage = createLocalAssetStorage({ rootDir });
    const xlsHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(
      storage.write("uploads/7/legacy/original.xls", "xls", filePart("legacy.xls", xlsHeader)),
    ).resolves.toMatchObject({ sizeBytes: xlsHeader.byteLength });
    await expect(
      storage.write(
        "uploads/7/invalid/original.xlsx",
        "xlsx",
        filePart("invalid.xlsx", Buffer.from("not-xlsx")),
      ),
    ).rejects.toBeInstanceOf(FileStorageError);
  });

  it("rejects unsupported extensions before writing a file", async () => {
    const rootDir = await createRoot();

    expect(() => describeAssetUpload("notes.txt", "text/plain")).toThrow(
      "仅支持 .xlsx、.xls 和 .csv 文件",
    );
  });
});

describe("deleteAsset", () => {
  it("rejects paths outside the configured storage root", async () => {
    const rootDir = await createRoot();
    const storage = createLocalAssetStorage({ rootDir });

    await expect(storage.delete("../outside.xlsx")).rejects.toBeInstanceOf(FileStorageError);
  });
});
