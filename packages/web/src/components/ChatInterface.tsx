import type { SheetChangeDelta } from "@openexcel/core";
import { useChatSessionWorkspace } from "../features/chat/session/useChatSessionWorkspace";
import { ChatSessionShell } from "../features/chat/session/ChatSessionShell";

export function ChatInterface({
  onSheetChanged,
  onUndoComplete,
  sheets,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onUndoComplete?: () => void;
  sheets: { workbookId: number; workbookName: string; id: number; name: string }[];
}) {
  const sessionWorkspace = useChatSessionWorkspace(onUndoComplete);

  return (
    <ChatSessionShell
      {...sessionWorkspace}
      onSheetChanged={onSheetChanged}
      sheets={sheets}
    />
  );
}
