import type { SheetChangeDelta } from "@openexcel/core";
import { ChatInterface } from "./ChatInterface";
import type { WorkbookStructureUpdate } from "./hooks/useSheetPatchSync";

export function ChatSidebar({
  onSheetChanged,
  onWorkbookStructureChanged,
  onUndoComplete,
  sheets,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onUndoComplete?: () => void;
  sheets: { workbookId: number; workbookName: string; id: number; name: string }[];
}) {
  return (
    <div style={{ width: 360, flexShrink: 0, minWidth: 0, overflow: "hidden" }}>
      <ChatInterface
        onSheetChanged={onSheetChanged}
        onWorkbookStructureChanged={onWorkbookStructureChanged}
        onUndoComplete={onUndoComplete}
        sheets={sheets}
      />
    </div>
  );
}
