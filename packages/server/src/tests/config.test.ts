import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import toml from "@iarna/toml";

describe("config parsing", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "openexcel-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses a valid config.toml", () => {
    const configPath = join(tmpDir, "config.toml");
    writeFileSync(configPath, `[model]
baseUrl = "https://test.api.com/v1"
apiKey = "sk-test123"
modelName = "gpt-4o-mini"
`, "utf-8");

    const raw = readFileSync(configPath, "utf-8");
    const parsed = toml.parse(raw) as unknown as { model: { baseUrl: string; apiKey: string; modelName: string } };

    expect(parsed.model.baseUrl).toBe("https://test.api.com/v1");
    expect(parsed.model.apiKey).toBe("sk-test123");
    expect(parsed.model.modelName).toBe("gpt-4o-mini");
  });

  it("throws on missing config file", () => {
    expect(() => {
      const raw = readFileSync(join(tmpDir, "nonexistent.toml"), "utf-8");
    }).toThrow();
  });
});