import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Item } from "../canvas/load";
import { THETA } from "./constants";
import { infer } from "./infer";
import { deadlineCount, loadState, stressCurve } from "./stress";

const root = new URL("../../../", import.meta.url);
const fx = JSON.parse(readFileSync(new URL("shared/fixtures/inference.json", root), "utf8"));
const cpts = JSON.parse(readFileSync(new URL(fx.cpts, root), "utf8"));
const cuts = cpts.cut_points.load_deadlines_next_3_days;
const item = (due_at: string | null) => ({ due_at }) as Item;

describe("load and stress", () => {
  it("criterion 1: Load is the deadline count in the next 3 days, bucketed by the cpts.json thirds", () => {
    const items = [item("2026-11-09T18:00:00Z"), item("2026-11-11T12:00:00Z"), item("2026-11-12T12:00:00Z"), item(null)];
    expect(deadlineCount(items, "2026-11-09", "UTC")).toBe(2); // the 12th and the undated item are outside
    expect(deadlineCount(items, "2026-11-12", "UTC")).toBe(1);
    expect([0, 1, 2, 5].map((n) => loadState(n, cuts))).toEqual(["Low", "Med", "High", "High"]);
  });

  it("criterion 2: Stress now and Stress next come from cpts.json; a tap is evidence, else inferred", () => {
    const [noTap, high, low] = [undefined, "High" as const, "Low" as const].map(
      (stressNow) => stressCurve(cpts, { loadToday: 1, loadTomorrow: 1, H: 0, stressNow })[0],
    );
    expect(high).toBeGreaterThan(low);
    expect(noTap).toBeGreaterThan(low);
    expect(noTap).toBeLessThan(high);
    const bent = JSON.parse(JSON.stringify(cpts));
    for (const k of Object.keys(bent.tables.stress_next.values)) bent.tables.stress_next.values[k] = [0, 0, 1];
    expect(stressCurve(bent, { loadToday: 0, loadTomorrow: 0, H: 0 })[0]).toBeCloseTo(1, 12);
  });

  it("criterion 3: theta (default 0.2) adds 5*theta, theta and 0 deadline-equivalents for Intense, Light and Rest", () => {
    expect(THETA).toBe(0.2);
    // 0 deadlines tomorrow: Light (1 h) adds 0.2 -> Med; Rest stays Low. With theta 0, nothing moves.
    const s = (h: number, theta?: number) => stressCurve(cpts, { loadToday: 0, loadTomorrow: 0, H: 5, theta })[h];
    expect(s(0)).toBeLessThan(s(5));
    expect(s(5, 0)).toBeCloseTo(s(0), 12);
    // Intense at 5 h with theta 0.2 equals one extra deadline tomorrow
    expect(s(5)).toBeCloseTo(stressCurve(cpts, { loadToday: 0, loadTomorrow: 1, H: 0 })[0], 12);
  });

  it("criterion 4: S(h) is returned for every h from 0 to H", () => {
    const c = stressCurve(cpts, { loadToday: 0, loadTomorrow: 0, H: 8 });
    expect(c).toHaveLength(9);
    expect(c.every((x) => x >= 0 && x <= 1)).toBe(true);
  });

  it("criterion 5: changing Load leaves P(grade >= t) identical", () => {
    const q = fx.queries[0];
    const p = (today: string, tomorrow: string) =>
      infer(cpts, q.course, { ...q.evidence, LoadToday: today, LoadTomorrow: tomorrow }, q.action).p_grade;
    expect(p("Low", "Low")).toEqual(p("High", "High"));
    expect(p("Low", "High")).toEqual(p("Med", "Low"));
  });

  it("criterion 6: S(h) matches pgmpy on the fixture to 1e-9", () => {
    expect(fx.stress_curves.length).toBeGreaterThan(0);
    for (const c of fx.stress_curves) {
      const got = stressCurve(cpts, { loadToday: c.load_today, loadTomorrow: c.load_tomorrow, H: c.hours, theta: c.theta, stressNow: c.stress_now });
      expect(got).toHaveLength(c.curve.length);
      got.forEach((x, h) => expect(Math.abs(x - c.curve[h]), `${c.name} h=${h}`).toBeLessThan(1e-9));
    }
  });
});
