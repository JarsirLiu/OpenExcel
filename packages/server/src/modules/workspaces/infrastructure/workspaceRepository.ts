import { prisma } from "../../../infra/database/db.js";

export async function findWorkspaces(ownerUserId: number) {
  return prisma.workspace.findMany({
    where: { ownerUserId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
}

export async function findWorkspaceById(id: number) {
  return prisma.workspace.findUnique({
    where: { id },
    select: { id: true, publicId: true, name: true, order: true },
  });
}

export async function findWorkspace(id: number, ownerUserId: number) {
  return prisma.workspace.findFirst({
    where: { id, ownerUserId },
  });
}

export async function renameWorkspace(id: number, name: string) {
  return prisma.workspace.update({
    where: { id },
    data: { name },
  });
}

export async function countWorkspaces(ownerUserId: number) {
  return prisma.workspace.count({ where: { ownerUserId } });
}

export async function deleteWorkspace(id: number) {
  await prisma.workspace.delete({ where: { id } });
}
