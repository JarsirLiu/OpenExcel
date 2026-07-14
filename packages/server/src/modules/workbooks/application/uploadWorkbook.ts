import * as XLSX from "xlsx";
import * as repo from "../infrastructure/workbookRepository.js";

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer | SharedArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export type WorkbookUploadErrorCode = "INVALID_EXCEL_FILE" | "UPLOAD_LIMIT_EXCEEDED";

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

function readWorkbookOrThrow(buffer: Buffer, fileName: string) {
  try {
    const extension = fileName.toLowerCase().match(/\.(xlsx|xls)$/)?.[1];
    const isXlsx = buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const isXls = buffer
      .subarray(0, 8)
      .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    if ((extension !== "xlsx" || !isXlsx) && (extension !== "xls" || !isXls)) {
      throw new Error("文件内容与 Excel 文件扩展名不匹配");
    }

    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellStyles: true,
      cellFormula: true,
      cellNF: true,
    });
    if (workbook.SheetNames.length === 0) {
      throw new Error("工作簿不包含任何工作表");
    }
    return workbook;
  } catch (error) {
    throw new WorkbookUploadError(
      "无法解析上传的 Excel 文件，请确认文件格式有效",
      "INVALID_EXCEL_FILE",
      400,
      { fileName, cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export type WorkbookUploadFile = {
  buffer: Buffer;
  fileName: string;
};

async function parseUpload(file: WorkbookUploadFile) {
  const wbFile = readWorkbookOrThrow(file.buffer, file.fileName);
  const sheetNames = wbFile.SheetNames;
  const { excelToGrid } = await import("@openexcel/core");
  const results = excelToGrid(bufferToArrayBuffer(file.buffer), sheetNames);

  return {
    workbookName: file.fileName.replace(/\.[^.]+$/, ""),
    sheetNames,
    results,
  };
}

type ParsedWorkbook = Awaited<ReturnType<typeof parseUpload>>;

export async function uploadAsNewWorkbook(
  workspaceId: number,
  files: readonly WorkbookUploadFile[],
) {
  if (files.length === 0) return [];

  const parsedWorkbooks: ParsedWorkbook[] = [];
  for (const file of files) {
    parsedWorkbooks.push(await parseUpload(file));
  }

  return repo.createUploadedWorkbooks(workspaceId, parsedWorkbooks);
}
