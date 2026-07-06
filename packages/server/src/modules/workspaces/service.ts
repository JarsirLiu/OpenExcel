import { prisma } from "../../infra/database/db.js";
import * as repo from "./repository.js";
import { buildBlankSheetInitialization, normalizeWorkbookName } from "../workbooks/create/creation.js";

export class WorkspaceNotFoundError extends Error {
  statusCode: number;

  constructor(message = "Workspace not found", statusCode = 404) {
    super(message);
    this.name = "WorkspaceNotFoundError";
    this.statusCode = statusCode;
  }
}

export async function getWorkspaces(ownerUserId: number) {
  return repo.findWorkspaces(ownerUserId);
}

export async function getWorkspace(id: number, ownerUserId: number) {
  return repo.findWorkspace(id, ownerUserId);
}

export async function requireWorkspace(id: number, ownerUserId: number) {
  const workspace = await repo.findWorkspace(id, ownerUserId);
  if (!workspace) {
    throw new WorkspaceNotFoundError();
  }
  return workspace;
}

export async function ensureWorkspaceForUser(ownerUserId: number) {
  const workspaces = await repo.findWorkspaces(ownerUserId);
  if (workspaces.length > 0) {
    return workspaces[0];
  }

  return createWorkspace(ownerUserId);
}

export async function createWorkspace(ownerUserId: number, name?: string) {
  const workspaceName = name?.trim() || "新工作区";

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.workspace.aggregate({
      where: { ownerUserId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const workspace = await tx.workspace.create({
      data: {
        ownerUserId,
        name: workspaceName,
        order: nextOrder,
      },
    });

    const workbook = await tx.workbook.create({
      data: {
        workspaceId: workspace.id,
        name: normalizeWorkbookName(),
        order: 0,
      },
    });

    const sheetInitialization = buildBlankSheetInitialization();
    const initialSheet = await tx.sheet.create({
      data: {
        workbookId: workbook.id,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: sheetInitialization.columns,
        merges: sheetInitialization.merges,
        uploadedData: sheetInitialization.uploadedData,
        config: sheetInitialization.config ?? null,
      },
    });

    const session = await tx.session.create({
      data: {
        workspaceId: workspace.id,
        name: "新对话",
        sheetId: null,
      },
    });

    return {
      workspace,
      workbook: {
        id: workbook.id,
        name: workbook.name,
        order: workbook.order,
        sheets: 1,
        initialSheet: {
          id: initialSheet.id,
          sheetNo: initialSheet.sheetNo,
          name: initialSheet.name,
          order: initialSheet.order,
        },
      },
      session,
    };
  });
}
