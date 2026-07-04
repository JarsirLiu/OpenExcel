import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { fetchWorkbookReferenceCandidates } from "../../../api/workbooks";
import { createMentionSuggestion, type WorkbookSource } from "./SheetMentionList";

export function useChatComposer({
  isStreaming,
  onSend,
  referenceCacheRevision,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
  referenceCacheRevision: number;
}) {
  const editorRef = useRef<any>(null);
  const [editorText, setEditorText] = useState("");
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const isMentionOpenRef = useRef(false);
  const cachedSheetsRef = useRef<WorkbookSource[] | null>(null);
  const inflightSheetsRef = useRef<Promise<WorkbookSource[]> | null>(null);
  const cacheRevisionRef = useRef(referenceCacheRevision);

  useEffect(() => {
    if (cacheRevisionRef.current === referenceCacheRevision) return;
    cacheRevisionRef.current = referenceCacheRevision;
    cachedSheetsRef.current = null;
    inflightSheetsRef.current = null;
  }, [referenceCacheRevision]);

  const loadWorkbookSources = useCallback(async (signal: AbortSignal) => {
    if (cachedSheetsRef.current) {
      return cachedSheetsRef.current;
    }

    if (!inflightSheetsRef.current) {
      inflightSheetsRef.current = fetchWorkbookReferenceCandidates({ signal }).then((workbooks) => {
        const sheets = workbooks.flatMap((wb) =>
          wb.sheets.map((sheet) => ({
            workbookId: wb.id,
            workbookName: wb.name,
            sheetId: sheet.id,
            sheetName: sheet.name,
          })),
        );
        cachedSheetsRef.current = sheets;
        return sheets;
      }).finally(() => {
        inflightSheetsRef.current = null;
      });
    }

    return inflightSheetsRef.current;
  }, []);

  const handleSend = useCallback(() => {
    const editor = editorRef.current;
    if (isMentionOpenRef.current) return;
    const text = editor?.getText().trim() ?? "";
    if (!text || isStreaming) return;
    editor?.commands.clearContent();
    editor?.commands.focus();
    onSend(text);
  }, [isStreaming, onSend]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: createMentionSuggestion(
          loadWorkbookSources,
          {
          onOpenChange: setIsMentionOpen,
          },
        ),
      }),
    ],
    editorProps: {
      attributes: {
        class: "chat-input",
        "data-placeholder": "输入消息...",
      },
      handleKeyDown: (_, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          if (isMentionOpenRef.current) {
            return false;
          }
          event.preventDefault();
          handleSend();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      setEditorText(ed.getText());
    },
  });

  useEffect(() => {
    editorRef.current = editor ?? null;
  }, [editor]);

  useEffect(() => {
    isMentionOpenRef.current = isMentionOpen;
  }, [isMentionOpen]);

  return {
    editor,
    editorText,
    handleSend,
    isMentionOpen,
  };
}
