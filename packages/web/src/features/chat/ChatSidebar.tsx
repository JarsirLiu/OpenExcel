import type { SheetChangeDelta } from "@openexcel/core";
import { ChatInterface } from "./ChatInterface";
import type { WorkbookStructureUpdate } from "./hooks/useSheetPatchSync";

type CurrentUser = {
  email: string;
  displayName: string;
};

export function ChatSidebar({
  onSheetChanged,
  onWorkbookStructureChanged,
  onUndoComplete,
  onAttachExcel,
  referenceCacheRevision,
  workspaceId,
  currentUser,
  onLogout,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onUndoComplete?: () => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  workspaceId: number | null;
  currentUser: CurrentUser;
  onLogout: () => void;
}) {
  return (
    <div style={{ width: "min(400px, 32vw)", flexShrink: 0, minWidth: 0, overflow: "hidden" }}>
      <ChatInterface
        onSheetChanged={onSheetChanged}
        onWorkbookStructureChanged={onWorkbookStructureChanged}
        onUndoComplete={onUndoComplete}
        onAttachExcel={onAttachExcel}
        referenceCacheRevision={referenceCacheRevision}
        workspaceId={workspaceId}
        currentUser={currentUser}
        onLogout={onLogout}
      />
    </div>
  );
}
