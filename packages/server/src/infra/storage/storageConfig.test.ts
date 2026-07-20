import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { repositoryRoot } from "../runtimePaths.js";
import { loadStorageConfig } from "./storageConfig.js";

describe("storageConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores uploads under the repository data directory by default", () => {
    expect(loadStorageConfig()).toEqual({
      rootDir: resolve(repositoryRoot, ".data/storage"),
    });
  });

  it("resolves relative storage roots from the repository root", () => {
    vi.stubEnv("OPENEXCEL_STORAGE_ROOT", "custom-storage");

    expect(loadStorageConfig()).toEqual({
      rootDir: resolve(repositoryRoot, "custom-storage"),
    });
  });

  it("preserves absolute storage roots", () => {
    const absoluteRoot = resolve(repositoryRoot, "external-storage");
    vi.stubEnv("OPENEXCEL_STORAGE_ROOT", absoluteRoot);

    expect(loadStorageConfig()).toEqual({ rootDir: absoluteRoot });
  });
});
