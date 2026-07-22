export type DemoCell = {
  value: string | number;
  formula?: string;
  background?: string;
  numberFormat?: string;
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

export type DemoCategory = "财务" | "销售" | "运营" | "人力" | "教育";

export type DemoMarketing = {
  category: DemoCategory;
  marketingTitle: string;
  summary: string;
  coverImage: string;
  coverAlt: string;
  proofMetric: string;
  featuredOrder: number;
  theme: "sage" | "sand" | "slate";
};

export type DemoDefinition = {
  id: string;
  marketing: DemoMarketing;
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
