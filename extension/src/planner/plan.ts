import { ACTION_HOURS as HOURS } from "../model/constants";
import { ACTIONS, type Action } from "../model/query";

const EPS = 1e-9;
const RANK: Record<Action, number> = { Rest: 0, Light: 1, Intense: 2 };
const total = (plan: Action[]) => plan.reduce((s, a) => s + HOURS[a], 0);

/** Tie-break: fewer total hours, then earlier courses resting first (lexicographic on Rest < Light < Intense). */
function beats(a: Action[], b: Action[]): boolean {
  if (total(a) !== total(b)) return total(a) < total(b);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return RANK[a[i]] < RANK[b[i]];
  return false;
}

/**
 * Exhaustive search over the 3^n plans (design-v2, Decision): U = Σ 100·P_c(a_c) − λ·100·S(h), h = Σ hours ≤ H.
 * `p[c][a]` is P_c(a) (the 3n values, computed once by the caller); `stress[h]` is S(h) for h = 0..H, so H = stress.length − 1.
 * The inputs are plain tables, so scoring a plan is additions only. Utilities within 1e-9 tie: see `beats`.
 * Throws RangeError on an empty stress table or a P outside [0, 1].
 */
export function bestPlan(p: Record<Action, number>[], stress: number[], lambda: number): { plan: Action[]; utility: number } {
  if (stress.length === 0) throw new RangeError("stress table must have at least one entry (H >= 0)");
  if (p.some((row) => ACTIONS.some((a) => !(row[a] >= 0 && row[a] <= 1)))) throw new RangeError("every P must be in [0, 1]");
  const H = stress.length - 1;
  const cur: Action[] = [];
  let best = { plan: [] as Action[], utility: -Infinity };
  const go = (c: number, h: number, gain: number) => {
    if (c === p.length) {
      const u = gain - lambda * 100 * stress[h];
      if (u > best.utility + EPS || (u >= best.utility - EPS && beats(cur, best.plan))) best = { plan: [...cur], utility: u };
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
