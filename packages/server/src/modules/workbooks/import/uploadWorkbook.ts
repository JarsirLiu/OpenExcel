import * as XLSX from "xlsx";
import { prisma } from "../../../infra/database/db.js";
import { generateWorkbookPublicId } from "../../../shared/utils/publicId.js";

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer | SharedArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export type WorkbookUploadErrorCode = "INVALID_EXCEL_FILE";

export class WorkbookUploadError extends Error {
  statusCode: number;
  code: WorkbookUploadErrorCode;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: WorkbookUploadErrorCode,
    statusCode = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkbookUploadError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function readWorkbookOrThrow(buffer: Buffer) {
  try {
    return XLSX.read(buffer, { type: "buffer", cellStyles: true, cellFormula: true, cellNF: true });
  } catch (error) {
    throw new WorkbookUploadError(
      "无法解析上传的 Excel 文件，请确认文件格式有效",
      "INVALID_EXCEL_FILE",
      400,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export async function uploadAsNewWorkbook(workspaceId: number, buffer: Buffer, fileName: string) {
  const wbFile = readWorkbookOrThrow(buffer);
  const sheetNames = wbFile.SheetNames;
  const { excelToGrid } = await import("@openexcel/core");
  const results = excelToGrid(bufferToArrayBuffer(buffer), sheetNames);
  const wbName = fileName.replace(/\.[^.]+$/, "");

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.workbook.aggregate({
      where: { workspaceId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;
    const wb = await tx.workbook.create({
      data: { publicId: generateWorkbookPublicId(), workspaceId, name: wbName, order: nextOrder },
    });

    for (let i = 0; i < sheetNames.length; i++) {
      const parsed = results[i] ?? { celldata: [], merges: [], config: {} };
      await tx.sheet.create({
        data: {
          workbookId: wb.id,
          sheetNo: i + 1,
          name: sheetNames[i],
          order: i,
          columns: JSON.stringify([]),
          merges: JSON.stringify(parsed.merges),
          uploadedData: JSON.stringify(parsed.celldata),
          config: JSON.stringify(parsed.config ?? {}),
        },
      });
    }

    return { id: wb.id, publicId: wb.publicId, name: wbName, sheets: sheetNames.length };
  });
}
