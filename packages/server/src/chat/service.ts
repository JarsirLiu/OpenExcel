import * as repo from "./repository.js";
import * as model from "./model.js";
import * as context from "./context.js";
import * as rollout from "./rollout.js";
import { excelTools } from "./tools/index.js";
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

export async function renameSession(sessionId: number, name: string) {
  return repo.updateSession(sessionId, { name });
}

export async function getMessages(sessionId: number) {
  const runs = await repo.findRunsBySession(sessionId);
  const transcript: { id: string; role: "user" | "assistant"; content: string; reasoning?: string }[] = [];
  for (const run of runs) {
    const steps = await repo.findStepsByRun(run.id);
    transcript.push({ id: `run-${run.id}-user`, role: "user", content: run.inputText ?? "" });

    const reasoningStep = steps.find((s) => s.type === "reasoning");
    const finalStep = steps.find((s) => s.type === "final");
    const reasoning = reasoningStep?.content ?? undefined;
    const final = finalStep?.content ?? "";
    if (reasoning || final) {
      transcript.push({ id: `run-${run.id}-assistant`, role: "assistant", content: final, reasoning });
    }
  }
  return transcript.filter((m) => m.content.length > 0 || m.reasoning);
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
  const workplaceContext = await context.buildWorkplaceContext();
  const systemPrompt = context.buildSystemPrompt(workplaceContext);
  const ctx = await rollout.initRun(sessionId, inputText, systemPrompt);

  const stream = model.streamChat({
    systemPrompt,
    messages: [...history, { role: "user", content: inputText }],
    tools: excelTools,
    abortSignal,
    onChunk: rollout.onChunk(ctx),
    onFinish: rollout.onFinish(ctx),
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
        push("step.started", { runId: ctx.runId, stepType: "tool_call", toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input });
        continue;
      }
      if (chunk.type === "tool-result") {
        push("step.completed", { runId: ctx.runId, stepType: "tool_result", toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input, output: chunk.output });

        const input = chunk.input ?? {};
        const output = chunk.output ?? {};

        if (chunk.toolName === "writeCells" && input.cells) {
          push("sheet.changed", { sheetId: input.sheetId, delta: { type: "write", cells: input.cells, merges: output.preview?.merges ?? [] } });
        } else if ((chunk.toolName === "mergeCells" || chunk.toolName === "unmergeCells") && input.startRow !== undefined) {
          push("sheet.changed", {
            sheetId: input.sheetId,
            delta: { type: chunk.toolName === "mergeCells" ? "merge" : "unmerge", range: { startRow: input.startRow, startCol: input.startCol, endRow: input.endRow, endCol: input.endCol } },
          });
        }
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

    if (abortSignal?.aborted) {
      await rollout.markAborted(ctx);
      push("run.aborted", { runId: ctx.runId });
      return;
    }

    if (finalStarted) {
      push("step.completed", { runId: ctx.runId, stepType: "final" });
    } else if (reasoningStarted) {
      push("step.completed", { runId: ctx.runId, stepType: "reasoning" });
    }

    const title = runs.length === 0 ? await model.generateTitle(inputText).catch(() => null) : null;
    if (title) {
      await repo.updateSession(sessionId, { name: title });
    }

    push("run.completed", { runId: ctx.runId, title: title ?? undefined });
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
