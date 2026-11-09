import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AddExam } from "../ui/AddExam";
import { addExam, defaultWeight, deleteExam, editExam, mergeAddedExams, prefill } from "./addExam";
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
    expect(e.covered_modules).toEqual([]); // by module order every module is already released by Midterm 1 (no links)
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
    expect(mergeAddedExams(canvasItems, [user])).toEqual([]);
    expect(canvasItems[1]).toMatchObject({ covered_modules: [2], due_at: user.due_at });
    // same day, different title
    const c2 = [item({ item_id: "a:6", name: "Exam 1", type: "exam", due_at: user.due_at })];
    expect(mergeAddedExams(c2, [user])).toEqual([]);
    // no match: kept
    expect(mergeAddedExams([item({})], [user])).toEqual([user]);
  });
});
