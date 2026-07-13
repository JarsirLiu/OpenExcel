export const WORKBOOK_UPLOAD_LIMITS = {
  maxFiles: 20,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
  maxParts: 24,
} as const;
