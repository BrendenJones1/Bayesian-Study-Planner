/**
 * Item-weight and Graded-so-far evidence, and the achievable-grade bounds (docs/design-v2.md,
 * Network and Prediction). Pure; scores and weights are percents (0-100), G and R are fractions.
 */
import { infer, type Answer } from "./infer";

export const ITEM_WEIGHT_CUT = 15; // percent of the course grade; "<=15%" at or below, ">15%" above
const CHECKPOINTS = [25, 50];

export const itemWeightState = (weight: number): "<=15%" | ">15%" => (weight <= ITEM_WEIGHT_CUT ? "<=15%" : ">15%");

/** Highest checkpoint not above the graded share; below 25% uses the 25% table, above 50% the 50% table. */
export const gradedSoFarState = (gradedShare: number): 25 | 50 =>
  (CHECKPOINTS.filter((c) => c <= gradedShare).pop() ?? 25) as 25 | 50;

export interface Bound {
  p: 0 | 1;
  reason: "out of reach" | "already locked in";
  c: number; // current weighted score, percent
  G: number;
  R: number;
  target: number;
}

/** c = mean score on graded work, G = graded weight as a fraction. Null when the target lies between the bounds. */
export function bound(c: number, G: number, target: number): Bound | null {
  const R = 1 - G;
  const n = { c, G, R, target };
  if (c * G + 100 * R < target) return { p: 0, reason: "out of reach", ...n };
  if (c * G >= target) return { p: 1, reason: "already locked in", ...n };
  return null;
}

export type BoundedAnswer = Answer & { bounds: Record<number, Bound> };

/** A bound hit replaces P(grade >= t) before inference output is used; otherwise the network's answer is returned unchanged. */
export function inferBounded(
  cpts: unknown,
  course: string,
  evidence: Record<string, string | number>,
  action: string,
  c: number,
  G: number,
  targets?: number[],
): BoundedAnswer {
  const r = infer(cpts, course, evidence, action, targets);
  const bounds: Record<number, Bound> = {};
  for (const t of Object.keys(r.p_grade).map(Number)) {
    const b = bound(c, G, t);
    if (b) {
      bounds[t] = b;
      r.p_grade[t] = b.p;
    }
  }
  return { ...r, bounds };
}
