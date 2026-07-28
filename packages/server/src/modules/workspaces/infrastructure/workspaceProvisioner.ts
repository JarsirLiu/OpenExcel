import { prisma } from "../../../infra/database/db.js";
import { generateWorkspacePublicId } from "../../../shared/utils/publicId.js";

export async function provisionWorkspaceResources(ownerUserId: number, name: string) {
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
        name,
        order: nextOrder,
      },
    });

    return workspace;
  });
}
