const BYTES_PER_MIB = 1024 * 1024;

export const MAX_IMPORT_FILE_BYTES = 5 * BYTES_PER_MIB;
export const MAX_IMPORT_BATCH_BYTES = 10 * BYTES_PER_MIB;
export const MAX_XLSX_ZIP_ENTRIES = 2_000;
export const MAX_XLSX_METADATA_XML_BYTES = 8 * BYTES_PER_MIB;
export const MAX_XLSX_WORKSHEET_XML_BYTES = 4 * BYTES_PER_MIB;

function formatMiB(bytes: number): string {
  return `${(bytes / BYTES_PER_MIB).toFixed(2)} MB`;
}

export function validateImportFileSizes(files: readonly File[]): void {
  const oversizedFile = files.find((file) => file.size > MAX_IMPORT_FILE_BYTES);
  if (oversizedFile) {
    throw new Error(
      `单个 Excel 文件不能超过 5 MB：${oversizedFile.name}（当前 ${formatMiB(oversizedFile.size)}）`,
    );
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_IMPORT_BATCH_BYTES) {
    throw new Error(`批量 Excel 文件总大小不能超过 10 MB（当前 ${formatMiB(totalBytes)}）`);
  }
}
