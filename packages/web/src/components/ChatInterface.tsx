import type { SheetChangeDelta } from "@openexcel/core";
import { useSessionWorkspace } from "../features/session/useSessionWorkspace";
import { SessionShell } from "../features/session/SessionShell";

export function ChatInterface({
  onSheetChanged,
  onUndoComplete,
  sheets,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onUndoComplete?: () => void;
  sheets: { workbookId: number; workbookName: string; id: number; name: string }[];
}) {
  const sessionWorkspace = useSessionWorkspace(onUndoComplete);

  return (
    <SessionShell
      {...sessionWorkspace}
      onSheetChanged={onSheetChanged}
      sheets={sheets}
    />
  );
}
