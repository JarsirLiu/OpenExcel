import type { ImportedWorkbookWarningFeature } from "@openexcel/core";
import { t } from "@/lib/i18n";

type ImportWarningResult = {
  warnings?: readonly { feature: ImportedWorkbookWarningFeature; count: number }[];
};

function importWarningLabel(feature: ImportedWorkbookWarningFeature): string {
  switch (feature) {
    case "charts":
      return t("workbook_import_unsupported_charts");
    case "comments":
      return t("workbook_import_unsupported_comments");
    case "pivotTables":
      return t("workbook_import_unsupported_pivot_tables");
    case "externalLinks":
      return t("workbook_import_unsupported_external_links");
    case "macros":
      return t("workbook_import_unsupported_macros");
  }
}

export function importWarningMessage(results: readonly ImportWarningResult[]): string | undefined {
  const counts = new Map<ImportedWorkbookWarningFeature, number>();
  for (const result of results) {
    for (const warning of result.warnings ?? []) {
      counts.set(warning.feature, (counts.get(warning.feature) ?? 0) + warning.count);
    }
  }
  if (counts.size === 0) return undefined;
  const features = [...counts.entries()]
    .map(([feature, count]) => `${importWarningLabel(feature)} (${count})`)
    .join("、");
  return t("workbook_import_unsupported_summary", { features });
}
