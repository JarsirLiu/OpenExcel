import { useEffect, useRef, useState, useCallback } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { createMentionSuggestion } from "../../../components/SheetMentionList";

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

  const handleSend = useCallback(() => {
    const editor = editorRef.current;
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
        suggestion: createMentionSuggestion(sheets),
      }),
    ],
    editorProps: {
      attributes: {
        class: "chat-input",
        "data-placeholder": "输入消息...",
      },
      handleKeyDown: (_, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
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

  return {
    editor,
    editorText,
    handleSend,
  };
}
