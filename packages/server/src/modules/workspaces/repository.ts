import { prisma } from "../../infra/db.js";

export async function findWorkspaces() {
  return prisma.workspace.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
}

export async function findWorkspace(id: number) {
  return prisma.workspace.findUnique({
    where: { id },
  });
}

export async function createWorkspace(name: string, order: number) {
  return prisma.workspace.create({
    data: { name, order },
  });
}
