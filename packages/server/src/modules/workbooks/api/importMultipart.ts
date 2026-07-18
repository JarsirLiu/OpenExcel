import type { FastifyRequest } from "fastify";
import type { WorkbookSourceAsset } from "../domain/sourceAsset.js";
import type { WorkbookSourceAssetStorage } from "../domain/sourceAssetStorage.js";

export class WorkbookMultipartError extends Error {
  readonly code = "INVALID_IMPORT_PAYLOAD" as const;
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "WorkbookMultipartError";
  }
}

export async function parseWorkbookImportMultipart(
  request: FastifyRequest,
  workspaceId: number,
  sourceAssetStorage: WorkbookSourceAssetStorage,
): Promise<WorkbookSourceAsset> {
  let sourceAsset: WorkbookSourceAsset | undefined;

  try {
    let fileCount = 0;
    for await (const part of request.parts()) {
      if (part.type === "file") {
        fileCount += 1;
        if (part.fieldname !== "file" || fileCount > 1) {
          part.file.resume();
          throw new WorkbookMultipartError("导入请求只能包含一个 file 文件字段");
        }
        sourceAsset = await sourceAssetStorage.store(workspaceId, {
          filename: part.filename,
          mimetype: part.mimetype,
          file: part.file,
        });
      } else {
        throw new WorkbookMultipartError("导入请求只能包含一个 file 文件字段");
      }
    }

    if (!sourceAsset) throw new WorkbookMultipartError("导入请求必须包含 file 文件字段");
    return sourceAsset;
  } catch (error) {
    if (sourceAsset) {
      await sourceAssetStorage.delete(sourceAsset.storageKey).catch(() => undefined);
    }
    throw error;
  }
}
