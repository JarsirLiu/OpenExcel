import type { WorkbookSourceAsset, WorkbookSourceAssetFormat } from "./sourceAsset.js";

export type WorkbookUploadFile = {
  filename: string;
  mimetype: string;
  file: NodeJS.ReadableStream;
};

export class WorkbookSourceAssetStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkbookSourceAssetStorageError";
  }
}

export interface WorkbookSourceAssetStorage {
  store(workspaceId: number, file: WorkbookUploadFile): Promise<WorkbookSourceAsset>;
  read(storageKey: string): Promise<Uint8Array>;
  delete(storageKey: string): Promise<void>;
}

export type { WorkbookSourceAsset, WorkbookSourceAssetFormat };
