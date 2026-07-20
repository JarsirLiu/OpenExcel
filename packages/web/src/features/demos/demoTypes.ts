export type DemoCell = {
  value: string | number;
  formula?: string;
  background?: string;
};

export type DemoSheet = {
  name: string;
  columns: string[];
  rows: DemoCell[][];
};

export type DemoWorkbook = {
  name: string;
  publicId: string;
  sheets: DemoSheet[];
};

export type DemoPatch = {
  workbook?: string;
  sheet: string;
  row: number;
  startCol: number;
  values: DemoCell[];
};

export type DemoStep = {
  id: string;
  phase: string;
  title: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  assistantText: string;
  tokens: string[];
  activeWorkbook?: string;
  activeSheet?: string;
  highlight?: string;
  patch?: DemoPatch | DemoPatch[];
};

export type DemoScenario = {
  id: string;
  workspace: {
    id: number;
    publicId: string;
    name: string;
    order: number;
  };
  sessionName: string;
  prompt: string;
  initialWorkbooks: DemoWorkbook[];
  steps: DemoStep[];
};
