import type { PrismaClient as PrismaClientType } from "../../../prisma/generated/sqlite/client/index.js";
import { loadDatabaseConfig } from "./databaseConfig.js";

type PrismaClientLike = InstanceType<typeof PrismaClientType>;

async function createPrismaClient(config = loadDatabaseConfig()): Promise<PrismaClientLike> {
  const { provider, url } = config;
  const datasource = { db: { url } };

  switch (provider) {
    case "sqlite": {
      const { PrismaClient } = await import("../../../prisma/generated/sqlite/client/index.js");
      return new PrismaClient({ datasources: datasource });
    }
    case "postgresql": {
      const { PrismaClient } = await import("../../../prisma/generated/postgresql/client/index.js");
      return new PrismaClient({ datasources: datasource }) as unknown as PrismaClientLike;
    }
    case "mysql": {
      const { PrismaClient } = await import("../../../prisma/generated/mysql/client/index.js");
      return new PrismaClient({ datasources: datasource }) as unknown as PrismaClientLike;
    }
    default:
      throw new Error(`Unsupported database provider: ${String(provider)}`);
  }
}

const databaseConfig = loadDatabaseConfig();
export const prisma = await createPrismaClient(databaseConfig);

if (databaseConfig.provider === "sqlite") {
  try {
    await prisma.$executeRawUnsafe("PRAGMA busy_timeout = 10000");
    await prisma.$executeRawUnsafe("PRAGMA synchronous = NORMAL");
    await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  } catch (error) {
    console.warn("[database] Failed to initialize SQLite concurrency pragmas:", error);
  }
}
