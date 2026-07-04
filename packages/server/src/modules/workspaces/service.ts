import { prisma } from "../../infra/db.js";
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

export async function getWorkspaces() {
  return repo.findWorkspaces();
}

export async function getWorkspace(id: number) {
  return repo.findWorkspace(id);
}

export async function requireWorkspace(id: number) {
  const workspace = await repo.findWorkspace(id);
  if (!workspace) {
    throw new WorkspaceNotFoundError();
  }
  return workspace;
}

export async function createWorkspace(name?: string) {
  const workspaceName = name?.trim() || "新工作区";

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.workspace.aggregate({
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const workspace = await tx.workspace.create({
      data: {
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
          name: initialSheet.name,
          order: initialSheet.order,
        },
      },
      session,
    };
  });
}
