import { isAbsolute, resolve } from "node:path";
import { repositoryRoot } from "../runtimePaths.js";

export interface StorageConfig {
  rootDir: string;
}

export function loadStorageConfig(): StorageConfig {
  const configuredRoot = process.env.OPENEXCEL_STORAGE_ROOT?.trim() || ".data/storage";
  return {
    rootDir: isAbsolute(configuredRoot) ? configuredRoot : resolve(repositoryRoot, configuredRoot),
  };
}
