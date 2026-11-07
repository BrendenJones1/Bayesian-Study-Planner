import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Item, Submission } from "../canvas/load";
import { buildEvidence, gradeQuery, type CourseData } from "./query";
import { TARGETS } from "./infer";

const root = new URL("../../../", import.meta.url);
const fx = JSON.parse(readFileSync(new URL("shared/fixtures/inference.json", root), "utf8"));
const cpts = JSON.parse(readFileSync(new URL(fx.cpts, root), "utf8"));
const cuts = cpts.cut_points;

const stats = { min: 4, lower_q: 8, median: 12, upper_q: 16, max: 20, mean: 12 };
const item = (id: string, due: string | null, o: Partial<Item> = {}): Item => ({
  item_id: id, name: id, type: "assignment", due_at: due, group_id: 1, group_name: "Assignments", weight: 10,
  weight_is_fallback: false, study_candidate: false, points: 20, module_ids: [1], class_stats: stats, ...o,
});
const sub = (id: string, o: Partial<Submission> = {}): Submission => ({
  item_id: id, submitted_at: null, due_at: null, score: 0.6, bonus: false, lead_days: null, late: false, missing: false,
  seconds_late: 0, ...o,
});
const exam = item("exam", "2026-10-20T17:00:00Z", { type: "midterm", group_id: 2, group_name: "Exams", module_ids: [3] });
const course = (items: Item[], submissions: Submission[], code = "COSC 111"): CourseData => ({
  canvas_course_id: 1, course_code: code, term: null, instructor: null, events: null, syllabus: null, announcements: null,
  modules: [{ id: 1, name: "M1" }, { id: 2, name: "M2" }, { id: 3, name: "M3" }], items: [...items, exam], submissions,
});
const TODAY = "2026-10-12";
// shipped cpts.json lacks timeliness.some_late_max (see PR notes), so supply the documented 1/3
const ev = (c: CourseData) => buildEvidence(c, exam, [], TODAY, { ...cuts, timeliness: { some_late_max: 1 / 3 } });
const hw1 = item("hw1", "2026-09-01T17:00:00Z");

describe("grade query", () => {
  it("criterion 1 and 5: Intense, Light and Rest match pgmpy on the fixture to 1e-9", () => {
    const c = course([hw1], [sub("hw1")]);
    expect(ev(c)).toMatchObject({ M1: "Med", M2: "Med", M3: "Med", D1: "Med", Timeliness: "On time", DaysLeft: "8+", GradedSoFar: 25, ItemWeight: "<=15%" });
    for (const t of TARGETS) {
      const r = gradeQuery(cpts, c, exam, [], TODAY, t);
      for (const q of fx.queries.filter((q: { course: string }) => q.course === "COSC 111"))
        expect(Math.abs(r[q.action as "Intense"].p - q.p_grade[String(t)]), `${q.action} @${t}`).toBeLessThan(1e-9);
    }
  });

  it("criterion 2: bounds are applied before inference", () => {
    // 100% graded at 40%: a 90 target is out of reach, whatever the network says
    const full = course([item("hw", "2026-09-01T17:00:00Z", { weight: 100 })], [sub("hw", { score: 0.4 })]);
    const r = gradeQuery(cpts, full, exam, [], TODAY, 90);
    expect(r.Intense).toMatchObject({ p: 0, bound: { reason: "out of reach" } });
  });

  it("criterion 3: the personalized slot is null until the offset exists", () => {
    const r = gradeQuery(cpts, course([hw1], [sub("hw1")]), exam, [], TODAY, 80);
    for (const a of ["Intense", "Light", "Rest"] as const) expect(r[a].personalized).toBeNull();
  });

  it("criterion 4: only UBC boundaries are accepted", () => {
    const c = course([hw1], [sub("hw1")]);
    for (const t of [49, 65, 100, 0]) expect(() => gradeQuery(cpts, c, exam, [], TODAY, t)).toThrow(RangeError);
    for (const t of [50, 55, 60, 64, 68, 72, 76, 80, 85, 90]) expect(() => gradeQuery(cpts, c, exam, [], TODAY, t)).not.toThrow();
  });
});

describe("buildEvidence Timeliness", () => {
  const late = (id: string) => sub(id, { late: true });
  it("an item due after the exam is not an earlier item", () => {
    const after = item("after", "2026-10-25T17:00:00Z");
    expect(ev(course([hw1, after], [sub("hw1"), late("after")])).Timeliness).toBe("On time");
  });
  it("an item due but not yet submitted counts as missing; one not yet past due counts as neither", () => {
    const due = item("due", "2026-10-05T17:00:00Z");
    const notYet = item("notYet", "2026-10-12T23:00:00Z");
    const ok = [hw1, item("a", "2026-09-02T17:00:00Z"), item("b", "2026-09-03T17:00:00Z")];
    const missing = sub("due", { score: null, missing: true }); // 1 of 4 earlier items
    expect(ev(course([...ok, due], [...ok.map((i) => sub(i.item_id)), missing])).Timeliness).toBe("Some late");
    expect(ev(course([hw1, notYet], [sub("hw1")])).Timeliness).toBe("On time");
  });
  it("an undated item is excluded", () => {
    expect(ev(course([hw1, item("u", null)], [sub("hw1"), late("u")])).Timeliness).toBe("On time");
  });
  it("an excused item (no stored submission) is dropped", () => {
    expect(ev(course([hw1, item("ex", "2026-09-05T17:00:00Z")], [sub("hw1")])).Timeliness).toBe("On time");
  });
  it("a course with no earlier items leaves Timeliness unobserved", () => {
    const e = ev(course([], []));
    expect(e).not.toHaveProperty("Timeliness");
    expect(e).not.toHaveProperty("M1");
  });
  it("an item due later today, after the exam's start of day, counts only if on or before today", () => {
    const future = item("future", "2026-10-13T17:00:00Z");
    expect(ev(course([hw1, future], [sub("hw1"), late("future")])).Timeliness).toBe("On time");
  });
});
