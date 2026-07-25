import type { Prisma } from "../../../infra/database/prismaTypes.js";

export async function findChartMutationReceipt(
  tx: Prisma.TransactionClient,
  mutationId: string,
  commandHash: string,
) {
  const receipt = await tx.chartMutationReceipt.findUnique({ where: { mutationId } });
  if (!receipt) return null;
  if (receipt.commandHash !== commandHash) {
    throw new Error(`Chart mutation ${mutationId} was reused with different input`);
  }
  return JSON.parse(receipt.result) as unknown;
}

export async function recordChartMutationReceipt(
  tx: Prisma.TransactionClient,
  data: {
    mutationId: string;
    commandHash: string;
    mutation: string;
    chartId: string;
    result: unknown;
  },
) {
  return tx.chartMutationReceipt.create({
    data: {
      mutationId: data.mutationId,
      commandHash: data.commandHash,
      mutation: data.mutation,
      chartId: data.chartId,
      result: JSON.stringify(data.result),
    },
  });
}
