import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  AssetError,
  type AssetFormat,
  type AssetUploadFile,
} from "../../modules/assets/domain/asset.js";
import type { AssetStorage, StoredAssetContent } from "../../modules/assets/domain/assetStorage.js";
import { loadStorageConfig } from "./storageConfig.js";

export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;

export class FileStorageError extends AssetError {
  constructor(message: string, code = "INVALID_UPLOAD_FILE", statusCode = 400) {
    super(message, code, statusCode);
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
      callback(new FileStorageError("上传文件超过 100 MB 限制", "IMPORT_LIMIT_EXCEEDED", 413));
      return;
    }
    this.hash.update(buffer);
    callback(null, buffer);
  }
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

function validateFileSignature(format: AssetFormat, header: Buffer): void {
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

export async function writeAsset(
  storageKey: string,
  format: AssetFormat,
  part: AssetUploadFile,
  config = loadStorageConfig(),
): Promise<StoredAssetContent> {
  const filePath = resolveStoragePath(storageKey, config.rootDir);
  const temporaryPath = `${filePath}.${randomUUID()}.uploading`;
  await mkdir(dirname(filePath), { recursive: true });

  try {
    const hashingStream = new HashingTransform();
    await pipeline(part.file, hashingStream, createWriteStream(temporaryPath, { flags: "wx" }));
    if ((part.file as NodeJS.ReadableStream & { truncated?: boolean }).truncated) {
      throw new FileStorageError("上传文件超过大小限制", "IMPORT_LIMIT_EXCEEDED", 413);
    }
    validateFileSignature(format, await readHeader(temporaryPath));
    await rename(temporaryPath, filePath);
    return { sizeBytes: hashingStream.bytes, sha256: hashingStream.hash.digest("hex") };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function readAsset(
  storageKey: string,
  config = loadStorageConfig(),
): Promise<Uint8Array> {
  return readFile(resolveStoragePath(storageKey, config.rootDir));
}

export async function deleteAsset(storageKey: string, config = loadStorageConfig()): Promise<void> {
  await rm(resolveStoragePath(storageKey, config.rootDir), { force: true });
}

export const localAssetStorage: AssetStorage = {
  write: writeAsset,
  read: readAsset,
  delete: deleteAsset,
};

export function createStoredAssetReadStream(
  storageKey: string,
  config = loadStorageConfig(),
): NodeJS.ReadableStream {
  return createReadStream(resolveStoragePath(storageKey, config.rootDir));
}

export function assetFormatFromFileName(filename: string): AssetFormat {
  const extension = extname(filename).toLowerCase().slice(1);
  if (extension !== "xlsx" && extension !== "xls" && extension !== "csv") {
    throw new FileStorageError("仅支持 .xlsx、.xls 和 .csv 文件");
  }
  return extension;
}
