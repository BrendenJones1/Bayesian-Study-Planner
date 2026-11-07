/**
 * Pure encoders from the student's own data to network evidence states (design-v2, Network).
 * Cut points come from cpts.json `cut_points`; each returns null when the node should stay unobserved.
 */
import type { StudySession } from "../storage/db";

export interface CutPoints {
  study_volume_hours_per_course_week: { low_max: number; med_max: number };
  study_active_day_share: { low_max: number; med_max: number };
  study_level_sum: Record<"Low" | "Med" | "High", number[]>;
}
const DAY = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Study so far for one course: the last 7 days up to `today` (YYYY-MM-DD). Weekly hours and active-day
 * share are each bucketed 0/1/2 and summed, then mapped by study_level_sum (the same rule as the
 * hand-built Study-before-the-exam node). No sessions in the window means no timer use: null.
 * shortcut: sessions are dated by started_at (UTC date), upgrade if sessions must be split at midnight.
 */
export function encodeStudy(
  sessions: StudySession[],
  today: string,
  cuts: CutPoints,
): "Low" | "Med" | "High" | null {
  const end = Date.parse(today) + DAY;
  const minutes = new Map<string, number>();
  for (const s of sessions) {
    const d = dayOf(s.started_at);
    const t = Date.parse(d);
    if (t >= end - 7 * DAY && t < end) minutes.set(d, (minutes.get(d) ?? 0) + s.active_minutes);
  }
  if (minutes.size === 0) return null;
  const hours = [...minutes.values()].reduce((a, b) => a + b, 0) / 60;
  const v = cuts.study_volume_hours_per_course_week;
  const a = cuts.study_active_day_share;
  const share = [...minutes.values()].filter((m) => m > 0).length / 7;
  const vol = hours < v.low_max ? 0 : hours < v.med_max ? 1 : 2; // low < 2, med 2-4, high >= 4
  const act = share <= a.low_max ? 0 : share <= a.med_max ? 1 : 2; // OULAD thirds: Low if <= low_max
  const sum = vol + act;
  return (["Low", "Med", "High"] as const).find((l) => cuts.study_level_sum[l].includes(sum)) ?? null;
}

/** Timeliness from the share of earlier items late or missing: 0 On time, <= 1/3 Some late, else Often late or missing. */
export function encodeTimeliness(
  earlier: { late: boolean; missing: boolean }[],
): "On time" | "Some late" | "Often late or missing" | null {
  if (earlier.length === 0) return null;
  const f = earlier.filter((s) => s.late || s.missing).length / earlier.length;
  return f === 0 ? "On time" : f <= 1 / 3 ? "Some late" : "Often late or missing";
}

/** Whole days from `today` to the confirmed exam date (both YYYY-MM-DD): 1-2, 3-7, 8+; null on exam day or after. */
export function encodeDaysLeft(examDate: string, today: string): "1-2" | "3-7" | "8+" | null {
  const n = Math.round((Date.parse(dayOf(examDate)) - Date.parse(dayOf(today))) / DAY);
  return n < 1 ? null : n <= 2 ? "1-2" : n <= 7 ? "3-7" : "8+";
}
