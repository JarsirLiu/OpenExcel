import type { ImportedChartInput } from "@openexcel/core";
import { prisma } from "../../../infra/database/db.js";
import { generateWorkbookPublicId } from "../../../shared/utils/publicId.js";
import type { AssetRecord } from "../../assets/domain/asset.js";
import type { AssetImportActivator } from "../../assets/domain/assetRepository.js";
import { createImportedChartsInTransaction } from "../../charts/infrastructure/chartRepository.js";

type ParsedWorkbook = {
  workbookName: string;
  sheetKeys: readonly string[];
  sheetNames: readonly string[];
  results: readonly {
    celldata: unknown[];
    merges: unknown[];
    config?: unknown;
  }[];
  charts: readonly ImportedChartInput[];
};

export async function createImportedWorkbooks(
  workspaceId: number,
  parsedWorkbooks: readonly ParsedWorkbook[],
  sourceAsset?: AssetRecord,
  activateAsset?: AssetImportActivator,
) {
  return prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { updatedAt: new Date() },
    });
    const maxOrder = await tx.workbook.aggregate({
      where: { workspaceId },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? -1) + 1;
    const uploaded = [];
    if (sourceAsset) {
      if (!activateAsset) throw new Error("导入资产激活器未提供");
      await activateAsset(tx, workspaceId, sourceAsset.id);
    }

    for (const parsedWorkbook of parsedWorkbooks) {
      const wb = await tx.workbook.create({
        data: {
          publicId: generateWorkbookPublicId(),
          workspaceId,
          name: parsedWorkbook.workbookName,
          order: nextOrder++,
          sourceAssetId: sourceAsset?.id,
        },
      });

      const sheetIdByKey = new Map<string, number>();
      for (let index = 0; index < parsedWorkbook.sheetNames.length; index += 1) {
        const parsed = parsedWorkbook.results[index] ?? {
          celldata: [],
          merges: [],
          config: {},
        };
        const createdSheet = await tx.sheet.create({
          data: {
            workbookId: wb.id,
            sheetNo: index + 1,
            name: parsedWorkbook.sheetNames[index],
            order: index,
            columns: JSON.stringify([]),
            merges: JSON.stringify(parsed.merges),
            uploadedData: JSON.stringify(parsed.celldata),
            config: JSON.stringify(parsed.config ?? {}),
          },
        });
        const sheetKey = parsedWorkbook.sheetKeys[index];
        if (!sheetKey) throw new Error("导入 Sheet key 缺失");
        sheetIdByKey.set(sheetKey, createdSheet.id);
      }

      await createImportedChartsInTransaction(
        tx,
        workspaceId,
        wb.id,
        parsedWorkbook.charts,
        new Map([...sheetIdByKey].map(([key, id]) => [key, String(id)] as const)),
      );

      uploaded.push({
        id: wb.id,
        publicId: wb.publicId,
        name: parsedWorkbook.workbookName,
        sheets: parsedWorkbook.sheetNames.length,
      });
    }

    return uploaded;
  });
}
