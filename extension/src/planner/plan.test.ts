import { describe, expect, it } from "vitest";
import { ACTIONS, type Action } from "../model/query";
import { bestPlan, HOURS } from "./plan";

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const inst = (n: number, H: number) => ({
  p: Array.from({ length: n }, () => Object.fromEntries(ACTIONS.map((a) => [a, rnd()])) as Record<Action, number>),
  stress: Array.from({ length: H + 1 }, (_, h) => Math.min(1, h * 0.1 + rnd() * 0.1)),
});
const hours = (plan: Action[]) => plan.reduce((s, a) => s + HOURS[a], 0);

describe("plan search", () => {
  it("scores all 3^n plans with U = sum 100 P_c(a_c) - lambda 100 S(h), h <= H, and matches brute force on random instances up to 5 courses", () => {
    for (let t = 0; t < 100; t++) {
      const n = 1 + (t % 5);
      const H = 3 + (t % 9);
      const { p, stress } = inst(n, H);
      const lambda = rnd();
      let bu = -Infinity;
      for (let k = 0; k < 3 ** n; k++) {
        const plan = Array.from({ length: n }, (_, c) => ACTIONS[Math.floor(k / 3 ** c) % 3]);
        const h = hours(plan);
        if (h > H) continue;
        bu = Math.max(bu, plan.reduce((s, a, c) => s + 100 * p[c][a], 0) - lambda * 100 * stress[h]);
      }
      const r = bestPlan(p, stress, lambda);
      expect(r.utility).toBeCloseTo(bu, 9);
      expect(r.plan.reduce((s, a, c) => s + 100 * p[c][a], 0) - lambda * 100 * stress[hours(r.plan)]).toBeCloseTo(bu, 9);
    }
  });

  it("P_c is taken once per course-action pair and S(h) once per h as plain tables, so scoring is additions only", () => {
    // The only inputs are n x 3 numbers and H+1 numbers: there is no callback through which a plan could trigger a query.
    const p = [{ Intense: 0.7, Light: 0.6, Rest: 0.5 }];
    expect(bestPlan(p, [0, 0, 0, 0, 0, 0], 0).plan).toEqual(["Intense"]);
    expect(bestPlan.length).toBe(3);
  });

  it("a constructed instance where greedy marginal allocation is suboptimal returns the better plan", () => {
    // H = 6. Greedy takes the best +1 h steps first (Light everywhere, 5 h) and then cannot afford any +4 h upgrade.
    const p = [
      { Intense: 0.6, Light: 0.55, Rest: 0.1 },
      { Intense: 0.9, Light: 0.5, Rest: 0.1 },
      { Intense: 0.3, Light: 0.28, Rest: 0.1 },
    ];
    const r = bestPlan(p, [0, 0, 0, 0, 0, 0, 0], 0);
    expect(r.plan).toEqual(["Light", "Intense", "Rest"]);
    expect(r.utility).toBeCloseTo(100 * (0.55 + 0.9 + 0.1), 9);
    expect(r.utility).toBeGreaterThan(100 * (0.55 + 0.5 + 0.28)); // greedy's all-Light plan
  });

  it("never returns a plan over H hours, and excludes Intense when H is under 5", () => {
    for (let t = 0; t < 50; t++) {
      const H = t % 12;
      const { p, stress } = inst(5, H);
      const { plan } = bestPlan(p, stress, rnd());
      expect(hours(plan)).toBeLessThanOrEqual(H);
      if (H < 5) expect(plan).not.toContain("Intense");
    }
  });

  it("7 courses run in under 100 ms, not counting the queries", () => {
    const { p, stress } = inst(7, 12);
    const t0 = performance.now();
    bestPlan(p, stress, 0.4);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
