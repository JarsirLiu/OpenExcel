import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteStoredUpload,
  FileStorageError,
  storeUploadFile,
  type UploadFilePart,
} from "./localFileStorage.js";

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

function filePart(filename: string, bytes: Uint8Array): UploadFilePart {
  return {
    filename,
    mimetype: "application/octet-stream",
    file: Readable.from([bytes]),
  };
}

describe("storeUploadFile", () => {
  it("stores an XLSX as an immutable asset and returns its hash", async () => {
    const rootDir = await createRoot();
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]);
    const asset = await storeUploadFile(7, filePart("预算.xlsx", bytes), { rootDir });

    expect(asset.detectedFormat).toBe("xlsx");
    expect(asset.storageKey).toMatch(/^uploads\/7\/asset_[^/]+\/original\.xlsx$/);
    expect(asset.sizeBytes).toBe(bytes.byteLength);
    expect(asset.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(await readFile(join(rootDir, asset.storageKey))).toEqual(bytes);

    await deleteStoredUpload(asset.storageKey, { rootDir });
    await expect(readFile(join(rootDir, asset.storageKey))).rejects.toThrow();
  });

  it("accepts XLS files and rejects invalid signatures", async () => {
    const rootDir = await createRoot();
    const xlsHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(
      storeUploadFile(7, filePart("legacy.xls", xlsHeader), { rootDir }),
    ).resolves.toMatchObject({ detectedFormat: "xls" });
    await expect(
      storeUploadFile(7, filePart("invalid.xlsx", Buffer.from("not-xlsx")), { rootDir }),
    ).rejects.toBeInstanceOf(FileStorageError);
  });

  it("rejects unsupported extensions before writing a file", async () => {
    const rootDir = await createRoot();

    await expect(
      storeUploadFile(7, filePart("notes.txt", Buffer.from("text")), { rootDir }),
    ).rejects.toThrow("仅支持 .xlsx、.xls 和 .csv 文件");
  });
});

describe("deleteStoredUpload", () => {
  it("rejects paths outside the configured storage root", async () => {
    const rootDir = await createRoot();

    await expect(deleteStoredUpload("../outside.xlsx", { rootDir })).rejects.toBeInstanceOf(
      FileStorageError,
    );
  });
});
