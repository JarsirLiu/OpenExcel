import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultDatabaseUrl, loadDatabaseConfig, type DatabaseProvider } from "./databaseConfig.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve("prisma/build/index.js");

const schemaByProvider: Record<DatabaseProvider, string> = {
  sqlite: resolve(packageRoot, "prisma/schema.prisma"),
  postgresql: resolve(packageRoot, "prisma/postgresql/schema.prisma"),
  mysql: resolve(packageRoot, "prisma/mysql/schema.prisma"),
};

function ensureSqliteDatabaseFile(schemaPath: string, databaseUrl: string): void {
  if (!databaseUrl.startsWith("file:")) return;

  const filePath = databaseUrl.slice("file:".length);
  if (!filePath || filePath.startsWith(":memory:")) return;

  const resolvedPath = resolve(dirname(schemaPath), filePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  if (!existsSync(resolvedPath)) {
    writeFileSync(resolvedPath, "");
  }
}

function runPrisma(args: string[], databaseUrl: string): void {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    cwd: packageRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });

  if (result.status !== 0) {
    const code = result.status ?? 1;
    throw new Error(`Prisma command failed with exit code ${code}`);
  }
}

export function generateAllClients(): void {
  (Object.keys(schemaByProvider) as DatabaseProvider[]).forEach((provider) => {
    runPrisma(["generate", "--schema", schemaByProvider[provider]], getDefaultDatabaseUrl(provider));
  });
}

export function migrateSelectedDatabase(): void {
  const { provider, url } = loadDatabaseConfig();
  if (provider === "sqlite") {
    ensureSqliteDatabaseFile(schemaByProvider[provider], url);
  }

  runPrisma(["migrate", "deploy", "--schema", schemaByProvider[provider]], url);
}
