import type { DemoDefinition } from "../../runtime/replayTypes";
import { bankAuditInitialWorkbooks, bankAuditPrompt, bankAuditTimeline } from "./fixtures";

export const bankTransactionAuditDemo: DemoDefinition = {
  id: "bank-transaction-audit",
  route: "/demos/bank-transaction-audit",
  marketing: {
    category: "财务",
    marketingTitle: "银行流水智能核查",
    summary: "从数百条流水中定位重复、大额、字段缺失和余额不连续，把异常直接写回核查表。",
    coverImage: "/demo-covers/bank-audit.webp",
    coverAlt: "财务人员使用计算器核对账单和现金记录",
    proofMetric: "4 类异常 · 自动复核",
    featuredOrder: 2,
    theme: "sand",
  },
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
