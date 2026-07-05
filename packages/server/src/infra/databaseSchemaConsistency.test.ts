import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");

const schemaFiles = [
  {
    provider: "sqlite",
    schemaPath: resolve(packageRoot, "prisma/schema.prisma"),
    outputPath: "./generated/sqlite/client",
  },
  {
    provider: "postgresql",
    schemaPath: resolve(packageRoot, "prisma/postgresql/schema.prisma"),
    outputPath: "../generated/postgresql/client",
  },
  {
    provider: "mysql",
    schemaPath: resolve(packageRoot, "prisma/mysql/schema.prisma"),
    outputPath: "../generated/mysql/client",
  },
] as const;

function readSchema(schemaPath: string): string {
  return readFileSync(schemaPath, "utf-8").replace(/\r\n/g, "\n");
}

function normalizeSchema(schema: string, outputPath: string, provider: string): string {
  return schema
    .replace(`output   = "${outputPath}"`, 'output   = "__OUTPUT__"')
    .replace(`provider = "${provider}"`, 'provider = "__PROVIDER__"');
}

describe("Prisma schema consistency", () => {
  it("keeps the shared data model identical across providers", () => {
    const normalizedSchemas = schemaFiles.map(({ provider, schemaPath, outputPath }) =>
      normalizeSchema(readSchema(schemaPath), outputPath, provider),
    );

    expect(new Set(normalizedSchemas).size).toBe(1);
  });

  it("keeps each provider schema pointed at the expected datasource and client output", () => {
    for (const { provider, schemaPath, outputPath } of schemaFiles) {
      const schema = readSchema(schemaPath);

      expect(schema).toContain(`provider = "${provider}"`);
      expect(schema).toContain(`output   = "${outputPath}"`);
      expect(schema).toContain('url      = env("DATABASE_URL")');
    }
  });
});
