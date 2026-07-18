export type AssetFormat = "xlsx" | "xls" | "csv";

export const ASSET_STATES = {
  uploading: "UPLOADING",
  ready: "READY",
  importing: "IMPORTING",
  active: "ACTIVE",
  orphaned: "ORPHANED",
  cleaning: "CLEANING",
} as const;

export type AssetState = (typeof ASSET_STATES)[keyof typeof ASSET_STATES];

export type AssetUploadFile = {
  filename: string;
  mimetype: string;
  file: NodeJS.ReadableStream;
};

export type AssetRecord = {
  id: number;
  publicId: string;
  workspaceId: number | null;
  storageKey: string;
  originalFileName: string;
  detectedFormat: AssetFormat;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  state: AssetState;
};

export type StagedAsset = AssetRecord & { state: typeof ASSET_STATES.ready };

export class AssetError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code = "INVALID_UPLOAD_FILE", statusCode = 400) {
    super(message);
    this.name = "AssetError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const supportedExtensions = new Set([".xlsx", ".xls", ".csv"]);

export function describeAssetUpload(filename: string, mimetype: string) {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    throw new AssetError("仅支持 .xlsx、.xls 和 .csv 文件");
  }

  const safeName = Array.from(filename.split(/[\\/]/).pop() ?? "", (character) =>
    character.charCodeAt(0) < 32 ? "_" : character,
  )
    .join("")
    .trim();

  return {
    originalFileName: safeName || "未命名文件",
    detectedFormat: extension.slice(1) as AssetFormat,
    mimeType: mimetype || "application/octet-stream",
  };
}

export function assetStorageKey(workspaceId: number, publicId: string, format: AssetFormat) {
  return `uploads/${workspaceId}/${publicId}/original.${format}`;
}
