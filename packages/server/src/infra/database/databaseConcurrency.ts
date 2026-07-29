import { loadDatabaseConfig } from "./databaseConfig.js";

let sqliteWriteTail = Promise.resolve();

/** Serializes application-owned SQLite write transactions within one process. */
export function withDatabaseWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  if (loadDatabaseConfig().provider !== "sqlite") return operation();

  const previous = sqliteWriteTail;
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  sqliteWriteTail = current;

  return previous.then(operation).finally(() => {
    release();
    if (sqliteWriteTail === current) sqliteWriteTail = Promise.resolve();
  });
}

export function getDatabaseTransactionOptions() {
  return {
    maxWait: 15_000,
    timeout: 120_000,
  };
}
