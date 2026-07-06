import { prisma } from "../../infra/database/db.js";
import * as repo from "./repository.js";
import { buildBlankSheetInitialization, normalizeWorkbookName } from "../workbooks/create/creation.js";
import { generateWorkspacePublicId, generateWorkbookPublicId, generateSessionPublicId } from "../../shared/utils/publicId.js";

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

export async function getWorkspaceById(id: number) {
  return repo.findWorkspaceById(id);
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
  const workspaceName = name?.trim() || "新项目";

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.workspace.aggregate({
      where: { ownerUserId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const workspace = await tx.workspace.create({
      data: {
        publicId: generateWorkspacePublicId(),
        ownerUserId,
        name: workspaceName,
        order: nextOrder,
      },
    });

    const workbook = await tx.workbook.create({
      data: {
        publicId: generateWorkbookPublicId(),
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
        publicId: generateSessionPublicId(),
        workspaceId: workspace.id,
        name: "新对话",
        sheetId: null,
      },
    });

    return {
      workspace,
      workbook: {
        id: workbook.id,
        publicId: workbook.publicId,
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

export async function renameWorkspace(id: number, ownerUserId: number, name: string) {
  const trimmed = name?.trim();
  if (!trimmed) {
    throw new WorkspaceNotFoundError("Name is required", 400);
  }
  const workspace = await repo.findWorkspace(id, ownerUserId);
  if (!workspace) {
    throw new WorkspaceNotFoundError();
  }
  return prisma.workspace.update({
    where: { id },
    data: { name: trimmed },
  });
}

export async function deleteWorkspace(id: number, ownerUserId: number) {
  const workspace = await repo.findWorkspace(id, ownerUserId);
  if (!workspace) {
    throw new WorkspaceNotFoundError();
  }
  const count = await prisma.workspace.count({ where: { ownerUserId } });
  if (count <= 1) {
    throw new WorkspaceNotFoundError("Cannot delete the last workspace", 400);
  }
  await prisma.workspace.delete({ where: { id } });
  return { success: true };
}
