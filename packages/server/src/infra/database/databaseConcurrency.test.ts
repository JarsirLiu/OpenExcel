import { afterEach, describe, expect, it, vi } from "vitest";
import { withDatabaseWriteLock } from "./databaseConcurrency.js";

describe("databaseConcurrency", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serializes SQLite writes within one server process", async () => {
    vi.stubEnv("DATABASE_PROVIDER", "sqlite");
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withDatabaseWriteLock(async () => {
      events.push("first:start");
      await firstReleased;
      events.push("first:end");
    });
    const second = withDatabaseWriteLock(async () => {
      events.push("second:start");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("does not serialize PostgreSQL writes in the process-local gate", async () => {
    vi.stubEnv("DATABASE_PROVIDER", "postgresql");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/openexcel");
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withDatabaseWriteLock(async () => {
      events.push("first:start");
      await firstReleased;
      events.push("first:end");
    });
    const second = withDatabaseWriteLock(async () => {
      events.push("second:start");
    });

    await second;
    expect(events).toEqual(["first:start", "second:start"]);

    releaseFirst();
    await first;
    expect(events).toEqual(["first:start", "second:start", "first:end"]);
  });
});
