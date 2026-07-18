import type { FastifyRequest } from "fastify";
import type { AssetService } from "../../assets/application/assetService.js";
import { AssetError, type StagedAsset } from "../../assets/domain/asset.js";

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
  assets: AssetService,
): Promise<StagedAsset> {
  let stagedAsset: StagedAsset | undefined;

  try {
    let fileCount = 0;
    for await (const part of request.parts()) {
      if (part.type !== "file") {
        throw new WorkbookMultipartError("导入请求只能包含一个 file 文件字段");
      }

      fileCount += 1;
      if (part.fieldname !== "file" || fileCount > 1) {
        part.file.resume();
        throw new WorkbookMultipartError("导入请求只能包含一个 file 文件字段");
      }

      stagedAsset = await assets.stageUpload(workspaceId, {
        filename: part.filename,
        mimetype: part.mimetype,
        file: part.file,
      });
    }

    if (!stagedAsset) throw new WorkbookMultipartError("导入请求必须包含 file 文件字段");
    return stagedAsset;
  } catch (error) {
    if (stagedAsset) {
      await assets.markOrphaned(
        stagedAsset.id,
        error instanceof Error ? error.message : "multipart 请求失败",
      );
    }
    if (error instanceof AssetError) throw error;
    throw error;
  }
}
