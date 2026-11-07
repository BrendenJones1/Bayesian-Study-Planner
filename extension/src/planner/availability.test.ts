import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { openDb, stores, type Availability } from "../storage/db";
import { availableHours, onAvailabilityChange, saveAvailability } from "./availability";

const weekly = [
  ...[0, 6].map((day) => ({ day, minutes: 240 })),
  ...[1, 2, 3, 4, 5].map((day) => ({ day, minutes: 120 })),
];
const base: Availability = { id: "default", weekly_defaults: weekly, busy_blocks: [] };
const local = (d: number, h: number) => new Date(2026, 0, d, 0, h * 60).toISOString();
const MON = new Date(2026, 0, 5);
const SAT = new Date(2026, 0, 10);

describe("availability", () => {
  it("keeps weekly defaults and busy blocks with start, end and label in the availability store", async () => {
    const db = await openDb("av-store");
    const a = { ...base, busy_blocks: [{ start: local(5, 10), end: local(5, 11), label: "lab" }] };
    await stores(db).availability.put(a);
    expect(await stores(db).availability.get("default")).toEqual(a);
    db.close();
  });

  it("a busy block across the window edge only counts the part inside the window", () => {
    // 21:00 to 23:30 overlaps the 22:00 window end by 1 h; Monday default 2 h -> 1 h.
    const a = { ...base, busy_blocks: [{ start: local(5, 21), end: local(5, 23.5), label: "x" }] };
    expect(availableHours(a, MON)).toBe(1);
  });

  it("the M cap limits a weekend default", () => {
    expect(availableHours(base, SAT)).toBe(4);
    expect(availableHours({ ...base, max_hours: 5, weekly_defaults: [{ day: 6, minutes: 480 }] }, SAT)).toBe(5);
    expect(availableHours({ ...base, weekly_defaults: [{ day: 6, minutes: 480 }] }, SAT)).toBe(6);
  });

  it("overlapping busy blocks are not subtracted twice", () => {
    const a = {
      ...base,
      busy_blocks: [
        { start: local(5, 10), end: local(5, 11), label: "a" },
        { start: local(5, 10.5), end: local(5, 11), label: "b" },
      ],
    };
    expect(availableHours(a, MON)).toBe(1);
  });

  it("rejects an M below 5 and accepts 5", async () => {
    const put = vi.fn(async () => {});
    await expect(saveAvailability(put, { ...base, max_hours: 4.9 })).rejects.toThrow(/at least 5/);
    expect(put).not.toHaveBeenCalled();
    await saveAvailability(put, { ...base, max_hours: 5, window_start: 540, window_end: 1320 });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("changing a setting notifies the planner", async () => {
    const seen = vi.fn();
    const off = onAvailabilityChange(seen);
    await saveAvailability(async () => {}, { ...base, max_hours: 7 });
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ max_hours: 7 }));
    off();
  });
});
