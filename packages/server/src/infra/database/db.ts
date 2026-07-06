import { PrismaClient as SqlitePrismaClient } from "../../../prisma/generated/sqlite/client/index.js";
import { PrismaClient as PostgreSQLPrismaClient } from "../../../prisma/generated/postgresql/client/index.js";
import { PrismaClient as MySQLPrismaClient } from "../../../prisma/generated/mysql/client/index.js";
import { loadDatabaseConfig } from "./databaseConfig.js";

type PrismaClientLike = InstanceType<typeof SqlitePrismaClient>;

function createPrismaClient(): PrismaClientLike {
  const { provider, url } = loadDatabaseConfig();
  const datasource = { db: { url } };

  switch (provider) {
    case "sqlite":
      return new SqlitePrismaClient({ datasources: datasource });
    case "postgresql":
      return new PostgreSQLPrismaClient({ datasources: datasource }) as unknown as PrismaClientLike;
    case "mysql":
      return new MySQLPrismaClient({ datasources: datasource }) as unknown as PrismaClientLike;
    default:
      throw new Error(`Unsupported database provider: ${String(provider)}`);
  }
}

export const prisma = createPrismaClient();
