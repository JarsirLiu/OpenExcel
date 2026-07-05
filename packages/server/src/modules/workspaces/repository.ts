import { prisma } from "../../infra/db.js";

export async function findWorkspaces(ownerUserId: number) {
  return prisma.workspace.findMany({
    where: { ownerUserId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
}

export async function findWorkspace(id: number, ownerUserId: number) {
  return prisma.workspace.findFirst({
    where: { id, ownerUserId },
  });
}
