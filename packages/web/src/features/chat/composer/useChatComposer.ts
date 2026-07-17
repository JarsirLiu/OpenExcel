import type { ChatReferenceTarget } from "@openexcel/chat-contracts";
import Mention from "@tiptap/extension-mention";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWorkbookReferenceCandidates } from "@/api/workbooks";
import { extractChatReferences } from "./chatReferences";
import { createMentionSuggestion, type WorkbookSource } from "./SheetMentionList";

export function useChatComposer({
  isStreaming,
  isSendDisabled = false,
  onSend,
  referenceCacheRevision,
  workspaceId,
}: {
  isStreaming: boolean;
  isSendDisabled?: boolean;
  onSend: (text: string, references: ChatReferenceTarget[]) => void;
  referenceCacheRevision: number;
  workspaceId: number;
}) {
  const editorRef = useRef<any>(null);
  const [editorText, setEditorText] = useState("");
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const isMentionOpenRef = useRef(false);
  const pendingTextRef = useRef<string | null>(null);
  const cachedSheetsRef = useRef<WorkbookSource[] | null>(null);
  const inflightSheetsRef = useRef<Promise<WorkbookSource[]> | null>(null);
  const cacheRevisionRef = useRef(referenceCacheRevision);

  useEffect(() => {
    if (cacheRevisionRef.current === referenceCacheRevision) return;
    cacheRevisionRef.current = referenceCacheRevision;
    cachedSheetsRef.current = null;
    inflightSheetsRef.current = null;
  }, [referenceCacheRevision]);

  const loadWorkbookSources = useCallback(
    async (signal: AbortSignal) => {
      if (cachedSheetsRef.current) {
        return cachedSheetsRef.current;
      }

      if (!inflightSheetsRef.current) {
        inflightSheetsRef.current = fetchWorkbookReferenceCandidates(workspaceId, { signal })
          .then((workbooks) => {
            const sheets = workbooks.flatMap((wb) =>
              wb.sheets.map((sheet) => ({
                workbookId: wb.id,
                workbookName: wb.name,
                sheetId: sheet.id,
                sheetNo: sheet.sheetNo,
                sheetName: sheet.name,
              })),
            );
            cachedSheetsRef.current = sheets;
            return sheets;
          })
          .finally(() => {
            inflightSheetsRef.current = null;
          });
      }

      return inflightSheetsRef.current;
    },
    [workspaceId],
  );

  const handleSend = useCallback(() => {
    const editor = editorRef.current;
    if (isMentionOpenRef.current) return;
    const text = editor?.getText().trim() ?? "";
    if (!text || isStreaming || isSendDisabled) return;
    const references = extractChatReferences(editor?.getJSON());
    editor?.commands.clearContent();
    editor?.commands.focus();
    onSend(text, references);
  }, [isSendDisabled, isStreaming, onSend]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: createMentionSuggestion(loadWorkbookSources, {
          onOpenChange: setIsMentionOpen,
        }),
      }),
    ],
    editorProps: {
      attributes: {
        class: "chat-input",
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

  const setText = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor) {
      pendingTextRef.current = text;
      return;
    }
    editor.commands.clearContent();
    if (text.length > 0) {
      editor.commands.insertContent(text);
    }
    editor.commands.focus();
  }, []);

  // 当编辑器就绪或收到显式恢复指令时，填入输入框
  useEffect(() => {
    if (!editor || pendingTextRef.current == null) {
      return;
    }

    const nextText = pendingTextRef.current;
    pendingTextRef.current = null;
    setText(nextText);
  }, [editor, setText]);

  return {
    editor,
    editorText,
    handleSend,
    setText,
    isMentionOpen,
  };
}
