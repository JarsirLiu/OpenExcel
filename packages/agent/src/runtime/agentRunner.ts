import { buildSystemPrompt } from "../prompt/systemPrompt.js";
import { buildWorkspaceContext } from "../session/context.js";
import { buildExcelToolCatalog } from "../tools/catalog.js";
import { runAgentLoop } from "./agentLoop.js";
import type { AgentRunnerInput, AgentRunResult } from "./contracts.js";

export class AgentRunner {
  constructor(private readonly input: AgentRunnerInput) {}

  run(): Promise<AgentRunResult> {
    const { transcript, workspace, ...loopInput } = this.input;
    const systemPrompt = buildSystemPrompt(
      buildWorkspaceContext(workspace),
      buildExcelToolCatalog(),
    );

    return runAgentLoop({
      ...loopInput,
      transcript,
      systemPrompt,
    });
  }
}

export function createAgentRunner(input: AgentRunnerInput): AgentRunner {
  return new AgentRunner(input);
}

export type { AgentRunnerInput } from "./contracts.js";
