import {
  generateAllClients,
  migrateSelectedDatabase,
} from "../src/infra/database/prismaDatabase.js";

type PrismaCommand = "generate" | "migrate";

function main(): void {
  const command = (process.argv[2] ?? "migrate") as PrismaCommand;
  if (command === "generate") {
    generateAllClients();
    return;
  }

  if (command === "migrate") {
    migrateSelectedDatabase();
    return;
  }

  throw new Error(`Unsupported command: ${command}`);
}

main();
