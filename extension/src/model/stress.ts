/**
 * Load evidence and the stress curve S(h) (docs/design-v2.md, Stress). Pure. Stress never feeds back
 * into P(grade); it only prices the plan. Cut points come from cpts.json `cut_points`.
 */
import type { Item } from "../canvas/load";
import { THETA } from "./constants";
import { localDay } from "./encode";
import { stressNext, type Tables } from "./infer";

export interface LoadCuts {
  low_max: number;
  med_max: number;
}
export const LOAD_WINDOW_DAYS = 3;

/** Low at or below low_max, Med at or below med_max, else High. Fractional counts (θ·h added) are fine. */
export const loadState = (count: number, cuts: LoadCuts): "Low" | "Med" | "High" =>
  count <= cuts.low_max ? "Low" : count <= cuts.med_max ? "Med" : "High";

/**
 * Canvas deadlines on the 3 local days starting at `day` (YYYY-MM-DD): day through day+2, so Load today
 * uses today and Load tomorrow uses tomorrow. Counts dated items with points > 0 in every course, whatever
 * their submission state (like StudentLife). Labs count; undated items are skipped. Excused items never
 * reach `items` (the loader drops them).
 */
export function deadlineCount(items: Item[], day: string, tz?: string): number {
  const end = new Date(Date.parse(day) + LOAD_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  return items.filter((i) => i.due_at && (i.points ?? 0) > 0 && localDay(i.due_at, tz) >= day && localDay(i.due_at, tz) < end).length;
}

/**
 * S(h) for h = 0..H: E[stress next | stress now, Load tomorrow + θh]. Load today is evidence for Stress now;
 * a tapped `stressNow` is evidence too, otherwise the network infers it.
 */
export function stressCurve(
  cpts: Tables & { cut_points: { load_deadlines_next_3_days: LoadCuts } },
  o: { loadToday: number; loadTomorrow: number; H: number; stressNow?: "Low" | "Med" | "High"; theta?: number },
): number[] {
  const cuts = cpts.cut_points.load_deadlines_next_3_days;
  const theta = o.theta ?? THETA;
  return Array.from({ length: o.H + 1 }, (_, h) =>
    stressNext(cpts, {
      LoadToday: loadState(o.loadToday, cuts),
      LoadTomorrow: loadState(o.loadTomorrow + theta * h, cuts),
      ...(o.stressNow && { StressNow: o.stressNow }),
    }),
  );
}
