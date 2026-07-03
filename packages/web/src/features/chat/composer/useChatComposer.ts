import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { createMentionSuggestion } from "./SheetMentionList";

type SheetMeta = { workbookId: number; workbookName: string; id: number; name: string };

export function useChatComposer({
  sheets,
  isStreaming,
  onSend,
}: {
  sheets: SheetMeta[];
  isStreaming: boolean;
  onSend: (text: string) => void;
}) {
  const editorRef = useRef<any>(null);
  const [editorText, setEditorText] = useState("");
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const isMentionOpenRef = useRef(false);
  const sheetsRef = useRef(sheets);

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
          () => sheetsRef.current.map((sheet) => ({
            workbookId: sheet.workbookId,
            workbookName: sheet.workbookName,
            sheetId: sheet.id,
            sheetName: sheet.name,
          })),
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

  useEffect(() => {
    sheetsRef.current = sheets;
  }, [sheets]);

  return {
    editor,
    editorText,
    handleSend,
    isMentionOpen,
  };
}
