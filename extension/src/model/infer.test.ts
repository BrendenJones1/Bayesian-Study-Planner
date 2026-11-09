import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gradeMapFor, infer, TARGETS } from "./infer";

const root = new URL("../../../", import.meta.url);
const fx = JSON.parse(readFileSync(new URL("shared/fixtures/inference.json", root), "utf8"));
const cpts = JSON.parse(readFileSync(new URL(fx.cpts, root), "utf8"));

describe("exact inference matches the pgmpy fixtures", () => {
  it("criterion 3: every fixture query agrees to 1e-9", () => {
    for (const q of fx.queries) {
      const r = infer(cpts, q.course, q.evidence, q.action);
      for (const t of TARGETS) expect(Math.abs(r.p_grade[t] - q.p_grade[String(t)]), `${q.name} @${t}`).toBeLessThan(1e-9);
      expect(Math.abs(r.e_stress_next - q.e_stress_next), q.name).toBeLessThan(1e-9);
    }
  });

  it("criterion 4: fixtures cover no graded items, hidden class statistics, targets 50 and 90, all three actions", () => {
    const names: string[] = fx.queries.map((q: { name: string }) => q.name);
    expect(names.some((n) => n.startsWith("no graded items"))).toBe(true);
    expect(names.some((n) => n.startsWith("hidden class statistics"))).toBe(true);
    expect(new Set(fx.queries.map((q: { action: string }) => q.action))).toEqual(new Set(["Intense", "Light", "Rest"]));
    for (const q of fx.queries) expect(Object.keys(q.p_grade)).toEqual(expect.arrayContaining(["50", "90"]));
  });

  it("criterion 1: answers come from the tables, with no sampling", () => {
    const q = fx.queries[0];
    const bent = JSON.parse(JSON.stringify(cpts));
    bent.tables.grade_map.courses[q.course]["80"] = Array(10).fill(0.5);
    expect(infer(bent, q.course, q.evidence, q.action, [80]).p_grade[80]).toBeCloseTo(0.5, 12);
    expect(infer(cpts, q.course, q.evidence, q.action).p_grade).toEqual(infer(cpts, q.course, q.evidence, q.action).p_grade);
  });

  it("fixtures include a course with no history, answered from pooled_medium", () => {
    const q = fx.queries.find((x: { course: string }) => x.course === "NOHIST 999");
    expect(cpts.tables.grade_map.courses["NOHIST 999"]).toBeUndefined();
    expect(gradeMapFor(cpts, "NOHIST 999")?.weak).toBe(true);
    expect(q).toBeTruthy();
  });

  it("gradeMapFor returns null when pooled_medium is missing", () => {
    const old = JSON.parse(JSON.stringify(cpts));
    delete old.tables.grade_map.pooled_medium;
    expect(gradeMapFor(old, "NOHIST 999")).toBeNull();
    expect(() => infer(old, "NOHIST 999", {}, "Rest")).toThrow(/No grade data/);
  });

  it("criterion 5: 24 queries (8 courses, 3 actions) run in under 1 second", () => {
    expect(fx.queries).toHaveLength(24);
    const t0 = performance.now();
    for (const q of fx.queries) infer(cpts, q.course, q.evidence, q.action);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
