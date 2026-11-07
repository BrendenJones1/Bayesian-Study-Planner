/**
 * Pure encoders from the student's own data to network evidence states (design-v2, Network).
 * Cut points come from cpts.json `cut_points`; each returns null when the node should stay unobserved.
 */
import type { StudySession } from "../storage/db";

export interface CutPoints {
  study_volume_hours_per_course_week: { low_max: number; med_max: number };
  study_active_day_share: { low_max: number; med_max: number };
  study_level_sum: Record<"Low" | "Med" | "High", number[]>;
  timeliness: { some_late_max: number };
}
const DAY = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const WINDOW_DAYS = 28; // OULAD's 4-week Study window; same as WINDOW_DAYS in hand_built.py

/** Calendar date (YYYY-MM-DD) of an instant in `tz` (default: the browser's timezone). */
export const localDay = (iso: string, tz?: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * Study so far for one course: the trailing 28 days up to `today` (local YYYY-MM-DD). Hours per week and
 * active-day share are each bucketed 0/1/2 and summed, then mapped by study_level_sum (the same rule as the
 * hand-built Study-before-the-exam node). If the timer was first used (`firstUse`, local date) less than 28
 * days ago, both divide by the days actually covered. Never used: null. Used but no minutes for this
 * course in the window is real evidence: Low.
 * Sessions are dated by their local start day in `tz`; shortcut: a session is not split at midnight.
 */
export function encodeStudy(
  sessions: StudySession[],
  today: string,
  firstUse: string | null,
  cuts: CutPoints,
  tz?: string,
): "Low" | "Med" | "High" | null {
  if (firstUse === null || firstUse > today) return null;
  const end = Date.parse(today) + DAY;
  const from = Math.max(end - WINDOW_DAYS * DAY, Date.parse(firstUse));
  const covered = (end - from) / DAY;
  const minutes = new Map<string, number>();
  for (const s of sessions) {
    const d = localDay(s.started_at, tz);
    const t = Date.parse(d);
    if (t >= from && t < end) minutes.set(d, (minutes.get(d) ?? 0) + s.active_minutes);
  }
  const hoursPerWeek = [...minutes.values()].reduce((a, b) => a + b, 0) / 60 / (covered / 7);
  const v = cuts.study_volume_hours_per_course_week;
  const a = cuts.study_active_day_share;
  const share = [...minutes.values()].filter((m) => m > 0).length / covered;
  const vol = hoursPerWeek < v.low_max ? 0 : hoursPerWeek < v.med_max ? 1 : 2; // low < 2, med 2-4, high >= 4
  const act = share <= a.low_max ? 0 : share <= a.med_max ? 1 : 2; // OULAD thirds: Low if <= low_max
  const sum = vol + act;
  return (["Low", "Med", "High"] as const).find((l) => cuts.study_level_sum[l].includes(sum)) ?? null;
}

/** Timeliness from the share of earlier items late or missing: 0 On time, <= some_late_max Some late, else Often late or missing. */
export function encodeTimeliness(
  earlier: { late: boolean; missing: boolean }[],
  cuts: Pick<CutPoints, "timeliness">,
): "On time" | "Some late" | "Often late or missing" | null {
  if (earlier.length === 0) return null;
  const f = earlier.filter((s) => s.late || s.missing).length / earlier.length;
  return f === 0 ? "On time" : f <= cuts.timeliness.some_late_max ? "Some late" : "Often late or missing";
}

/** Whole days from `today` to the confirmed exam date (both YYYY-MM-DD): 1-2, 3-7, 8+; null on exam day or after. */
export function encodeDaysLeft(examDate: string, today: string): "1-2" | "3-7" | "8+" | null {
  const n = Math.round((Date.parse(dayOf(examDate)) - Date.parse(dayOf(today))) / DAY);
  return n < 1 ? null : n <= 2 ? "1-2" : n <= 7 ? "3-7" : "8+";
}
