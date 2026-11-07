import type { ClassStats, Item } from "../canvas/load";

/** Concept difficulty cut: module class mean vs course mean, in points (design-v2, Network; sensitivity ±3, ±8). */
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
export interface Percentile {
  p: number;
  /** True when class statistics were hidden and the historical distribution was used instead. */
  weak: boolean;
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

/** Share of the historical students below the score; students in a bin are spread evenly across it. */
export function historicalPercentile(score: number, bins: GradeBin[]): number {
  const g = score * 100;
  const total = bins.reduce((a, b) => a + b.n, 0);
  if (total === 0) return 0.5; // no history: no information
  const below = bins.reduce((a, b) => a + b.n * Math.min(1, Math.max(0, (g - b.lo) / (b.hi - b.lo))), 0);
  return below / total;
}

/** Percentile from class statistics, else from the historical distribution and flagged weak. */
export function itemPercentile(g: Graded, history: GradeBin[]): Percentile {
  const p = interpolatePercentile(g.score, g.item.class_stats, g.item.points);
  return p === null ? { p: historicalPercentile(g.score, history), weak: true } : { p, weak: false };
}

/** Thirds of the class. */
export const level = (p: number): Level => (p < 1 / 3 ? "Low" : p < 2 / 3 ? "Med" : "High");

/** Weighted mean percentile over graded items; null when there are none. A missing weight counts as 1. */
export function meanPercentile(gs: Graded[], history: GradeBin[]): number | null {
  const w = gs.map((g) => g.item.weight ?? 1);
  const total = w.reduce((a, b) => a + b, 0);
  if (gs.length === 0 || total <= 0) return null;
  return gs.reduce((a, g, i) => a + w[i] * itemPercentile(g, history).p, 0) / total;
}

/** Perf: weighted mean percentile over graded items, in thirds. Null when nothing is graded yet. */
export function perf(gs: Graded[], history: GradeBin[]): Level | null {
  const m = meanPercentile(gs, history);
  return m === null ? null : level(m);
}

/** Mastery of a concept: percentile on its graded items; with none, the course standing (Perf). */
export function mastery(conceptItems: Graded[], coursePerf: Level, history: GradeBin[]): Level {
  const m = meanPercentile(conceptItems, history);
  return m === null ? coursePerf : level(m);
}

/** Class mean of an item as percent of its points, or null when Canvas gave no mean or points. */
const meanPct = (g: Graded) => {
  const { mean } = g.item.class_stats ?? { mean: null };
  return mean == null || !g.item.points ? null : (mean / g.item.points) * 100;
};
const avg = (gs: Graded[]) => {
  const m = gs.map(meanPct).filter((x): x is number => x !== null);
  return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
};

/** Concept difficulty: the module's class mean against the course mean, ±DIFFICULTY_CUT points. No data gives Med. */
export function conceptDifficulty(moduleItems: Graded[], courseItems: Graded[]): Difficulty {
  const m = avg(moduleItems);
  const c = avg(courseItems);
  if (m === null || c === null) return "Med";
  return m - c > DIFFICULTY_CUT ? "Easy" : c - m > DIFFICULTY_CUT ? "Hard" : "Med";
}
