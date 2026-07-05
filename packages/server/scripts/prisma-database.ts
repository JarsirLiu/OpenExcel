import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultDatabaseUrl, loadDatabaseConfig, type DatabaseProvider } from "../src/infra/databaseConfig.js";

type PrismaCommand = "generate" | "push" | "sync";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");

const schemaByProvider: Record<DatabaseProvider, string> = {
  sqlite: resolve(packageRoot, "prisma/schema.prisma"),
  postgresql: resolve(packageRoot, "prisma/postgresql/schema.prisma"),
  mysql: resolve(packageRoot, "prisma/mysql/schema.prisma"),
};

function getShellCommand(): string {
  return "pnpm";
}

function runPrisma(args: string[], databaseUrl: string): void {
  const command = [getShellCommand(), "exec", "prisma", ...args].join(" ");
  const result = spawnSync(getShellCommand(), ["exec", "prisma", ...args], {
    cwd: packageRoot,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });

  if (result.status !== 0) {
    const code = result.status ?? 1;
    console.error(`[prisma] command failed: ${command}`);
    if (result.error) {
      console.error(result.error);
    }
    if (result.stderr) {
      console.error(result.stderr.toString());
    }
    throw new Error(`Prisma command failed with exit code ${code}`);
  }
}

function generateAllClients(): void {
  (Object.keys(schemaByProvider) as DatabaseProvider[]).forEach((provider) => {
    runPrisma(["generate", "--schema", schemaByProvider[provider]], getDefaultDatabaseUrl(provider));
  });
}

function pushSelectedDatabase(): void {
  const { provider, url } = loadDatabaseConfig();
  runPrisma(["db", "push", "--skip-generate", "--schema", schemaByProvider[provider]], url);
}

function syncDatabase(): void {
  pushSelectedDatabase();
}

function main(): void {
  const command = (process.argv[2] ?? "sync") as PrismaCommand;
  if (command === "generate") {
    generateAllClients();
    return;
  }

  if (command === "push") {
    pushSelectedDatabase();
    return;
  }

  if (command === "sync") {
    syncDatabase();
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

main();
