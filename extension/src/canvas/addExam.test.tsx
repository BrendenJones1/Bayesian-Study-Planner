import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AddExam } from "../ui/AddExam";
import { addExam, defaultWeight, deleteExam, editExam, mergeAddedExams, prefill } from "./addExam";
import { loadCanvas } from "./load";
import { courseStanding } from "../model/bounds";
import { proposeFromText } from "./propose";
import { buildEvidence, gradeQuery, type CourseData } from "../model/query";
import type { CourseCache, Item } from "./load";

const root = new URL("../../../", import.meta.url);
const fx = JSON.parse(readFileSync(new URL("shared/fixtures/inference.json", root), "utf8"));
const cpts = JSON.parse(readFileSync(new URL(fx.cpts, root), "utf8"));
const cuts = { ...cpts.cut_points, timeliness: { some_late_max: 1 / 3 } };

const item = (o: Partial<Item>): Item => ({
  item_id: "a:1", name: "HW1", type: "assignment", due_at: "2026-09-01T17:00:00Z", group_id: 1, group_name: "Assignments", weight: 10,
  weight_is_fallback: false, study_candidate: false, points: 20, module_ids: [1], class_stats: { min: 4, lower_q: 8, median: 12, upper_q: 16, max: 20, mean: 12 }, ...o,
});
const midterm1 = item({ item_id: "a:2", name: "Midterm 1", type: "midterm", group_id: 2, group_name: "Exams", weight: 20, due_at: "2026-10-01T17:00:00Z", module_ids: [], study_candidate: true });
const course = (items: Item[]): CourseCache => ({
  canvas_course_id: 1, course_code: "COSC 111", term: null, instructor: null, events: null, syllabus: null, announcements: null,
  modules: [{ id: 1, name: "M1" }, { id: 2, name: "M2" }, { id: 3, name: "M3" }], items,
});
const base = course([item({}), midterm1]);

describe("Add exam", () => {
  it("form defaults: modules since the previous exam, weight from the matching group split across its items", () => {
    const next = addExam(base, { title: "Midterm 2", day: "2026-11-10" }, "x");
    const e = next.items.at(-1)!;
    expect(e).toMatchObject({ item_id: "user:x", type: "midterm", added_by_you: true, weight: 10, group_name: "Exams" });
    expect(e.covered_modules).toEqual([]); // no unlock dates, no links: Midterm 1 already releases every module
    const dated = { ...base, modules: [{ id: 1, name: "M1", unlock_at: "2026-09-01T00:00:00Z" }, { id: 2, name: "M2", unlock_at: "2026-10-10T00:00:00Z" }, { id: 3, name: "M3", unlock_at: "2026-10-25T00:00:00Z" }] };
    expect(addExam(dated, { title: "Midterm 2", day: "2026-11-10" }, "d").items.at(-1)!.covered_modules).toEqual([2, 3]); // released since Midterm 1
    expect(defaultWeight(course([item({})]), "Final")).toBeNull(); // no matching group: manual %
    expect(addExam(course([item({})]), { title: "Final", day: "2026-12-01", weight: 30 }, "y").items.at(-1)!.weight).toBe(30);
    expect(addExam(base, { title: "Final", day: "2026-12-01", modules: [2, 3] }, "z").items.at(-1)!.covered_modules).toEqual([2, 3]);
  });

  it("proposals from the syllabus open the same form pre-filled", () => {
    const c = { ...course([item({}), item({ item_id: "a:9", name: "Final Exam", type: "exam", due_at: null })]), syllabus: "The Final Exam is on Dec 12, 2026. Final exam covers Modules 2-3." };
    const ps = proposeFromText(c);
    const date = ps.find((p) => p.kind === "date")!;
    const cov = ps.find((p) => p.kind === "coverage")!;
    expect(prefill(c, date)).toEqual({ title: "Final Exam", day: "2026-12-12" });
    expect(prefill(c, cov)).toEqual({ title: "Final Exam", modules: [2, 3] });
    const html = renderToStaticMarkup(<AddExam courses={[c]} onChange={() => {}} />);
    expect(html).toContain("Use in form");
    expect(html).toContain("(provisional)");
  });

  it("stored exams are tagged 'added by you', editable and deletable", () => {
    const next = addExam(base, { title: "Midterm 2", day: "2026-11-10", modules: [2] }, "x");
    expect(renderToStaticMarkup(<AddExam courses={[next]} onChange={() => {}} />)).toContain("(added by you)");
    const edited = editExam(next, "user:x", { title: "Midterm 2b", day: "2026-11-12", modules: [3] });
    expect(edited.items.filter((i) => i.added_by_you)).toHaveLength(1);
    expect(edited.items.at(-1)).toMatchObject({ name: "Midterm 2b", covered_modules: [3] });
    expect(deleteExam(edited, "user:x").items).toEqual(base.items);
    expect(deleteExam(base, "a:2").items).toHaveLength(2); // Canvas items are never deleted
  });

  it("end to end: buildEvidence uses a user-added exam like a Canvas exam", () => {
    const graded = { item_id: "a:1", submitted_at: null, due_at: null, score: 0.6, bonus: false, lead_days: null, late: false, missing: false, seconds_late: 0 };
    const withUser = addExam(course([item({})]), { title: "Midterm", day: "2026-10-20", modules: [1] }, "x");
    const canvasLike = course([item({}), item({ item_id: "a:5", name: "Midterm", type: "midterm", due_at: withUser.items.at(-1)!.due_at, group_id: 2, group_name: "Exams", module_ids: [], weight: 10, study_candidate: true })]);
    const a: CourseData = { ...withUser, submissions: [graded] };
    const b: CourseData = { ...canvasLike, submissions: [graded], coverage_override: { item_id: "a:5", module_ids: [1], confirmed: true } };
    const ea = buildEvidence(a, a.items.at(-1)!, [], "2026-10-12", cuts);
    const eb = buildEvidence(b, b.items.at(-1)!, [], "2026-10-12", cuts);
    expect(ea).toMatchObject({ DaysLeft: "8+", M1: "Med" });
    expect({ ...ea, ItemWeight: 0 }).toEqual({ ...eb, ItemWeight: 0 });
    expect(gradeQuery(cpts, a, a.items.at(-1)!, [], "2026-10-12", 80).Intense.p).toBeGreaterThan(0);
  });

  it("unconfirmed mappings are provisional in predictions; chosen or confirmed ones are not", () => {
    const run = (c: CourseData, e: Item) => gradeQuery(cpts, c, e, [], "2026-10-12", 80).Intense.provisional;
    const sub = { item_id: "a:1", submitted_at: null, due_at: null, score: 0.6, bonus: false, lead_days: null, late: false, missing: false, seconds_late: 0 };
    const exam = item({ item_id: "a:5", name: "Midterm", type: "midterm", due_at: "2026-10-20T17:00:00Z", module_ids: [] });
    const c: CourseData = { ...course([item({}), exam]), submissions: [sub] };
    expect(run(c, exam)).toBe(true);
    expect(run({ ...c, coverage_override: { item_id: "a:5", module_ids: [1], confirmed: true } }, exam)).toBeUndefined();
    const user = addExam(course([item({})]), { title: "Midterm", day: "2026-10-20" }, "x");
    expect(run({ ...user, submissions: [sub] }, user.items.at(-1)!)).toBeUndefined();
  });

  it("a matching Canvas item later merges into one exam, never a duplicate", () => {
    const user = addExam(course([item({})]), { title: "Midterm", day: "2026-10-20", modules: [2] }, "x").items.at(-1)!;
    const canvasItems = [item({}), item({ item_id: "a:5", name: "midterm", type: "midterm", due_at: null, study_candidate: true })];
    const merged = mergeAddedExams(canvasItems, [user]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ item_id: "a:5", covered_modules: [2], due_at: user.due_at });
    expect(canvasItems[1].covered_modules).toBeUndefined(); // inputs not mutated
    expect(canvasItems[1].due_at).toBeNull();
    // same local day and both exams, different title
    const c2 = [item({ item_id: "a:6", name: "Exam 1", type: "exam", due_at: user.due_at })];
    expect(mergeAddedExams(c2, [user])).toHaveLength(1);
    // same day but the Canvas item is not an exam: kept apart
    expect(mergeAddedExams([item({ item_id: "a:7", name: "HW", due_at: user.due_at })], [user])).toHaveLength(2);
    expect(mergeAddedExams([item({})], [user])).toHaveLength(2);
  });

  it("merges through loadCanvas with a fake Canvas response", async () => {
    const user = addExam(course([item({})]), { title: "Midterm", day: "2026-10-20", modules: [2] }, "x").items.at(-1)!;
    const get: Record<string, unknown[]> = {
      "/courses?": [{ id: 1, course_code: "COSC 111" }],
      "/modules": [{ id: 1, name: "M1", items: [] }, { id: 2, name: "M2", items: [] }],
      "/assignment_groups": [{ id: 2, name: "Midterms", group_weight: 30 }],
      "/assignments": [{ id: 5, name: "midterm", assignment_group_id: 2, due_at: user.due_at, points_possible: 50 }],
    };
    const client = { getAll: async (path: string) => get[Object.keys(get).find((k) => path.includes(k)) ?? ""] ?? [] } as never;
    let saved: CourseCache | undefined;
    await loadCanvas(client, { putCourse: async (c) => void (saved = c), getCourse: async () => course([user]), putSubmission: async () => {} });
    expect(saved!.items).toHaveLength(1);
    expect(saved!.items[0]).toMatchObject({ item_id: "assignment:5", covered_modules: [2], weight: 30 });
    expect(saved!.group_weights).toEqual({ 2: 30 });
  });

  it("group weights re-split on add, delete and edit, always summing to the group weight", () => {
    const mid = item({ item_id: "a:3", name: "Midterm 1", type: "midterm", group_id: 3, group_name: "Midterms", weight: 30, points: 50, study_candidate: true });
    const c = { ...course([item({}), mid]), group_weights: { 3: 30 } };
    const sum = (x: CourseCache) => x.items.filter((i) => i.group_id === 3).reduce((a, i) => a + (i.weight ?? 0), 0);
    const added = addExam(c, { title: "Midterm 2", day: "2026-11-10" }, "m2");
    expect(added.items.filter((i) => i.group_id === 3).map((i) => i.weight)).toEqual([15, 15]);
    const edited = editExam(added, "user:m2", { title: "Midterm 2", day: "2026-11-11" });
    expect(sum(edited)).toBeCloseTo(30);
    expect(deleteExam(added, "user:m2").items.find((i) => i.item_id === "a:3")!.weight).toBe(30);
    // by points when every item has points
    const pts = { ...c, items: [...c.items, item({ item_id: "a:4", name: "Midterm 1b", type: "midterm", group_id: 3, group_name: "Midterms", weight: 0, points: 100 })] };
    const split = deleteExam(addExam(pts, { title: "Midterm 2", day: "2026-11-10" }, "m3"), "user:m3");
    expect(split.items.filter((i) => i.group_id === 3).map((i) => i.weight)).toEqual([10, 20]);
    // G and R stay in [0, 1]
    const sub = { item_id: "a:3", submitted_at: null, due_at: null, score: 0.9, bonus: false, lead_days: null, late: false, missing: false, seconds_late: 0 };
    for (const x of [added, edited, c]) {
      const { G, R } = courseStanding(x.items, [sub]);
      expect(G).toBeGreaterThanOrEqual(0);
      expect(G).toBeLessThanOrEqual(1);
      expect(R).toBeGreaterThanOrEqual(0);
      expect(R).toBeLessThanOrEqual(1);
    }
  });

  it("an explicitly set weight is kept on edit", () => {
    const mid = item({ item_id: "a:3", name: "Midterm 1", type: "midterm", group_id: 3, group_name: "Midterms", weight: 30, study_candidate: true });
    const c = { ...course([mid]), group_weights: { 3: 30 } };
    const added = addExam(c, { title: "Midterm 2", day: "2026-11-10", weight: 5 }, "m2");
    const edited = editExam(added, "user:m2", { title: "Midterm 2b", day: "2026-11-11" });
    expect(edited.items.find((i) => i.item_id === "user:m2")!.weight).toBe(5);
    expect(edited.items.find((i) => i.item_id === "a:3")!.weight).toBe(25);
  });

  it("Quiz 1 in a Quizzes group is a quiz, with no study block", () => {
    const q = item({ item_id: "a:8", name: "Quiz 0", type: "quiz", group_id: 4, group_name: "Quizzes", weight: 10 });
    const c = { ...course([q, midterm1]), group_weights: { 4: 10 } };
    const e = addExam(c, { title: "Quiz 1", day: "2026-10-05" }, "q").items.find((i) => i.item_id === "user:q")!;
    expect(e).toMatchObject({ type: "quiz", study_candidate: false, group_name: "Quizzes", weight: 5 });
    expect(addExam(c, { title: "Quiz 1", day: "2026-10-05", kind: "project" }, "p").items.at(-1)).toMatchObject({ study_candidate: true });
    expect(addExam(c, { title: "Final", day: "2026-12-01" }, "f").items.at(-1)).toMatchObject({ type: "exam", study_candidate: true });
  });

  it("module numbers from text match a module named with that number before Canvas order", () => {
    const c = { ...course([item({})]), modules: [{ id: 10, name: "Intro" }, { id: 11, name: "Week 3" }, { id: 12, name: "Module 2" }] };
    const p = { kind: "coverage", item_id: "a:1", modules: [2, 3] } as never;
    expect(prefill(c, p)).toEqual({ title: "HW1", modules: [12, 11] });
    expect(prefill(c, { kind: "coverage", item_id: "a:1", modules: [1] } as never)).toEqual({ title: "HW1", modules: [10] }); // none named 1: Canvas order
  });
});
