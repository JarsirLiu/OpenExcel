import type { ImportedWorkbookBatchInput } from "@openexcel/core";
import { validateAndNormalizeMerges } from "./importMergeValidation.js";
import { ImportValidationError } from "./importValidationErrors.js";
import {
  filterSelectionSchema,
  type ImportedWorkbookPayload,
  importedWorkbookBatchSchema,
  validateImportedConfig,
  validateImportedJsonValue,
  WORKBOOK_IMPORT_PAYLOAD_LIMITS,
} from "./importWorkbookSchema.js";

function normalizeSheet(sheet: ImportedWorkbookPayload["sheets"][number]) {
  if (sheet.celldata.length > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxCellsPerSheet) {
    throw new ImportValidationError("工作表单元格数量超过限制", "IMPORT_LIMIT_EXCEEDED", 413, {
      sheetName: sheet.name,
      maxCells: WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxCellsPerSheet,
    });
  }

  try {
    validateImportedConfig(sheet.config);
  } catch (error) {
    throw new ImportValidationError(
      error instanceof Error ? error.message : "工作表配置无效",
      "IMPORT_LIMIT_EXCEEDED",
      413,
      { sheetName: sheet.name },
    );
  }

  if (sheet.config.filter_select != null) {
    const filterResult = filterSelectionSchema.safeParse(sheet.config.filter_select);
    if (!filterResult.success) {
      throw new ImportValidationError("工作表筛选范围无效", "INVALID_IMPORT_PAYLOAD", 400, {
        sheetName: sheet.name,
      });
    }
  }

  const cellKeys = new Set<string>();
  for (const cell of sheet.celldata) {
    const key = `${cell.r}:${cell.c}`;
    if (cellKeys.has(key)) {
      throw new ImportValidationError("工作表包含重复的单元格坐标", "INVALID_IMPORT_PAYLOAD", 400, {
        sheetName: sheet.name,
        row: cell.r,
        column: cell.c,
      });
    }
    cellKeys.add(key);
    if (cell.v.ct?.s) {
      try {
        validateImportedJsonValue(cell.v.ct.s);
      } catch (error) {
        throw new ImportValidationError(
          error instanceof Error ? error.message : "单元格格式配置无效",
          "IMPORT_LIMIT_EXCEEDED",
          413,
          { sheetName: sheet.name, row: cell.r, column: cell.c },
        );
      }
    }
    const merge = cell.v.mc;
    if (merge && (merge.r + (merge.rs ?? 1) > 1_048_576 || merge.c + (merge.cs ?? 1) > 16_384)) {
      throw new ImportValidationError(
        "单元格合并区域超出工作表范围",
        "INVALID_IMPORT_PAYLOAD",
        400,
        {
          sheetName: sheet.name,
          row: cell.r,
          column: cell.c,
        },
      );
    }
  }

  return {
    name: sheet.name.trim(),
    celldata: sheet.celldata,
    merges: validateAndNormalizeMerges(sheet),
    config: sheet.config,
  };
}

function normalizeWorkbook(workbook: ImportedWorkbookPayload) {
  if (workbook.sheets.length > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxSheetsPerWorkbook) {
    throw new ImportValidationError("工作表数量超过限制", "IMPORT_LIMIT_EXCEEDED", 413, {
      workbookName: workbook.name,
      maxSheets: WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxSheetsPerWorkbook,
    });
  }

  const sheetNames = new Set<string>();
  const results = workbook.sheets.map((sheet) => {
    if (sheetNames.has(sheet.name)) {
      throw new ImportValidationError("工作簿包含重复的工作表名称", "INVALID_IMPORT_PAYLOAD", 400, {
        workbookName: workbook.name,
        sheetName: sheet.name,
      });
    }
    sheetNames.add(sheet.name);
    return normalizeSheet(sheet);
  });
  return {
    workbookName: workbook.name.trim(),
    sheetNames: results.map((sheet) => sheet.name),
    results,
  };
}

export function normalizeImportedBatch(input: ImportedWorkbookBatchInput) {
  const parsed = importedWorkbookBatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new ImportValidationError("导入数据格式无效", "INVALID_IMPORT_PAYLOAD", 400, {
      issues: parsed.error.issues.slice(0, 10).map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }
  if (parsed.data.workbooks.length > WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxWorkbooks) {
    throw new ImportValidationError("本次导入工作簿数量超过限制", "IMPORT_LIMIT_EXCEEDED", 413, {
      maxWorkbooks: WORKBOOK_IMPORT_PAYLOAD_LIMITS.maxWorkbooks,
    });
  }

  const workbookNames = new Set<string>();
  const parsedWorkbooks = parsed.data.workbooks.map(normalizeWorkbook);
  for (const workbook of parsedWorkbooks) {
    if (workbookNames.has(workbook.workbookName)) {
      throw new ImportValidationError(
        "本次导入包含重复的工作簿名称",
        "INVALID_IMPORT_PAYLOAD",
        400,
        {
          workbookName: workbook.workbookName,
        },
      );
    }
    workbookNames.add(workbook.workbookName);
  }
  return parsedWorkbooks;
}
