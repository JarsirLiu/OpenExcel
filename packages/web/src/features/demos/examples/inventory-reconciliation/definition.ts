import type { DemoDefinition } from "../../runtime/replayTypes";
import {
  inventoryInitialWorkbooks,
  inventoryReconciliationPrompt,
  inventoryTimeline,
} from "./fixtures";

export const inventoryReconciliationDemo: DemoDefinition = {
  id: "inventory-reconciliation",
  route: "/demos/inventory-reconciliation",
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
};
