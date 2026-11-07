import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Item, Submission } from "../canvas/load";
import { bound, courseStanding, gradedSoFarState, inferBounded, itemWeightState } from "./bounds";
import { ITEM_WEIGHT_CUT } from "./constants";
import { infer } from "./infer";

vi.mock("./infer", async (orig) => {
  const m = await orig<typeof import("./infer")>();
  return { ...m, infer: vi.fn(m.infer) };
});

const root = new URL("../../../", import.meta.url);
const fx = JSON.parse(readFileSync(new URL("shared/fixtures/inference.json", root), "utf8"));
const cpts = JSON.parse(readFileSync(new URL(fx.cpts, root), "utf8"));
const spy = vi.mocked(infer);
beforeEach(() => {
  spy.mockClear(); // braces: returning the mock would make vitest call it as a teardown
});

describe("item weight and graded so far", () => {
  it("criterion 1: item weight splits at the named 15% cut (fractions)", () => {
    expect(ITEM_WEIGHT_CUT).toBe(0.15);
    expect(itemWeightState(0.15)).toBe("<=15%");
    expect(itemWeightState(0.151)).toBe(">15%");
  });
  it("criterion 1: graded so far uses the 25% table below half and the 50% table from half up", () => {
    expect([0, 0.1, 0.249, 0.25, 0.499].map(gradedSoFarState)).toEqual([25, 25, 25, 25, 25]);
    expect([0.5, 0.6, 1].map(gradedSoFarState)).toEqual([50, 50, 50]);
  });
});

describe("achievable-grade bounds", () => {
  it("criterion 2/5: out of reach when c*G + R < t; the exact boundary is not", () => {
    // c=.6, G=.5: best reachable is .30 + .50 = .80
    expect(bound(0.6, 0.5, 0.8001)?.p).toBe(0);
    expect(bound(0.6, 0.5, 0.8)).toBeNull();
  });
  it("criterion 2/5: locked in when c*G >= t; the exact boundary is locked", () => {
    // c=.9, G=.5: banked .45
    expect(bound(0.9, 0.5, 0.45)?.p).toBe(1);
    expect(bound(0.9, 0.5, 0.4501)).toBeNull();
  });
  it("criterion 2: real numbers - c=0.78, G=0.40, t=0.80 is neither bound", () => {
    expect(bound(0.78, 0.4, 0.8)).toBeNull();
  });
  it("criterion 2: real numbers - c=0.90, G=0.95, t=0.80 is locked in", () => {
    expect(bound(0.9, 0.95, 0.8)).toMatchObject({ p: 1, reason: "already locked in" });
  });
  it("criterion 5: G = 0 never bounds a target of 90% or less", () => {
    for (const t of [0.5, 0.9]) expect(bound(0, 0, t)).toBeNull();
  });
  it("criterion 5: G = 1 is decided by c alone", () => {
    expect(bound(0.72, 1, 0.76)).toMatchObject({ p: 0, reason: "out of reach" });
    expect(bound(0.76, 1, 0.76)).toMatchObject({ p: 1, reason: "already locked in" });
  });
  it("criterion 3: a hit returns its reason with the numbers used", () => {
    expect(bound(0.6, 0.5, 0.9)).toEqual({ p: 0, reason: "out of reach", c: 0.6, G: 0.5, R: 0.5, target: 0.9 });
  });
  it("criterion 4: between the bounds the network's answer is unchanged", () => {
    const q = fx.queries[0];
    const r = inferBounded(cpts, q.course, q.evidence, q.action, 0.7, 0.25);
    expect(r.bounds).toEqual({});
    expect(r.p_grade).toEqual(infer(cpts, q.course, q.evidence, q.action).p_grade);
  });
  it("criterion 2: a bound overrides the network and infer runs only for unbounded targets", () => {
    const q = fx.queries[0];
    // banked .855 locks 50..85; 90 stays open (.855 + .05 >= .90)
    const r = inferBounded(cpts, q.course, q.evidence, q.action, 0.9, 0.95);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][4]).toEqual([90]);
    expect(r.p_grade[85]).toBe(1);
    expect(r.bounds[85].reason).toBe("already locked in");
    expect(r.bounds[90]).toBeUndefined();
  });
  it("criterion 2: bounds first - infer is never called when every target is bounded", () => {
    const q = fx.queries[0];
    const r = inferBounded(cpts, q.course, {}, q.action, 0.95, 1); // evidence would be invalid for the network
    expect(spy).not.toHaveBeenCalled();
    expect(Object.values(r.p_grade).every((p) => p === 1)).toBe(true);
    expect(r.e_stress_next).toBeNull();
  });
});

describe("course standing from loader items", () => {
  const item = (id: string, group: number, weight: number, points: number, fallback = false): Item => ({
    item_id: id, name: id, type: "assignment", due_at: null, group_id: group, group_name: null,
    weight, weight_is_fallback: fallback, study_candidate: false, points, module_ids: [], class_stats: null,
  });
  const sub = (id: string, score: number | null): Submission => ({
    item_id: id, submitted_at: null, due_at: null, score, bonus: false, lead_days: null, late: false, missing: false, seconds_late: 0,
  });

  it("splits group weight by points within the group; G, R and c count only graded items", () => {
    // Group 1 is 40%: a (30 pts) and b (10 pts); the loader splits it equally (20 + 20). Group 2 is 60%: one exam.
    const items = [item("a", 1, 20, 30), item("b", 1, 20, 10), item("e", 2, 60, 100)];
    const s = courseStanding(items, [sub("a", 0.8), sub("b", null)]);
    expect(s.itemShare.a).toBeCloseTo(0.3);
    expect(s.itemShare.b).toBeCloseTo(0.1);
    expect(s.itemShare.e).toBeCloseTo(0.6);
    expect(s.G).toBeCloseTo(0.3); // b is ungraded
    expect(s.R).toBeCloseTo(0.7);
    expect(s.c).toBeCloseTo(0.8);
  });
  it("without weighted groups the share is the points share", () => {
    const items = [item("a", 1, 30, 30, true), item("b", 1, 70, 70, true)];
    const s = courseStanding(items, [sub("a", 1), sub("b", 0.5)]);
    expect(s.G).toBeCloseTo(1);
    expect(s.c).toBeCloseTo(0.3 + 0.35);
    expect(s.R).toBe(0);
  });
  it("weights summing past 1 (extra credit) clamp R at 0", () => {
    const items = [item("a", 1, 100, 10), item("x", 2, 10, 5)];
    const s = courseStanding(items, [sub("a", 0.9), sub("x", 1)]);
    expect(s.G).toBeCloseTo(1.1);
    expect(s.R).toBe(0);
  });
  it("nothing graded gives G = 0, c = 0", () => {
    expect(courseStanding([item("a", 1, 100, 10)], [])).toMatchObject({ G: 0, R: 1, c: 0 });
  });
});
