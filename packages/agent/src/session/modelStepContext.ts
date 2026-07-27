import type { AgentToolDefinition } from "../runtime/contracts.js";
import type { TokenContextSnapshot } from "./tokenBudget.js";

export interface ModelStepStartInput {
  messages?: unknown;
  instructions: unknown;
  activeTools: readonly string[] | undefined;
}

export interface ModelStepRequestInput {
  messages?: unknown;
}

type ModelStepContextState = TokenContextSnapshot & {
  systemPrompt?: unknown;
};

function toToolDefinitions(
  definitions: readonly AgentToolDefinition[],
  activeTools: readonly string[] | undefined,
) {
  const availableTools = definitions.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));

  if (activeTools === undefined) return availableTools;

  const activeToolNames = new Set(activeTools);
  return availableTools.filter(({ name }) => activeToolNames.has(name));
}

/** Keeps the token estimator aligned with the context actually sent per SDK step. */
export class ModelStepContext {
  private state: ModelStepContextState;

  constructor(
    messages: unknown,
    systemPrompt: unknown,
    private readonly toolDefinitions: readonly AgentToolDefinition[],
  ) {
    this.state = {
      messages,
      systemPrompt,
      toolDefinitions: toToolDefinitions(toolDefinitions, undefined),
    };
  }

  startStep(input: ModelStepStartInput): TokenContextSnapshot {
    this.state = {
      ...this.state,
      ...(input.messages !== undefined ? { messages: input.messages } : {}),
      systemPrompt: input.instructions,
      toolDefinitions: toToolDefinitions(this.toolDefinitions, input.activeTools),
    };
    return this.snapshot();
  }

  finishStep(input: ModelStepRequestInput): TokenContextSnapshot {
    if (input.messages !== undefined) {
      this.state = { ...this.state, messages: input.messages };
    }
    return this.snapshot();
  }

  snapshot(): TokenContextSnapshot {
    return {
      messages: this.state.messages,
      systemPrompt: this.state.systemPrompt,
      toolDefinitions: this.state.toolDefinitions,
    };
  }
}
