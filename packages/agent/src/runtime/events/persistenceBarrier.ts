import type { AgentEvent, PersistenceBarrier } from "./types.js";

export class InMemoryPersistenceBarrier implements PersistenceBarrier {
  private readonly events: AgentEvent[] = [];

  persist(event: AgentEvent): void {
    this.events.push(event);
  }

  getAllEvents(): AgentEvent[] {
    return [...this.events];
  }
}

export class NoopPersistenceBarrier implements PersistenceBarrier {
  persist(): void {}
}

export function createPersistenceBarrier(
  persister?: (event: AgentEvent) => void | Promise<void>,
): PersistenceBarrier {
  if (!persister) {
    return new NoopPersistenceBarrier();
  }

  return {
    persist: persister,
  };
}
