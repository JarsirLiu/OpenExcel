import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import * as repo from "./repository.js";

type ChatMessageLike = {
  role?: unknown;
  content?: unknown;
  parts?: ReadonlyArray<unknown> | null;
};

type UndoableRunStep = {
  toolName?: string | null;
  input?: string | null;
  output?: string | null;
  order: number;
};

type StructuralUndoEffect =
  | {
      kind: "createWorkbook";
      workbookId: number;
      initialSheetId: number;
      order: number;
    }
  | {
      kind: "createSheet";
      workbookId: number;
      sheetId: number;
      order: number;
    };

function parseJson<T>(value: string | null | undefined, errorMessage: string): T {
  if (value == null || value === "") {
    throw new Error(errorMessage);
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(errorMessage);
  }
}

function extractMessageText(message: ChatMessageLike): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (!Array.isArray(message.parts)) {
    return "";
  }

  return message.parts
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("");
}

function findLatestUserMessageIndex(messages: ChatMessageLike[], userText: string): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (extractMessageText(message).trim() === userText.trim()) {
      return index;
    }
  }

  return -1;
}

function trimMessagesAfterUserTurn(
  messages: ChatMessageLike[],
  userText: string,
): ChatMessageLike[] {
  const turnStartIndex = findLatestUserMessageIndex(messages, userText);
  if (turnStartIndex < 0) {
    throw new Error("会话记录与运行输入不一致，无法撤销");
  }

  return messages.slice(0, turnStartIndex);
}

function parseStructuralUndoEffects(steps: UndoableRunStep[]): StructuralUndoEffect[] {
  const effects: StructuralUndoEffect[] = [];

  for (const step of steps) {
    const toolNames =
      typeof step.toolName === "string"
        ? step.toolName
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean)
        : [];

    if (toolNames.includes("createWorkbook")) {
      const output = parseJson<{
        id: number;
        initialSheet: { id: number };
      }>(step.output, "运行记录中的 createWorkbook 输出损坏，无法撤销");

      effects.push({
        kind: "createWorkbook",
        workbookId: output.id,
        initialSheetId: output.initialSheet.id,
        order: step.order,
      });
      continue;
    }

    if (toolNames.includes("createSheet")) {
      const output = parseJson<{
        workbookId: number;
        id: number;
      }>(step.output, "运行记录中的 createSheet 输出损坏，无法撤销");

      effects.push({
        kind: "createSheet",
        workbookId: output.workbookId,
        sheetId: output.id,
        order: step.order,
      });
    }
  }

  return effects;
}

async function restoreSheetSnapshots(
  tx: Prisma.TransactionClient,
  runId: number,
  excludedSheetIds: Set<number>,
): Promise<number[]> {
  const snapshots = await tx.agentRunSheetSnapshot.findMany({
    where: { runId },
    orderBy: { id: "asc" },
  });

  const restoredSheetIds: number[] = [];
  for (const snapshot of snapshots) {
    if (excludedSheetIds.has(snapshot.sheetId)) {
      continue;
    }

    restoredSheetIds.push(snapshot.sheetId);
    await tx.sheet.update({
      where: { id: snapshot.sheetId },
      data: {
        uploadedData: snapshot.uploadedData,
        config: snapshot.config,
      },
    });
  }

  await tx.agentRunSheetSnapshot.deleteMany({
    where: { runId },
  });

  return restoredSheetIds;
}

async function deleteSheetAndReindex(
  tx: Prisma.TransactionClient,
  workbookId: number,
  sheetId: number,
  workspaceId: number,
) {
  const workbook = await tx.workbook.findFirst({
    where: { id: workbookId, workspaceId },
    select: { id: true },
  });
  if (!workbook) {
    throw new Error(`Workbook ${workbookId} 不存在`);
  }

  await tx.sheet.delete({ where: { id: sheetId } });

  const sheets = await tx.sheet.findMany({
    where: { workbookId },
    orderBy: { order: "asc" },
  });

  for (let index = 0; index < sheets.length; index += 1) {
    const sheet = sheets[index];
    await tx.sheet.update({
      where: { id: sheet.id },
      data: {
        order: index,
        sheetNo: index + 1,
      },
    });
  }
}

export async function undoLatestRun(workspaceId: number, sessionId: number) {
  const run = await repo.findLatestUndoableRun(workspaceId, sessionId);
  if (!run) {
    throw new Error("没有可撤销的本轮修改");
  }

  const structuralEffects = parseStructuralUndoEffects(run.steps as UndoableRunStep[]);
  const createdWorkbookEffects = structuralEffects.filter(
    (effect): effect is Extract<StructuralUndoEffect, { kind: "createWorkbook" }> =>
      effect.kind === "createWorkbook",
  );
  const createdSheetEffects = structuralEffects.filter(
    (effect): effect is Extract<StructuralUndoEffect, { kind: "createSheet" }> =>
      effect.kind === "createSheet",
  );
  const createdWorkbookIds = new Set(createdWorkbookEffects.map((effect) => effect.workbookId));
  const createdSheetIds = new Set<number>(
    createdWorkbookEffects.map((effect) => effect.initialSheetId),
  );

  for (const effect of createdSheetEffects) {
    if (createdWorkbookIds.has(effect.workbookId)) {
      continue;
    }
    createdSheetIds.add(effect.sheetId);
  }

  const transcriptInputText = run.inputText?.trim() ?? "";
  if (!transcriptInputText) {
    throw new Error("运行记录缺少用户输入，无法撤销");
  }

  const restoredSheetIds = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: sessionId, workspaceId },
      select: { id: true, chatMessages: true },
    });
    if (!session) {
      throw new Error("Session not found");
    }

    const messages = parseJson<ChatMessageLike[]>(
      session.chatMessages ?? "[]",
      "会话消息记录损坏，无法撤销",
    );
    const restoredMessages = trimMessagesAfterUserTurn(messages, transcriptInputText);

    const restoredSheetIds = await restoreSheetSnapshots(tx, run.id, createdSheetIds);

    for (const effect of createdSheetEffects.slice().reverse()) {
      if (createdWorkbookIds.has(effect.workbookId)) {
        continue;
      }

      await deleteSheetAndReindex(tx, effect.workbookId, effect.sheetId, workspaceId);
    }

    for (const effect of createdWorkbookEffects.slice().reverse()) {
      await tx.workbook.delete({ where: { id: effect.workbookId } });
    }

    await tx.session.update({
      where: { id: session.id },
      data: {
        chatMessages: JSON.stringify(restoredMessages),
      },
    });

    await tx.agentRun.update({
      where: { id: run.id },
      data: {
        status: "reverted",
        revertedAt: new Date(),
      },
    });

    return restoredSheetIds;
  });

  return {
    runId: run.id,
    restoredSheetIds,
    undoneUserText: transcriptInputText,
  };
}
