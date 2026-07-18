export type WorkbookSourceAssetFormat = "xlsx" | "xls" | "csv";

export type WorkbookSourceAsset = {
  publicId: string;
  storageKey: string;
  originalFileName: string;
  detectedFormat: WorkbookSourceAssetFormat;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};
