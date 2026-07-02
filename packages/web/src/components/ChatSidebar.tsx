import type { SheetChangeDelta } from "@openexcel/core";
import { ChatInterface } from "./ChatInterface";

export function ChatSidebar({
  onSheetChanged,
  onUndoComplete,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onUndoComplete?: () => void;
}) {
  return (
    <div style={{ width: 360, flexShrink: 0, minWidth: 0, overflow: "hidden" }}>
      <ChatInterface onSheetChanged={onSheetChanged} onUndoComplete={onUndoComplete} />
    </div>
  );
}
