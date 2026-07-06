export type DatabaseProvider = "sqlite" | "postgresql" | "mysql";

export interface DatabaseConfig {
  provider: DatabaseProvider;
  url: string;
}

function normalizeProvider(value: string | undefined): DatabaseProvider {
  const provider = (value ?? "sqlite").trim().toLowerCase();
  if (provider === "sqlite" || provider === "postgresql" || provider === "mysql") {
    return provider;
  }
  throw new Error(`Unsupported database provider: ${value}`);
}

function buildDefaultSqliteUrl(): string {
  return "file:../../../.data/dev.db";
}

function normalizeUrl(provider: DatabaseProvider, value: string | undefined): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  if (provider === "sqlite") return buildDefaultSqliteUrl();
  throw new Error(`DATABASE_URL is required when DATABASE_PROVIDER=${provider}`);
}

export function loadDatabaseConfig(): DatabaseConfig {
  const provider = normalizeProvider(process.env.DATABASE_PROVIDER);
  const url = normalizeUrl(provider, process.env.DATABASE_URL);
  return { provider, url };
}

export function getDefaultDatabaseUrl(provider: DatabaseProvider): string {
  if (provider === "sqlite") return buildDefaultSqliteUrl();
  if (provider === "postgresql") return "postgresql://postgres:postgres@localhost:5432/openexcel";
  return "mysql://root:root@localhost:3306/openexcel";
}
