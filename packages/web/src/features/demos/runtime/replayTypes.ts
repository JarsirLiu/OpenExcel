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
  toolExecutionDuration?: number;
  patch?: DemoPatch | DemoPatch[];
};

export type DemoPlayback = {
  textTokenDelay: number;
  textCompletionDelay: number;
  toolStartDelay: number;
  toolExecutionDuration: number;
  stepDelay: number;
  toolStepDelay: number;
  restartDelay: number;
};

export type DemoDefinition = {
  id: string;
  route: string;
  workspace: {
    id: number;
    publicId: string;
    name: string;
    order: number;
  };
  sessionName: string;
  prompt: string;
  initialWorkbooks: DemoWorkbook[];
  timeline: readonly DemoStep[];
  playback?: Partial<DemoPlayback>;
};

export type PlaybackPhase = "idle" | "text" | "tool" | "result" | "done";
