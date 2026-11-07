import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bound, gradedSoFarState, inferBounded, itemWeightState, ITEM_WEIGHT_CUT } from "./bounds";
import { infer } from "./infer";

const root = new URL("../../../", import.meta.url);
const fx = JSON.parse(readFileSync(new URL("shared/fixtures/inference.json", root), "utf8"));
const cpts = JSON.parse(readFileSync(new URL(fx.cpts, root), "utf8"));

describe("item weight and graded so far", () => {
  it("criterion 1: item weight splits at the named 15% cut", () => {
    expect(ITEM_WEIGHT_CUT).toBe(15);
    expect(itemWeightState(15)).toBe("<=15%");
    expect(itemWeightState(15.1)).toBe(">15%");
  });
  it("criterion 1: graded so far is the highest checkpoint not above the share; over half uses 50", () => {
    expect([0, 10, 24.9, 25, 49.9].map(gradedSoFarState)).toEqual([25, 25, 25, 25, 25]);
    expect([50, 60, 100].map(gradedSoFarState)).toEqual([50, 50, 50]);
  });
});

describe("achievable-grade bounds", () => {
  it("criterion 2/5: out of reach when c*G + 100*R < t; the exact boundary is not", () => {
    // c=60, G=.5: best reachable is 30 + 50 = 80
    expect(bound(60, 0.5, 80.01)?.p).toBe(0);
    expect(bound(60, 0.5, 80)).toBeNull();
  });
  it("criterion 2/5: locked in when c*G >= t; the exact boundary is locked", () => {
    // c=90, G=.5: banked 45
    expect(bound(90, 0.5, 45)?.p).toBe(1);
    expect(bound(90, 0.5, 45.01)).toBeNull();
  });
  it("criterion 5: G = 0 never bounds a target of 90 or less", () => {
    for (const t of [50, 90]) expect(bound(0, 0, t)).toBeNull();
  });
  it("criterion 5: G = 1 is decided by c alone", () => {
    expect(bound(72, 1, 76)).toMatchObject({ p: 0, reason: "out of reach" });
    expect(bound(76, 1, 76)).toMatchObject({ p: 1, reason: "already locked in" });
  });
  it("criterion 3: a hit returns its reason with the numbers used", () => {
    expect(bound(60, 0.5, 90)).toEqual({ p: 0, reason: "out of reach", c: 60, G: 0.5, R: 0.5, target: 90 });
  });
  it("criterion 4: between the bounds the network's answer is unchanged", () => {
    const q = fx.queries[0];
    const r = inferBounded(cpts, q.course, q.evidence, q.action, 70, 0.25);
    expect(r.bounds).toEqual({});
    expect(r.p_grade).toEqual(infer(cpts, q.course, q.evidence, q.action).p_grade);
  });
  it("criterion 2: a bound overrides the network's number", () => {
    const q = fx.queries[0];
    const r = inferBounded(cpts, q.course, q.evidence, q.action, 95, 1);
    expect(r.p_grade[90]).toBe(1);
    expect(r.bounds[90].reason).toBe("already locked in");
  });
});
