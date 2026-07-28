import { useRef } from "react";
import { t } from "@/lib/i18n";
import styles from "./WorkspaceEmptyState.module.css";

type Props = {
  hasWorkspace: boolean;
  onCreateWorkbook: () => Promise<void>;
  onImportWorkbook: (file: File) => Promise<void>;
};

export function WorkspaceEmptyState({ hasWorkspace, onCreateWorkbook, onImportWorkbook }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className={styles.container} aria-labelledby="empty-workspace-title">
      <div className={styles.sheetMark} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <h1 id="empty-workspace-title">
        {hasWorkspace
          ? t("empty_workspace_title", "开始使用这个项目")
          : t("empty_projects_title", "开始使用 OpenExcel")}
      </h1>
      <p>
        {hasWorkspace
          ? t("empty_workspace_description", "创建一个工作簿，或导入已有的 Excel 文件")
          : t("empty_projects_description", "创建项目后，你可以在其中管理工作簿并进行对话")}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => void onCreateWorkbook()}
        >
          <span aria-hidden="true">+</span>
          {t("new_workbook", "新建工作簿")}
        </button>
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => inputRef.current?.click()}
        >
          <span aria-hidden="true">↑</span>
          {t("import_workbook", "导入 Excel")}
        </button>
      </div>
      <input
        ref={inputRef}
        className={styles.fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void onImportWorkbook(file);
        }}
      />
    </section>
  );
}
