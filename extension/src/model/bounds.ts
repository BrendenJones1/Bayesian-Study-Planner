/**
 * Item-weight and Graded-so-far evidence, and the achievable-grade bounds (docs/design-v2.md,
 * Network and Prediction). Pure. Units: c, G, R, t and item shares are fractions in [0, 1];
 * convert to percent only for display. Network targets in infer() stay percents (50..90).
 */
import type { Item, Submission } from "../canvas/load";
import { ITEM_WEIGHT_CUT } from "./constants";
import { infer, TARGETS, type Answer } from "./infer";

/** @param weight an item's share of the course grade, fraction in [0, 1]. */
export const itemWeightState = (weight: number): "<=15%" | ">15%" => (weight <= ITEM_WEIGHT_CUT ? "<=15%" : ">15%");

/** @param gradedShare G, the graded share of the course, fraction in [0, 1]. Below 25% uses the 25% table, 50% and over the 50% table. */
export const gradedSoFarState = (gradedShare: number): 25 | 50 => (gradedShare >= 0.5 ? 50 : 25);

export interface CourseStanding {
  /** Share of the course grade per item_id, fractions. */
  itemShare: Record<string, number>;
  /** Sum of shares of items that count and are graded. */
  G: number;
  /** Share still to be earned, 1 - G, clamped at 0 (extra-credit weights can sum past 1). */
  R: number;
  /** Weighted mean score fraction on graded work; 0 when nothing is graded. */
  c: number;
}

/**
 * Item share = group weight split by points within the group (points share of the course when there
 * are no weighted groups). Excused and ungraded items (no submission, or score null) are excluded from G.
 * shortcut: excused items carry no submission, so they stay in R; the bound is then slightly conservative.
 */
export function courseStanding(items: Item[], submissions: Submission[]): CourseStanding {
  const groupWeight = new Map<number, number>(); // percent; the loader splits it equally, so the sum recovers it
  const groupPoints = new Map<number, number>();
  for (const it of items) {
    if (it.group_id == null || it.weight_is_fallback) continue;
    groupWeight.set(it.group_id, (groupWeight.get(it.group_id) ?? 0) + (it.weight ?? 0));
    groupPoints.set(it.group_id, (groupPoints.get(it.group_id) ?? 0) + (it.points ?? 0));
  }
  const itemShare: Record<string, number> = {};
  for (const it of items) {
    const gp = it.group_id == null ? 0 : (groupPoints.get(it.group_id) ?? 0);
    itemShare[it.item_id] =
      it.weight_is_fallback || gp <= 0 || it.group_id == null
        ? (it.weight ?? 0) / 100
        : ((groupWeight.get(it.group_id) ?? 0) / 100) * ((it.points ?? 0) / gp);
  }
  let G = 0;
  let earned = 0;
  for (const s of submissions) {
    if (s.score == null || !(s.item_id in itemShare)) continue;
    G += itemShare[s.item_id];
    earned += itemShare[s.item_id] * s.score;
  }
  return { itemShare, G, R: Math.max(0, 1 - G), c: G > 0 ? earned / G : 0 };
}

export interface Bound {
  p: 0 | 1;
  reason: "out of reach" | "already locked in";
  c: number; // fraction
  G: number; // fraction
  R: number; // fraction
  target: number; // fraction
}

/**
 * Null when the target lies between the bounds.
 * @param c mean score on graded work, fraction. @param G graded share, fraction. @param target t, fraction.
 */
export function bound(c: number, G: number, target: number): Bound | null {
  const R = Math.max(0, 1 - G);
  const n = { c, G, R, target };
  if (c * G + R < target) return { p: 0, reason: "out of reach", ...n };
  if (c * G >= target) return { p: 1, reason: "already locked in", ...n };
  return null;
}

export type BoundedAnswer = Omit<Answer, "e_stress_next"> & {
  /** null when every target was bounded and the network was never run. */
  e_stress_next: number | null;
  bounds: Record<number, Bound>;
};

/**
 * Bounds first: each target (a percent, as in infer) is checked with bound() before inference, and
 * infer() runs only for the unbounded ones; if all are bounded it never runs.
 * @param c mean score on graded work, fraction. @param G graded share, fraction.
 */
export function inferBounded(
  cpts: unknown,
  course: string,
  evidence: Record<string, string | number>,
  action: string,
  c: number,
  G: number,
  targets: number[] = TARGETS,
): BoundedAnswer {
  const bounds: Record<number, Bound> = {};
  const p_grade: Record<number, number> = {};
  const open: number[] = [];
  for (const t of targets) {
    const b = bound(c, G, t / 100);
    if (b) {
      bounds[t] = b;
      p_grade[t] = b.p;
    } else open.push(t);
  }
  if (open.length === 0) return { p_grade, e_stress_next: null, bounds };
  const r = infer(cpts, course, evidence, action, open);
  return { p_grade: { ...p_grade, ...r.p_grade }, e_stress_next: r.e_stress_next, bounds };
}
