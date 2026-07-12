import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../../..");

const schemaFiles = [
  {
    provider: "sqlite",
    schemaPath: resolve(packageRoot, "prisma/schema.prisma"),
    outputPath: "./generated/sqlite/client",
    migrationsPath: resolve(packageRoot, "prisma/migrations"),
  },
  {
    provider: "postgresql",
    schemaPath: resolve(packageRoot, "prisma/postgresql/schema.prisma"),
    outputPath: "../generated/postgresql/client",
    migrationsPath: resolve(packageRoot, "prisma/postgresql/migrations"),
  },
  {
    provider: "mysql",
    schemaPath: resolve(packageRoot, "prisma/mysql/schema.prisma"),
    outputPath: "../generated/mysql/client",
    migrationsPath: resolve(packageRoot, "prisma/mysql/migrations"),
  },
] as const;

const documentEngineMigration = "20260711000000_document_engine";
const operationCompactionMigration = "20260712030000_operation_compaction";
const operationIdempotencyMigration = "20260712040000_operation_idempotency";
const operationRequestLedgerMigration = "20260712050000_operation_request_ledger";
const operationRequestFingerprintMigration = "20260712060000_operation_request_fingerprint";

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

  it("keeps each provider migration baseline available", () => {
    for (const { provider, migrationsPath } of schemaFiles) {
      const lockFilePath = resolve(migrationsPath, "migration_lock.toml");
      const initMigrationPath = resolve(migrationsPath, "20260705000000_init", "migration.sql");

      expect(existsSync(migrationsPath)).toBe(true);
      expect(existsSync(lockFilePath)).toBe(true);
      expect(existsSync(initMigrationPath)).toBe(true);
      expect(readFileSync(lockFilePath, "utf-8")).toContain(`provider = "${provider}"`);
    }
  });

  it("keeps the document engine migration available for every provider", () => {
    for (const { migrationsPath } of schemaFiles) {
      const migrationPath = resolve(migrationsPath, documentEngineMigration, "migration.sql");
      expect(existsSync(migrationPath)).toBe(true);
      expect(readFileSync(migrationPath, "utf-8")).toContain("documentRevision");
      expect(readFileSync(migrationPath, "utf-8")).toContain("SheetChunk");
      expect(readFileSync(migrationPath, "utf-8")).toContain("SheetOperation");
    }
  });

  it("keeps the operation compaction migration available for every provider", () => {
    for (const { migrationsPath } of schemaFiles) {
      const migrationPath = resolve(migrationsPath, operationCompactionMigration, "migration.sql");
      expect(existsSync(migrationPath)).toBe(true);
      const migration = readFileSync(migrationPath, "utf-8");
      expect(migration).toContain("compactedRevision");
      expect(migration).toContain("SheetSnapshot");
    }
  });

  it("keeps the operation idempotency migration available for every provider", () => {
    for (const { migrationsPath } of schemaFiles) {
      const migrationPath = resolve(migrationsPath, operationIdempotencyMigration, "migration.sql");
      expect(existsSync(migrationPath)).toBe(true);
      const migration = readFileSync(migrationPath, "utf-8");
      expect(migration).toContain("idempotencyKey");
      expect(migration).toContain("batchId");
      expect(migration).toContain("result");
    }
  });

  it("keeps the operation request ledger migration available for every provider", () => {
    for (const { migrationsPath } of schemaFiles) {
      const migrationPath = resolve(
        migrationsPath,
        operationRequestLedgerMigration,
        "migration.sql",
      );
      expect(existsSync(migrationPath)).toBe(true);
      const migration = readFileSync(migrationPath, "utf-8");
      expect(migration).toContain("SheetOperationRequest");
      expect(migration).toContain("DROP COLUMN");
    }
  });

  it("keeps the operation request fingerprint migration available for every provider", () => {
    for (const { migrationsPath } of schemaFiles) {
      const migrationPath = resolve(
        migrationsPath,
        operationRequestFingerprintMigration,
        "migration.sql",
      );
      expect(existsSync(migrationPath)).toBe(true);
      expect(readFileSync(migrationPath, "utf-8")).toContain("requestHash");
    }
  });
});
