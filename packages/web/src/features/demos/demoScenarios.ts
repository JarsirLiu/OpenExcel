import type { DemoScenario } from "./demoTypes";
import {
  inventoryInitialWorkbooks,
  inventoryReconciliationPrompt,
  inventorySteps,
} from "./inventoryReconciliation";

export const demoScenarios: Record<string, DemoScenario> = {
  inventory: {
    id: "inventory-reconciliation",
    workspace: {
      id: -100,
      publicId: "demo-supermarket-finance",
      name: "超市财务演示",
      order: 0,
    },
    sessionName: "进销存核对 Demo",
    prompt: inventoryReconciliationPrompt,
    initialWorkbooks: inventoryInitialWorkbooks,
    steps: inventorySteps,
  },
};

export function getDemoScenario(_pathname: string): DemoScenario {
  return demoScenarios.inventory;
}
