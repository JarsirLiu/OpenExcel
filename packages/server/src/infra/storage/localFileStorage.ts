import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  type WorkbookSourceAsset,
  WorkbookSourceAssetStorageError,
  type WorkbookUploadFile,
} from "../../modules/workbooks/domain/sourceAssetStorage.js";
import { generatePublicId } from "../../shared/utils/publicId.js";
import { loadStorageConfig } from "./storageConfig.js";

export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);

export type UploadFormat = WorkbookSourceAsset["detectedFormat"];
export type UploadFilePart = WorkbookUploadFile;
export type StoredUploadAsset = WorkbookSourceAsset;

export class FileStorageError extends WorkbookSourceAssetStorageError {
  constructor(message: string) {
    super(message);
    this.name = "FileStorageError";
  }
}

class HashingTransform extends Transform {
  readonly hash = createHash("sha256");
  bytes = 0;

  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer | string) => void,
  ): void {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
    this.bytes += buffer.byteLength;
    if (this.bytes > MAX_UPLOAD_FILE_BYTES) {
      callback(new FileStorageError("上传文件超过 100 MB 限制"));
      return;
    }
    this.hash.update(buffer);
    callback(null, buffer);
  }
}

function formatFromFileName(filename: string): UploadFormat {
  const extension = extname(filename).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new FileStorageError("仅支持 .xlsx、.xls 和 .csv 文件");
  }
  return extension.slice(1) as UploadFormat;
}

async function readHeader(path: string): Promise<Buffer> {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    return header.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

function validateFileSignature(format: UploadFormat, header: Buffer): void {
  if (format === "xlsx" && !(header[0] === 0x50 && header[1] === 0x4b)) {
    throw new FileStorageError("XLSX 文件格式无效");
  }
  if (
    format === "xls" &&
    !Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).equals(header)
  ) {
    throw new FileStorageError("XLS 文件格式无效");
  }
}

function safeFileName(filename: string): string {
  const name = Array.from(basename(filename), (character) =>
    character.charCodeAt(0) < 32 ? "_" : character,
  )
    .join("")
    .trim();
  return name || "未命名文件";
}

function storageKeyFor(rootDir: string, filePath: string): string {
  return relative(rootDir, filePath).split(sep).join("/");
}

function resolveStoragePath(storageKey: string, rootDir: string): string {
  const root = resolve(rootDir);
  const filePath = resolve(root, storageKey);
  const relativePath = relative(root, filePath);
  if (
    !relativePath ||
    isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new FileStorageError("非法的存储路径");
  }
  return filePath;
}

export async function storeUploadFile(
  workspaceId: number,
  part: UploadFilePart,
  config = loadStorageConfig(),
): Promise<StoredUploadAsset> {
  const format = formatFromFileName(part.filename);
  const publicId = generatePublicId("asset");
  const assetDir = join(config.rootDir, "uploads", String(workspaceId), publicId);
  const temporaryPath = join(assetDir, ".uploading");
  const finalPath = join(assetDir, `original.${format}`);

  await mkdir(assetDir, { recursive: true });
  try {
    const hashingStream = new HashingTransform();
    await pipeline(part.file, hashingStream, createWriteStream(temporaryPath, { flags: "wx" }));
    if ((part.file as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
      throw new FileStorageError("上传文件超过大小限制");
    }
    validateFileSignature(format, await readHeader(temporaryPath));
    await rename(temporaryPath, finalPath);

    return {
      publicId,
      storageKey: storageKeyFor(config.rootDir, finalPath),
      originalFileName: safeFileName(part.filename),
      detectedFormat: format,
      mimeType: part.mimetype || "application/octet-stream",
      sizeBytes: hashingStream.bytes,
      sha256: hashingStream.hash.digest("hex"),
    };
  } catch (error) {
    await rm(assetDir, { recursive: true, force: true });
    throw error;
  }
}

export async function deleteStoredUpload(
  storageKey: string,
  config = loadStorageConfig(),
): Promise<void> {
  const filePath = resolveStoragePath(storageKey, config.rootDir);
  await rm(filePath, { force: true });
}

export async function readStoredUpload(
  storageKey: string,
  config = loadStorageConfig(),
): Promise<Uint8Array> {
  const filePath = resolveStoragePath(storageKey, config.rootDir);
  return readFile(filePath);
}

export function createStoredUploadReadStream(
  storageKey: string,
  config = loadStorageConfig(),
): NodeJS.ReadableStream {
  const filePath = resolveStoragePath(storageKey, config.rootDir);
  return createReadStream(filePath);
}

export const localFileStorage = {
  store: storeUploadFile,
  read: readStoredUpload,
  delete: deleteStoredUpload,
};
