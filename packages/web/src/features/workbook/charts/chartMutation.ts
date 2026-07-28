import type { ChartSpec } from "@openexcel/core";

export type ChartMutation =
  | { kind: "created"; chart: ChartSpec }
  | { kind: "updated"; chart: ChartSpec }
  | { kind: "deleted"; chartId: string };
