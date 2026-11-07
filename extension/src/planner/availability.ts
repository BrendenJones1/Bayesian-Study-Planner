import type { Availability } from "../storage/db";

export const DEFAULTS = { window_start: 540, window_end: 1320, max_hours: 6 };
export const MIN_MAX_HOURS = 5;

/** Hours free on `day` (local date): weekly default minus busy blocks inside the window, capped at M. */
export function availableHours(a: Availability, day: Date): number {
  const ws = a.window_start ?? DEFAULTS.window_start;
  const we = a.window_end ?? DEFAULTS.window_end;
  const max = a.max_hours ?? DEFAULTS.max_hours;
  const at = (min: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min).getTime();
  const lo = at(ws);
  const hi = at(we);
  // Clip each block to the window, then merge so overlapping blocks are not subtracted twice.
  const clipped = a.busy_blocks
    .map((b) => [Math.max(lo, Date.parse(b.start)), Math.min(hi, Date.parse(b.end))] as const)
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);
  let busy = 0;
  let end = -Infinity;
  for (const [s, e] of clipped) {
    busy += e - Math.max(s, end);
    end = Math.max(end, e);
  }
  const base = a.weekly_defaults.find((d) => d.day === day.getDay())?.minutes ?? 0;
  return Math.min(max, Math.max(0, base - busy / 60000) / 60);
}

/** Rejects an M below 5 h or a window that is empty or outside the day. */
export function validate(a: Availability): void {
  if (a.max_hours !== undefined && !(a.max_hours >= MIN_MAX_HOURS)) {
    throw new Error(`daily maximum must be at least ${MIN_MAX_HOURS} hours so Intense stays possible`);
  }
  const ws = a.window_start ?? DEFAULTS.window_start;
  const we = a.window_end ?? DEFAULTS.window_end;
  if (!(ws >= 0 && we <= 1440 && ws < we)) throw new Error("study window must start before it ends, within one day");
}

const listeners = new Set<(a: Availability) => void>();
/** The planner subscribes here to recompute the plan when a setting changes. */
export const onAvailabilityChange = (f: (a: Availability) => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** Validates, stores, then notifies the planner. */
export async function saveAvailability(put: (a: Availability) => Promise<void>, a: Availability): Promise<void> {
  validate(a);
  await put(a);
  listeners.forEach((f) => f(a));
}
