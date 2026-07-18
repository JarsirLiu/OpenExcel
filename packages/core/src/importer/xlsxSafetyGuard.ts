import JSZip from "jszip";

export const DEFAULT_XLSX_SAFETY_LIMITS = {
  maxZipEntries: 2_000,
  maxEntryUncompressedBytes: 64 * 1024 * 1024,
  maxTotalUncompressedBytes: 256 * 1024 * 1024,
} as const;

export interface XlsxSafetyLimits {
  readonly maxZipEntries: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxTotalUncompressedBytes: number;
}

export class XlsxSafetyLimitError extends Error {
  readonly code = "XLSX_SAFETY_LIMIT_EXCEEDED" as const;

  constructor(message: string) {
    super(message);
    this.name = "XlsxSafetyLimitError";
  }
}

export class XlsxContainerError extends Error {
  readonly code = "XLSX_CONTAINER_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "XlsxContainerError";
  }
}

type ZipEntryWithMetadata = JSZip.JSZipObject & {
  _data?: { uncompressedSize?: unknown };
};

function declaredUncompressedSize(entry: JSZip.JSZipObject): number {
  const size = (entry as ZipEntryWithMetadata)._data?.uncompressedSize;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    throw new XlsxContainerError("XLSX ZIP 条目大小无效");
  }
  return size;
}

export async function assertXlsxContainerSafe(
  bytes: Uint8Array,
  limits: XlsxSafetyLimits = DEFAULT_XLSX_SAFETY_LIMITS,
): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new XlsxContainerError("XLSX ZIP 容器无效");
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > limits.maxZipEntries) {
    throw new XlsxSafetyLimitError("XLSX ZIP 条目数量超过安全限制");
  }

  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    const size = declaredUncompressedSize(entry);
    if (size > limits.maxEntryUncompressedBytes) {
      throw new XlsxSafetyLimitError("XLSX ZIP 条目解压大小超过安全限制");
    }
    totalUncompressedBytes += size;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new XlsxSafetyLimitError("XLSX ZIP 总解压大小超过安全限制");
    }
  }
}
