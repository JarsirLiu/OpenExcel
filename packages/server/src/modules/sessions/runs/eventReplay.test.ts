import { describe, expect, it } from "vitest";
import { orderAndDeduplicateEvents } from "./eventReplay.js";

describe("orderAndDeduplicateEvents", () => {
  it("orders events and ignores replayed sequences", () => {
    const events = orderAndDeduplicateEvents(
      [
        { eventId: "event-3", sequence: 3 },
        { eventId: "event-2", sequence: 2 },
        { eventId: "event-2", sequence: 2 },
        { eventId: "event-1", sequence: 1 },
      ],
      1,
    );

    expect(events.map((event) => event.sequence)).toEqual([2, 3]);
  });

  it("rejects conflicting events that reuse one sequence", () => {
    expect(() =>
      orderAndDeduplicateEvents([
        { eventId: "event-a", sequence: 4 },
        { eventId: "event-b", sequence: 4 },
      ]),
    ).toThrow("Conflicting events");
  });
});
