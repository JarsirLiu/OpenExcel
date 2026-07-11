import { EditorContent } from "@tiptap/react";
import {
  type ChangeEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { t } from "@/lib/i18n";
import styles from "./ChatComposer.module.css";
import { useChatComposer } from "./useChatComposer";

export type ChatComposerHandle = {
  restoreDraft: (text: string) => void;
};

type ChatComposerProps = {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  workspaceId: number;
};

const SendIcon = () => (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const StopIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

const AttachIcon = () => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

const PLACEHOLDERS = ["使用 @ 来引用表格", "让 AI 来帮你修改表格"];

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  { isStreaming, onSend, onStop, onAttachExcel, referenceCacheRevision, workspaceId },
  ref,
) {
  const { editor, editorText, handleSend, setText } = useChatComposer({
    isStreaming,
    onSend,
    referenceCacheRevision,
    workspaceId,
  });

  useImperativeHandle(
    ref,
    () => ({
      restoreDraft: setText,
    }),
    [setText],
  );

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [editorEmpty, setEditorEmpty] = useState(true);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setEditorEmpty(!editorText || editorText.trim() === "");
  }, [editorText]);

  const handleAttachClick = useCallback(() => {
    attachmentInputRef.current?.click();
  }, []);

  const handleAttachmentChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void onAttachExcel(file);
      }
      event.target.value = "";
    },
    [onAttachExcel],
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.inputCard}>
        <div className={styles.editorWrap}>
          <div className={styles.editorScroll}>{editor && <EditorContent editor={editor} />}</div>
          {editorEmpty && (
            <span className={styles.placeholder}>{PLACEHOLDERS[placeholderIndex]}</span>
          )}
        </div>

        <div className={styles.bottomBar}>
          <input
            ref={attachmentInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleAttachmentChange}
          />
          <button
            type="button"
            onClick={handleAttachClick}
            className={styles.attachBtn}
            title={t("upload_file", "上传文件")}
          >
            <AttachIcon />
          </button>
          <div className={styles.spacer} />
          <button
            type="button"
            onClick={() => (isStreaming ? onStop() : handleSend())}
            className={styles.sendBtn}
          >
            {isStreaming ? <StopIcon /> : <SendIcon />}
          </button>
        </div>
      </div>
      <div className={styles.disclaimer}>
        {t("ai_disclaimer", "以上内容由 AI 生成，仅供参考和借鉴")}
      </div>
    </div>
  );
});
