import * as repo from "./repository.js";

export interface RolloutContext {
  runId: number;
  reasoningStepId: number;
  finalStepId: number;
  state: {
    reasoningText: string;
    finalText: string;
    toolCallSteps: Map<string, number>;
    toolResultSteps: Map<string, number>;
  };
}

export async function initRun(sessionId: number, inputText: string, systemPrompt: string): Promise<RolloutContext> {
  const run = await repo.createRun({ sessionId, status: "running", systemPrompt, inputText });

  const reasoningStep = await repo.createStep({
    runId: run.id,
    type: "reasoning",
    status: "streaming",
    content: "",
    order: 0,
  });

  const finalStep = await repo.createStep({
    runId: run.id,
    type: "final",
    status: "streaming",
    content: "",
    order: 1,
  });

  return {
    runId: run.id,
    reasoningStepId: reasoningStep.id,
    finalStepId: finalStep.id,
    state: {
      reasoningText: "",
      finalText: "",
      toolCallSteps: new Map(),
      toolResultSteps: new Map(),
    },
  };
}

export function onChunk(ctx: RolloutContext) {
  return async (chunk: any): Promise<void> => {
    if (chunk.type === "reasoning-delta") {
      ctx.state.reasoningText += chunk.text;
    }

    if (chunk.type === "text-delta") {
      ctx.state.finalText += chunk.text;
    }

    if (chunk.type === "tool-call") {
      const step = await repo.createStep({
        runId: ctx.runId,
        type: "tool_call",
        status: "completed",
        toolName: chunk.toolName,
        input: JSON.stringify(chunk.input),
        order: 2 + ctx.state.toolCallSteps.size * 2,
      });
      ctx.state.toolCallSteps.set(chunk.toolCallId, step.id);
    }

    if (chunk.type === "tool-result") {
      if (!ctx.state.toolResultSteps.has(chunk.toolCallId)) {
        const step = await repo.createStep({
          runId: ctx.runId,
          type: "tool_result",
          status: "completed",
          toolName: chunk.toolName,
          input: JSON.stringify(chunk.input),
          output: JSON.stringify(chunk.output),
          order: 3 + ctx.state.toolResultSteps.size * 2,
        });
        ctx.state.toolResultSteps.set(chunk.toolCallId, step.id);
      }
    }
  };
}

export function onFinish(ctx: RolloutContext) {
  return async (result: any): Promise<void> => {
    const finalText = result.text ?? ctx.state.finalText;
    await repo.updateStep(ctx.reasoningStepId, { content: ctx.state.reasoningText, status: "completed" });
    await repo.updateStep(ctx.finalStepId, { content: finalText, status: "completed" });
    await repo.updateRun(ctx.runId, { outputText: finalText, status: "completed", endedAt: new Date() });
  };
}

export function onAbort(ctx: RolloutContext) {
  return async (): Promise<void> => {
    await repo.updateRun(ctx.runId, { status: "aborted", endedAt: new Date() });
  };
}

export async function markFailed(ctx: RolloutContext, msg: string): Promise<void> {
  await repo.updateRun(ctx.runId, { status: "failed", errorMessage: msg, endedAt: new Date() });
}