import type { DemoDefinition } from "../../runtime/replayTypes";
import {
  inventoryInitialWorkbooks,
  inventoryReconciliationPrompt,
  inventoryTimeline,
} from "./fixtures";

export const inventoryReconciliationDemo: DemoDefinition = {
  id: "inventory-reconciliation",
  route: "/demos/inventory-reconciliation",
  marketing: {
    category: "运营",
    marketingTitle: "进销存智能核对",
    summary: "匹配进货、销售和库存数据，检查数量差异、缺货与滞销商品，并保留可复核公式。",
    coverImage: "/demo-covers/inventory.webp",
    coverAlt: "仓储人员在工业货架之间进行库存盘点",
    proofMetric: "三表匹配 · 公式可追溯",
    featuredOrder: 16,
    theme: "slate",
  },
  workspace: {
    id: -100,
    publicId: "demo-supermarket-finance",
    name: "超市财务演示",
    order: 0,
  },
  sessionName: "进销存核对 Demo",
  prompt: inventoryReconciliationPrompt,
  initialWorkbooks: inventoryInitialWorkbooks,
  timeline: inventoryTimeline,
  playback: {
    textTokenDelay: 24,
    textCompletionDelay: 220,
    toolStartDelay: 380,
    toolExecutionDuration: 780,
    stepDelay: 260,
    toolStepDelay: 420,
    restartDelay: 20,
  },
};
