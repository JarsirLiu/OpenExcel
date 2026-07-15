import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import styles from "./WorkbookHeader.module.css";

const FileIcon = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

type WorkbookTab = {
  id: number;
  publicId: string;
  name: string;
};

interface Props {
  workbooks: WorkbookTab[];
  activeWorkbookIdx: number;
  onSwitchWorkbook: (index: number) => void;
  onUploadNewWorkbookClick: () => void;
  onWorkbookRename?: (workbookId: number, newName: string) => Promise<void>;
}

export function WorkbookHeader({
  workbooks,
  activeWorkbookIdx,
  onSwitchWorkbook,
  onUploadNewWorkbookClick,
  onWorkbookRename,
}: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIdx != null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIdx]);

  const startEditing = useCallback(
    (index: number) => {
      setEditingIdx(index);
      setEditValue(workbooks[index]?.name ?? "");
    },
    [workbooks],
  );

  const finishEditing = useCallback(
    (index: number) => {
      const wb = workbooks[index];
      if (!wb) {
        setEditingIdx(null);
        return;
      }
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== wb.name && onWorkbookRename) {
        void onWorkbookRename(wb.id, trimmed);
      }
      setEditingIdx(null);
    },
    [editValue, workbooks, onWorkbookRename],
  );

  const cancelEditing = useCallback(() => {
    setEditingIdx(null);
  }, []);

  return (
    <div className={styles.header}>
      <div className={styles.tabList}>
        {workbooks.map((wb, i) =>
          editingIdx === i ? (
            <div key={wb.id} className={`${styles.tab} ${styles.tabActive}`} onClick={() => {}}>
              <input
                ref={inputRef}
                className={styles.renameInput}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finishEditing(i);
                  else if (e.key === "Escape") cancelEditing();
                }}
                onBlur={() => finishEditing(i)}
              />
            </div>
          ) : (
            <div
              key={wb.id}
              onClick={() => onSwitchWorkbook(i)}
              onDoubleClick={() => startEditing(i)}
              className={`${styles.tab} ${i === activeWorkbookIdx ? styles.tabActive : styles.tabInactive}`}
            >
              {wb.name}
            </div>
          ),
        )}
      </div>
      <div className={styles.actions}>
        <button onClick={onUploadNewWorkbookClick} className={styles.pillBtn}>
          <FileIcon /> {t("upload", "上传Excel")}
        </button>
      </div>
    </div>
  );
}
