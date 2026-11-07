import type { ClassStats, Item } from "../canvas/load";

/** Concept difficulty cut: module class mean vs course mean, in percentage points (design-v2, Network; sensitivity ±3, ±8). */
export const DIFFICULTY_CUT = 5;

export type Level = "Low" | "Med" | "High";
export type Difficulty = "Easy" | "Med" | "Hard";
/** A graded item: score is a fraction of points possible in [0, 1]. */
export interface Graded {
  item: Item;
  score: number;
}
/** One bin of the course's historical grade distribution (UBC grade map), in percent: lo <= grade < hi. */
export interface GradeBin {
  lo: number;
  hi: number;
  n: number;
}

/**
 * Class percentile of a score by linear interpolation through the Canvas five-number summary
 * (min 0, lower quartile .25, median .5, upper quartile .75, max 1). Stats are in points, the
 * score is a fraction, so the stats are divided by the item's points. Above max is 1, at or
 * below min is 0. Returns null when any needed statistic or the points are missing.
 */
export function interpolatePercentile(score: number, s: ClassStats | null, points: number | null): number | null {
  if (!s || !points || points <= 0) return null;
  const v = [s.min, s.lower_q, s.median, s.upper_q, s.max];
  if (v.some((x) => x == null)) return null;
  const xs = (v as number[]).map((x) => x / points);
  const ps = [0, 0.25, 0.5, 0.75, 1];
  if (score >= xs[4]) return 1;
  if (score <= xs[0]) return 0;
  const i = xs.findIndex((x, k) => k > 0 && score <= x);
  return xs[i] === xs[i - 1] ? ps[i] : ps[i - 1] + ((score - xs[i - 1]) / (xs[i] - xs[i - 1])) * 0.25;
}

/** Share of the historical students below the score (students in a bin spread evenly); null with no history (unobserved). */
export function historicalPercentile(score: number, bins: GradeBin[]): number | null {
  const g = score * 100;
  const total = bins.reduce((a, b) => a + b.n, 0);
  if (total === 0) return null;
  const below = bins.reduce((a, b) => a + b.n * Math.min(1, Math.max(0, (g - b.lo) / (b.hi - b.lo))), 0);
  return below / total;
}

/** Percentile from class statistics, else from the historical distribution and flagged weak. p is null when neither exists. */
export function itemPercentile(g: Graded, history: GradeBin[]): { p: number | null; weak: boolean } {
  const p = interpolatePercentile(g.score, g.item.class_stats, g.item.points);
  return p === null ? { p: historicalPercentile(g.score, history), weak: true } : { p, weak: false };
}

/** Thirds of the class. */
export const level = (p: number): Level => (p < 1 / 3 ? "Low" : p < 2 / 3 ? "Med" : "High");

/**
 * Mean percentile weighted by each item's share of the course grade. Items with an unknown weight are left
 * out of the mean; if every weight is unknown the weights are equal. Items with no percentile are skipped.
 * weak is true when more than half the weight came from the historical fallback. Null when nothing is usable.
 */
export function meanPercentile(gs: Graded[], history: GradeBin[]): { mean: number; weak: boolean } | null {
  const ps = gs.map((g) => ({ ...itemPercentile(g, history), w: g.item.weight })).filter((x) => x.p !== null);
  const anyKnown = ps.some((x) => x.w != null && x.w > 0);
  const used = ps.map((x) => ({ ...x, w: anyKnown ? (x.w ?? 0) : 1 })).filter((x) => x.w > 0);
  const total = used.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return null;
  return {
    mean: used.reduce((a, x) => a + x.w * (x.p as number), 0) / total,
    weak: used.reduce((a, x) => a + (x.weak ? x.w : 0), 0) > total / 2,
  };
}

/** Perf: weighted mean percentile over graded items, in thirds. Null when nothing is graded yet. */
export function perf(gs: Graded[], history: GradeBin[]): { level: Level; weak: boolean } | null {
  const m = meanPercentile(gs, history);
  return m && { level: level(m.mean), weak: m.weak };
}

/** Mastery of a concept: percentile on its graded items; with none, the course standing (Perf). */
export function mastery(conceptItems: Graded[], coursePerf: Level, history: GradeBin[]): Level {
  const m = meanPercentile(conceptItems, history);
  return m === null ? coursePerf : level(m.mean);
}

/** Mean of the class means, each as percent of the item's points; null when Canvas gave none. */
const avgPct = (gs: Graded[]) => {
  const m = gs
    .map(({ item: { class_stats: s, points } }) => (s?.mean == null || !points ? null : (s.mean / points) * 100))
    .filter((x): x is number => x !== null);
  return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
};

/**
 * Concept difficulty, compared within item type (from the assignment-group name) so a module of assignments is
 * not marked Easy just because assignments are marked easier than quizzes: per type, module class-mean percent
 * minus course class-mean percent; the gaps are averaged across the types present. Beyond ±DIFFICULTY_CUT
 * points is Easy/Hard. No data gives Med.
 */
export function conceptDifficulty(moduleItems: Graded[], courseItems: Graded[]): Difficulty {
  const gaps: number[] = [];
  for (const t of new Set(moduleItems.map((g) => g.item.type))) {
    const m = avgPct(moduleItems.filter((g) => g.item.type === t));
    const c = avgPct(courseItems.filter((g) => g.item.type === t));
    if (m !== null && c !== null) gaps.push(m - c);
  }
  if (!gaps.length) return "Med";
  const gap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return gap > DIFFICULTY_CUT ? "Easy" : gap < -DIFFICULTY_CUT ? "Hard" : "Med";
}
