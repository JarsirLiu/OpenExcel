import type { ChartAnchor, ChartSpec } from "@openexcel/core";

export type ChartMutation =
  | { kind: "created"; chart: ChartSpec }
  | { kind: "updated"; chart: ChartSpec }
  | { kind: "deleted"; chartId: string };

export type ChartMutationPort = {
  create: (
    workspaceId: number,
    workbookId: number,
    input: Omit<ChartSpec, "id">,
  ) => Promise<ChartSpec>;
  updateAnchor: (workspaceId: number, chartId: string, anchor: ChartAnchor) => Promise<ChartSpec>;
  remove: (workspaceId: number, chartId: string) => Promise<void>;
};
