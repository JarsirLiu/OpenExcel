import { afterEach, describe, expect, it, vi } from "vitest";
import { getDefaultDatabaseUrl, loadDatabaseConfig } from "./databaseConfig.js";

describe("databaseConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to sqlite with the repo database", () => {
    const config = loadDatabaseConfig();

    expect(config.provider).toBe("sqlite");
    expect(config.url).toContain("/.data/openexcel.db");
  });

  it("uses the configured provider and url", () => {
    vi.stubEnv("DATABASE_PROVIDER", "postgresql");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/openexcel");

    const config = loadDatabaseConfig();

    expect(config).toEqual({
      provider: "postgresql",
      url: "postgresql://user:pass@localhost:5432/openexcel",
    });
  });

  it("rejects unsupported providers", () => {
    vi.stubEnv("DATABASE_PROVIDER", "oracle");

    expect(() => loadDatabaseConfig()).toThrow("Unsupported database provider: oracle");
  });

  it("provides built-in defaults for each provider", () => {
    expect(getDefaultDatabaseUrl("sqlite")).toContain("/.data/openexcel.db");
    expect(getDefaultDatabaseUrl("postgresql")).toContain("postgresql://");
    expect(getDefaultDatabaseUrl("mysql")).toContain("mysql://");
  });
});
