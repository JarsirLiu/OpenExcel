import type {
  DemoCell,
  DemoDefinition,
  DemoPatch,
  DemoSheet,
  DemoStep,
} from "../runtime/replayTypes";

const headerBackground = "#DCE6F1";

export function demoCell(value: string | number, options: Omit<DemoCell, "value"> = {}): DemoCell {
  return { value, ...options };
}

export function demoRow(...values: Array<string | number | DemoCell>): DemoCell[] {
  return values.map((value) => (typeof value === "object" ? value : demoCell(value)));
}

export function resultCell(
  value: string | number,
  tone: "normal" | "warning" | "danger" = "normal",
): DemoCell {
  const backgrounds = {
    normal: "#E2F0D9",
    warning: "#FFF4CE",
    danger: "#FCE8E6",
  };
  return demoCell(value, { background: backgrounds[tone] });
}

type ScenarioSheet = {
  name: string;
  columns: string[];
  rows: DemoCell[][];
};

type AnalysisStep = {
  id: string;
  title: string;
  assistantText: string;
  toolName?: string;
  toolInput: string;
  toolOutput: string;
  activeSheet: string;
  highlight: string;
  toolExecutionDuration?: number;
};

type AnalysisScenarioConfig = {
  id: string;
  workspaceId: number;
  workspaceName: string;
  sessionName: string;
  prompt: string;
  workbookName: string;
  sourceSheets: ScenarioSheet[];
  resultSheet: ScenarioSheet;
  analysisSteps: AnalysisStep[];
  writeTitle: string;
  writeAssistantText: string;
  writeToolInput: string;
  writeToolOutput: string;
  verifyAssistantText: string;
  verifyToolOutput: string;
  finalText: string;
};

function withHeader(sheet: ScenarioSheet): DemoSheet {
  return {
    name: sheet.name,
    columns: sheet.columns,
    rows: [
      sheet.columns.map((column) => demoCell(column, { background: headerBackground })),
      ...sheet.rows,
    ],
  };
}

function blankResultSheet(sheet: ScenarioSheet): DemoSheet {
  return {
    name: sheet.name,
    columns: sheet.columns,
    rows: [
      sheet.columns.map((column) => demoCell(column, { background: headerBackground })),
      ...sheet.rows.map(() => sheet.columns.map(() => demoCell(""))),
    ],
  };
}

function resultPatches(sheet: ScenarioSheet): DemoPatch[] {
  return sheet.rows.map((values, index) => ({
    sheet: sheet.name,
    row: index + 2,
    startCol: 1,
    values,
  }));
}

export function createAnalysisScenario(config: AnalysisScenarioConfig): DemoDefinition {
  const writeHighlight = `A1:${String.fromCharCode(64 + config.resultSheet.columns.length)}${
    config.resultSheet.rows.length + 1
  }`;
  const timeline: DemoStep[] = [
    ...config.analysisSteps.map((step) => ({
      ...step,
      phase: "分析",
      toolName: step.toolName ?? "readSheetData",
      tokens: [step.assistantText],
      activeWorkbook: config.workbookName,
    })),
    {
      id: "write-results",
      phase: "写入",
      title: config.writeTitle,
      toolName: "writeCells",
      toolInput: config.writeToolInput,
      toolOutput: config.writeToolOutput,
      assistantText: config.writeAssistantText,
      tokens: [config.writeAssistantText],
      activeWorkbook: config.workbookName,
      activeSheet: config.resultSheet.name,
      highlight: writeHighlight,
      patch: resultPatches(config.resultSheet),
      toolExecutionDuration: 980,
    },
    {
      id: "verify-results",
      phase: "复核",
      title: "复核分析结果",
      toolName: "readSheetData",
      toolInput: `重新读取「${config.resultSheet.name}」${writeHighlight}，检查结果数量和关键指标`,
      toolOutput: config.verifyToolOutput,
      assistantText: config.verifyAssistantText,
      tokens: [config.verifyAssistantText],
      activeWorkbook: config.workbookName,
      activeSheet: config.resultSheet.name,
      highlight: writeHighlight,
    },
    {
      id: "finish",
      phase: "完成",
      title: "完成分析",
      assistantText: config.finalText,
      tokens: [config.finalText],
      activeWorkbook: config.workbookName,
      activeSheet: config.resultSheet.name,
    },
  ];

  return {
    id: config.id,
    route: `/demos/${config.id}`,
    workspace: {
      id: config.workspaceId,
      publicId: `demo-${config.id}`,
      name: config.workspaceName,
      order: 0,
    },
    sessionName: config.sessionName,
    prompt: config.prompt,
    initialWorkbooks: [
      {
        name: config.workbookName,
        publicId: `demo-${config.id}-workbook`,
        sheets: [...config.sourceSheets.map(withHeader), blankResultSheet(config.resultSheet)],
      },
    ],
    timeline,
    playback: {
      textTokenDelay: 20,
      textCompletionDelay: 180,
      toolStartDelay: 320,
      toolExecutionDuration: 700,
      stepDelay: 220,
      toolStepDelay: 360,
      restartDelay: 20,
    },
  };
}
