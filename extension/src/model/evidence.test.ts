import { describe, expect, it } from "vitest";
import type { ClassStats, Item } from "../canvas/load";
import {
  conceptDifficulty, DIFFICULTY_CUT, type GradeBin, type Graded, interpolatePercentile, itemPercentile, mastery, perf,
} from "./evidence";

// 20-point item: min 4, Q1 8, median 12, Q3 16, max 20 (points, not fractions)
const stats = (mean = 12): ClassStats => ({ min: 4, lower_q: 8, median: 12, upper_q: 16, max: 20, mean });
const g = (score: number, s: ClassStats | null = stats(), weight: number | null = 10, points = 20): Graded => ({
  score,
  item: {
    item_id: "x", name: "x", type: "assignment", due_at: null, group_id: null, group_name: null, weight,
    weight_is_fallback: false, study_candidate: false, points, module_ids: [], class_stats: s,
  } as Item,
});
// history: 100 students, 50 at 60-70, 50 at 70-80
const history: GradeBin[] = [{ lo: 60, hi: 70, n: 50 }, { lo: 70, hi: 80, n: 50 }];

describe("percentile interpolation", () => {
  it("converts quartiles in points to fractions with the item's points", () => {
    expect(interpolatePercentile(0.6, stats(), 20)).toBeCloseTo(0.5); // 12 / 20
    // on a 40-point item the same raw stats mean max = 0.5, so 0.6 is above the class
    expect(interpolatePercentile(0.6, stats(), 40)).toBeGreaterThan(0.99);
  });
  it("interpolates linearly between knots", () => {
    expect(interpolatePercentile(0.5, stats(), 20)).toBeCloseTo(0.375); // 10 pts, halfway between Q1 and median
  });
});

describe("tests: statistics cases", () => {
  it("complete statistics", () => {
    const r = itemPercentile(g(0.7), history); // 14 pts, halfway Q2-Q3
    expect(r.p).toBeCloseTo(0.625);
    expect(r.weak).toBe(false);
  });
  it("hidden statistics use the historical distribution and flag weak evidence", () => {
    const r = itemPercentile(g(0.7, null), history);
    expect(r.weak).toBe(true);
    expect(r.p).toBeCloseTo(0.5); // 70% sits between the two bins
  });
  it("a score above the max is percentile 1", () => {
    expect(itemPercentile(g(1), history).p).toBe(1);
  });
  it("a score of 0 is percentile 0, not dropped", () => {
    expect(itemPercentile(g(0), history).p).toBe(0);
    expect(perf([g(0)], history)).toBe("Low");
  });
  it("a stat Canvas omitted counts as hidden", () => {
    expect(itemPercentile(g(0.5, { ...stats(), median: null }), history).weak).toBe(true);
  });
});

describe("Perf, mastery and difficulty", () => {
  it("Perf is the weighted mean percentile in thirds", () => {
    expect(perf([g(0.95), g(0.2)], history)).toBe("Med"); // (1*10 + 0*10) / 20
    expect(perf([g(0.95), g(0.2, stats(), 30)], history)).toBe("Low"); // 10/40
    expect(perf([g(0.95)], history)).toBe("High");
    expect(perf([], history)).toBeNull();
  });
  it("Mastery uses the concept's items; none takes the course standing", () => {
    expect(mastery([g(0.95)], "Low", history)).toBe("High");
    expect(mastery([], "Low", history)).toBe("Low");
  });
  it("difficulty compares the module's class mean to the course mean by the named cut", () => {
    const course = [g(0.5, stats(12)), g(0.5, stats(12))]; // mean 60%
    expect(DIFFICULTY_CUT).toBe(5);
    expect(conceptDifficulty([g(0.5, stats(14))], course)).toBe("Easy"); // 70% vs 60%
    expect(conceptDifficulty([g(0.5, stats(10))], course)).toBe("Hard"); // 50% vs 60%
    expect(conceptDifficulty([g(0.5, stats(12.8))], course)).toBe("Med"); // 64% vs 60%
  });
  it("a module with no graded items is Med", () => {
    expect(conceptDifficulty([], [g(0.5)])).toBe("Med");
  });
});
