export interface ReplayEvent {
  eventId: string;
  sequence: number;
}

export function orderAndDeduplicateEvents<T extends ReplayEvent>(
  events: readonly T[],
  afterSequence = -1,
): T[] {
  const bySequence = new Map<number, T>();
  for (const event of events) {
    if (event.sequence <= afterSequence) continue;
    const existing = bySequence.get(event.sequence);
    if (existing && existing.eventId !== event.eventId) {
      throw new Error(`Conflicting events for sequence ${event.sequence}`);
    }
    bySequence.set(event.sequence, event);
  }
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
}
