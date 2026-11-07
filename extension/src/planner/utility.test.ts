import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { LAMBDA_PRESETS } from "../model/constants";
import { ACTIONS, type Action } from "../model/query";
import { openDb, stores } from "../storage/db";
import { bestAction, utility } from "./utility";

// design-v2 worked example: P(>= 80) 0.667 / 0.623 / 0.599; stress rises with hours.
const p: Record<Action, number> = { Intense: 0.667, Light: 0.623, Rest: 0.599 };
const stress: Record<Action, number> = { Intense: 0.9, Light: 0.5, Rest: 0.3 };

let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rec = () => {
  const r = {} as Record<Action, number>;
  for (const a of ACTIONS) r[a] = rnd();
  return r;
};

describe("Decision", () => {
  it("EU(a) = 100*P(grade >= t | e, a) - lambda*100*E[stress next | e, a] is a pure function", () => {
    expect(utility(0.6, 0.5, 0.4)).toBeCloseTo(40);
    expect(utility(0.6, 0.5, 0.4)).toBe(utility(0.6, 0.5, 0.4));
  });

  it("lambda has three presets, Grades first, Balanced and Wellbeing first, stored as a setting; values live in the constants module", async () => {
    expect(LAMBDA_PRESETS).toEqual({ grades: 0.1, balanced: 0.4, wellbeing: 1.0 });
    const s = stores(await openDb("settings-test"));
    await s.settings.put({ id: "default", lambda_preset: "wellbeing" });
    expect((await s.settings.get("default"))?.lambda_preset).toBe("wellbeing");
  });

  it("property: with lambda = 0 the highest P wins, and raising lambda never favours a higher-stress action", () => {
    for (let i = 0; i < 500; i++) {
      const P = rec();
      const S = rec();
      const best = (l: number) => ACTIONS.reduce((b, a) => (utility(P[a], S[a], l) > utility(P[b], S[b], l) ? a : b));
      const top = ACTIONS.reduce((b, a) => (P[a] > P[b] ? a : b));
      expect(P[best(0)]).toBe(P[top]);
      const l1 = rnd() * 2;
      const l2 = l1 + rnd() * 2;
      expect(S[best(l2)]).toBeLessThanOrEqual(S[best(l1)]);
    }
  });

  it("changing the preset changes the next plan", () => {
    expect(bestAction(p, stress, "grades")).toBe("Intense");
    expect(bestAction(p, stress, "balanced")).toBe("Rest");
    expect(bestAction(p, { Intense: 0.9, Light: 0.2, Rest: 0.3 }, "balanced")).toBe("Light");
  });
});
