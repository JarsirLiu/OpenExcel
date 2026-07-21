import { SheetNotFoundError } from "../domain/errors.js";
import * as repo from "../infrastructure/sheetRepository.js";

export type SheetSnapshotMutation = {
  workspaceId: number;
  sheetId: number;
  baseRevision: number;
  uploadedData: string;
  config?: string | null;
};

export type SheetSnapshotMutationResult = {
  baseRevision: number;
  revision: number;
};

export async function saveSheetSnapshot(
  mutation: SheetSnapshotMutation,
): Promise<SheetSnapshotMutationResult> {
  const updated = await repo.updateSheetData(
    mutation.sheetId,
    {
      uploadedData: mutation.uploadedData,
      ...(Object.hasOwn(mutation, "config") ? { config: mutation.config } : {}),
    },
    mutation.baseRevision,
    mutation.workspaceId,
  );

  if (!updated) {
    throw new SheetNotFoundError(mutation.sheetId);
  }

  return {
    baseRevision: mutation.baseRevision,
    revision: updated.revision,
  };
}
