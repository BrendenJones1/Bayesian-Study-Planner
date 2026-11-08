import { ACTIONS, type Action } from "../model/query";

export const HOURS: Record<Action, number> = { Intense: 5, Light: 1, Rest: 0 };

/**
 * Exhaustive search over the 3^n plans (design-v2, Decision): U = Σ 100·P_c(a_c) − λ·100·S(h), h = Σ hours ≤ H.
 * `p[c][a]` is P_c(a) (the 3n values, computed once by the caller); `stress[h]` is S(h) for h = 0..H, so H = stress.length − 1.
 * The inputs are plain tables, so scoring a plan is additions only. Ties keep the earlier plan (more study first).
 */
export function bestPlan(p: Record<Action, number>[], stress: number[], lambda: number): { plan: Action[]; utility: number } {
  const H = stress.length - 1;
  const cur: Action[] = [];
  let best = { plan: [] as Action[], utility: -Infinity };
  const go = (c: number, h: number, gain: number) => {
    if (c === p.length) {
      const u = gain - lambda * 100 * stress[h];
      if (u > best.utility) best = { plan: [...cur], utility: u };
      return;
    }
    for (const a of ACTIONS) {
      if (h + HOURS[a] > H) continue; // over H hours; also drops Intense when H < 5
      cur[c] = a;
      go(c + 1, h + HOURS[a], gain + 100 * p[c][a]);
    }
  };
  go(0, 0, 0);
  return best;
}
