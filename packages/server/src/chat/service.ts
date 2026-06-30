import * as repo from "./repository.js";
import * as model from "./model.js";
import * as context from "./context.js";
import * as rollout from "./rollout.js";
import type { Push } from "./stream.js";

export async function getSessions() {
  return repo.findGlobalSessions();
}

export async function ensureSession() {
  return repo.ensureGlobalSession();
}

export async function createSession() {
  return repo.createSession("新对话");
}

export async function deleteSession(sessionId: number) {
  return repo.deleteSession(sessionId);
}

export async function getMessages(sessionId: number) {
  const runs = await repo.findRunsBySession(sessionId);
  const transcript: { id: string; role: "user" | "assistant"; content: string }[] = [];
  for (const run of runs) {
    const steps = await repo.findStepsByRun(run.id);
    transcript.push({ id: `run-${run.id}-user`, role: "user", content: run.inputText ?? "" });
    for (const step of steps) {
      if (step.type === "reasoning" && step.content) {
        transcript.push({ id: `step-${step.id}`, role: "assistant", content: step.content });
      }
      if (step.type === "tool_call" && step.toolName) {
        transcript.push({ id: `step-${step.id}`, role: "assistant", content: `tool_call: ${step.toolName} ${step.input ?? ""}` });
      }
      if (step.type === "tool_result" && step.output) {
        transcript.push({ id: `step-${step.id}`, role: "assistant", content: `tool_result: ${step.output}` });
      }
      if (step.type === "final" && step.content) {
        transcript.push({ id: `step-${step.id}`, role: "assistant", content: step.content });
      }
    }
  }
  return transcript.filter((m) => m.content.length > 0);
}

export async function chat(
  sessionId: number,
  inputText: string,
  abortSignal: AbortSignal | undefined,
  push: Push,
): Promise<void> {
  const session = await repo.findSession(sessionId);
  if (!session) throw new Error("Session not found");

  const runs = await repo.findRunsBySession(sessionId);
  const history = context.historyFromRuns(runs);
  const systemPrompt = context.buildSystemPrompt();
  const ctx = await rollout.initRun(sessionId, inputText, systemPrompt);

  const stream = model.streamChat({
    systemPrompt,
    messages: [...history, { role: "user", content: inputText }],
    tools: {},
    abortSignal,
    onChunk: rollout.onChunk(ctx),
    onFinish: rollout.onFinish(ctx),
    onAbort: rollout.onAbort(ctx),
  });

  push("run.started", { runId: ctx.runId });

  let reasoningStarted = false;
  let finalStarted = false;

  try {
    for await (const chunk of stream.fullStream) {
      if (chunk.type === "reasoning-delta") {
        if (!reasoningStarted) {
          push("step.started", { runId: ctx.runId, stepType: "reasoning" });
          reasoningStarted = true;
        }
        push("step.delta", { runId: ctx.runId, stepType: "reasoning", text: chunk.text });
        continue;
      }
      if (chunk.type === "tool-call") {
        push("step.started", { runId: ctx.runId, stepType: "tool_call", toolName: chunk.toolName, input: chunk.input });
        continue;
      }
      if (chunk.type === "tool-result") {
        push("step.completed", { runId: ctx.runId, stepType: "tool_result", toolName: chunk.toolName, input: chunk.input, output: chunk.output });
        continue;
      }
      if (chunk.type === "text-delta") {
        if (!finalStarted) {
          if (reasoningStarted) {
            push("step.completed", { runId: ctx.runId, stepType: "reasoning" });
          }
          push("step.started", { runId: ctx.runId, stepType: "final" });
          finalStarted = true;
        }
        push("step.delta", { runId: ctx.runId, stepType: "final", text: chunk.text });
        continue;
      }
    }

    if (finalStarted) {
      push("step.completed", { runId: ctx.runId, stepType: "final" });
    } else if (reasoningStarted) {
      push("step.completed", { runId: ctx.runId, stepType: "reasoning" });
    }
    push("run.completed", { runId: ctx.runId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (abortSignal?.aborted) {
      await rollout.markAborted(ctx);
      push("run.aborted", { runId: ctx.runId });
      return;
    }
    await rollout.markFailed(ctx, msg);
    push("run.failed", { error: msg, runId: ctx.runId });
  }
}
