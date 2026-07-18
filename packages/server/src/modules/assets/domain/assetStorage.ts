import type { AssetFormat, AssetUploadFile } from "./asset.js";

export type StoredAssetContent = {
  sizeBytes: number;
  sha256: string;
};

export interface AssetStorage {
  write(
    storageKey: string,
    format: AssetFormat,
    file: AssetUploadFile,
  ): Promise<StoredAssetContent>;
  read(storageKey: string): Promise<Uint8Array>;
  delete(storageKey: string): Promise<void>;
}
