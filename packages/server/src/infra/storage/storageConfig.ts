import { resolve } from "node:path";

export interface StorageConfig {
  rootDir: string;
}

export function loadStorageConfig(): StorageConfig {
  const configuredRoot = process.env.OPENEXCEL_STORAGE_ROOT?.trim() || ".data/storage";
  return { rootDir: resolve(process.cwd(), configuredRoot) };
}
