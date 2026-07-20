import type { DemoCell, DemoSheet, DemoStep, DemoWorkbook } from "./replayTypes";

export type DemoTextPart = {
  type: "text";
  stepId: string;
  text: string;
};

export type DemoToolPart = ReturnType<typeof buildToolPart>;
export type DemoAssistantPart = DemoTextPart | DemoToolPart;

function columnNumber(value: string): number {
  return value.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function parseRange(value: string | undefined, sheet: DemoSheet | undefined) {
  const fallback = {
    startRow: 1,
    endRow: Math.min(sheet?.rows.length ?? 1, 8),
    startCol: 1,
    endCol: Math.min(sheet?.columns.length ?? 1, 8),
  };
  if (!value) return fallback;

  const match = value.toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return fallback;
  return {
    startRow: Number(match[2]),
    endRow: Number(match[4]),
    startCol: columnNumber(match[1]),
    endCol: columnNumber(match[3]),
  };
}

function buildPreview(
  workbook: DemoWorkbook | undefined,
  sheet: DemoSheet | undefined,
  rangeValue: string | undefined,
  workbookIndex: number,
) {
  if (!workbook || !sheet) return undefined;

  const range = parseRange(rangeValue, sheet);
  const rows = sheet.rows
    .slice(range.startRow - 1, range.endRow)
    .map((row) => row.slice(range.startCol - 1, range.endCol));
  const sheetIndex = workbook.sheets.findIndex((item) => item.name === sheet.name);
  return {
    sheetId: -200 - workbookIndex * 10 - sheetIndex,
    sheetName: sheet.name,
    range,
    rows: rows.map((values, index) => ({
      row: range.startRow + index,
      values: values.map((item: DemoCell) => String(item.value)),
    })),
    merges: [],
  };
}

export function buildToolPart(
  step: DemoStep,
  toolState: "input-streaming" | "output-available",
  workbooks: readonly DemoWorkbook[],
) {
  const workbookName = step.activeWorkbook ?? workbooks[0]?.name ?? "当前文件";
  const workbook = workbooks.find((item) => item.name === workbookName);
  const sheetName = step.activeSheet ?? workbook?.sheets[0]?.name ?? "当前 Sheet";
  const sheet = workbook?.sheets.find((item) => item.name === sheetName);
  const patches = step.patch ? (Array.isArray(step.patch) ? step.patch : [step.patch]) : [];
  const workbookIndex = workbooks.findIndex((item) => item.name === workbookName);
  const sheetIndex = workbook?.sheets.findIndex((item) => item.name === sheetName) ?? 0;
  const changedCellCount = patches.reduce((total, patch) => total + patch.values.length, 0);

  return {
    type: `tool-${step.toolName}`,
    toolCallId: `demo-${step.id}`,
    state: toolState,
    input: {
      workbookName,
      sheetName,
      range: step.highlight ?? "A1:F20",
      instruction: step.toolInput,
    },
    output:
      toolState === "output-available"
        ? {
            sheetInfo: {
              sheetId: -200 - workbookIndex * 10 - sheetIndex,
              sheetName,
              sheetNo: sheetIndex + 1,
              workbookName,
            },
            message: step.toolOutput,
            ...(step.toolName === "readSheetData"
              ? {}
              : {
                  previewLabel: "变更区域",
                  preview: buildPreview(workbook, sheet, step.highlight, workbookIndex),
                }),
            delta:
              patches.length > 0
                ? {
                    type: "write",
                    cells: patches.flatMap((patch) =>
                      patch.values.map((value, index) => ({
                        row: patch.row,
                        col: patch.startCol + index,
                        value: value.value,
                        ...(value.formula ? { formula: value.formula } : {}),
                      })),
                    ),
                  }
                : undefined,
            changeSummary:
              changedCellCount > 0 ? { changedCellCount, rangeOperationCount: 0 } : undefined,
          }
        : undefined,
  };
}

export function buildDemoMessages(assistantParts: readonly DemoAssistantPart[], prompt = "") {
  const messages: any[] = [
    {
      id: "demo-user",
      role: "user",
      parts: [{ type: "text", text: prompt }],
    },
  ];

  if (assistantParts.length > 0) {
    messages.push({ id: "demo-assistant", role: "assistant", parts: assistantParts });
  }

  return messages;
}
