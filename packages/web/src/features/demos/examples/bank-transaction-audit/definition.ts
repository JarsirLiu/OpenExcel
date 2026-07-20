import type { DemoDefinition } from "../../runtime/replayTypes";
import { bankAuditInitialWorkbooks, bankAuditPrompt, bankAuditTimeline } from "./fixtures";

export const bankTransactionAuditDemo: DemoDefinition = {
  id: "bank-transaction-audit",
  route: "/demos/bank-transaction-audit",
  workspace: {
    id: -110,
    publicId: "demo-bank-transaction-audit",
    name: "财务审计演示",
    order: 0,
  },
  sessionName: "银行流水智能核查 Demo",
  prompt: bankAuditPrompt,
  initialWorkbooks: bankAuditInitialWorkbooks,
  timeline: bankAuditTimeline,
  playback: {
    textTokenDelay: 22,
    textCompletionDelay: 200,
    toolStartDelay: 340,
    toolExecutionDuration: 720,
    stepDelay: 240,
    toolStepDelay: 380,
    restartDelay: 20,
  },
};
