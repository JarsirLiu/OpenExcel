import { t } from "@/lib/i18n";
import styles from "./WorkbookHeader.module.css";

const UploadIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const FileIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

type WorkbookTab = {
  id: number;
  name: string;
};

interface Props {
  workbooks: WorkbookTab[];
  activeWorkbookIdx: number;
  status: string;
  onSwitchWorkbook: (index: number) => void;
  onUploadClick: () => void;
  onUploadNewWorkbookClick: () => void;
}

export function WorkbookHeader({
  workbooks,
  activeWorkbookIdx,
  status,
  onSwitchWorkbook,
  onUploadClick,
  onUploadNewWorkbookClick,
}: Props) {
  return (
    <div className={styles.header}>
      <div className={styles.tabList}>
        {workbooks.map((wb, i) => (
          <div
            key={wb.id}
            onClick={() => onSwitchWorkbook(i)}
            className={`${styles.tab} ${i === activeWorkbookIdx ? styles.tabActive : styles.tabInactive}`}
          >
            {wb.name}
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <button onClick={onUploadClick} className={styles.pillBtn}>
          <UploadIcon /> {t("import", "导入")}
        </button>
        <button onClick={onUploadNewWorkbookClick} className={styles.pillBtn}>
          <FileIcon /> {t("upload", "上传")}
        </button>
        {status && (
          <span className={`${styles.status} ${status.includes("失败") ? styles.statusError : styles.statusOk}`}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}