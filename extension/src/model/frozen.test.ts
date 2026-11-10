import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Item, Submission } from "../canvas/load";
import { MIGRATIONS, openDb, stores } from "../storage/db";
import { freezePrediction } from "./frozen";
import type { CourseData } from "./query";

const root = new URL("../../../", import.meta.url);
const fx = JSON.parse(readFileSync(new URL("shared/fixtures/inference.json", root), "utf8"));
const base = JSON.parse(readFileSync(new URL(fx.cpts, root), "utf8"));
// shipped cpts.json lacks timeliness.some_late_max (see query.test.ts)
const cpts = { ...base, cut_points: { ...base.cut_points, timeliness: { some_late_max: 1 / 3 } } };

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
const hw1 = item("hw1", "2026-09-01T17:00:00Z");
const hw2 = item("hw2", "2026-10-25T17:00:00Z"); // due after the exam
const course = (submissions: Submission[]): CourseData => ({
  canvas_course_id: 1, course_code: "COSC 111", term: null, instructor: null, events: null, syllabus: null, announcements: null,
  modules: [{ id: 1, name: "M1" }, { id: 2, name: "M2" }, { id: 3, name: "M3" }], items: [hw1, hw2, exam], submissions,
});
const PAST = new Date("2026-10-21T00:00:00Z");
let n = 0;
const fresh = () => openDb(`frozen-${n++}`);

describe("frozen baseline prediction", () => {
  it("criteria 1 and 2: stores the decile distribution with a timestamp and the most likely decile once the due date passes", async () => {
    const db = await fresh();
    expect(await freezePrediction(db, cpts, course([sub("hw1")]), exam, [], new Date("2026-10-19T00:00:00Z"))).toBeNull(); // not due yet
    const rec = await freezePrediction(db, cpts, course([sub("hw1")]), exam, [], PAST);
    expect(rec?.deciles).toHaveLength(10);
    expect(rec!.deciles.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(rec!.created_at).toBe(PAST.toISOString());
    expect(rec!.most_likely).toBe(rec!.deciles.indexOf(Math.max(...rec!.deciles)) + 1);
    expect(await stores(db).frozen_prediction.get("exam")).toEqual(rec);
    db.close();
  });

  it("criterion 3: a stored record is never modified and recomputing does not overwrite it", async () => {
    const db = await fresh();
    const first = await freezePrediction(db, cpts, course([sub("hw1", { score: 0.9 })]), exam, [], PAST);
    const again = await freezePrediction(db, cpts, course([sub("hw1", { score: 0.1 })]), exam, [], new Date("2026-11-01T00:00:00Z"));
    expect(again).toEqual(first);
    expect(await stores(db).frozen_prediction.get("exam")).toEqual(first);
    db.close();
  });

  it("criterion 4: the frozen_prediction store changes through an appended migration", async () => {
    const name = `frozen-old-${n++}`;
    const old = await openDb(name, MIGRATIONS.slice(0, -1));
    old.transaction("frozen_prediction", "readwrite").objectStore("frozen_prediction").put({ item_id: "a", p_at_least_target: 0.7 });
    await new Promise((r) => (old.transaction("frozen_prediction").oncomplete = r));
    old.close();
    const db = await openDb(name);
    expect(db.version).toBe(MIGRATIONS.length);
    expect(await stores(db).frozen_prediction.getAll()).toEqual([]);
    db.close();
  });

  it("criterion 5: a grade released after the due date does not change the stored prediction", async () => {
    const db = await fresh();
    const before = await freezePrediction(db, cpts, course([sub("hw1")]), exam, [], PAST);
    // the exam's own grade and a later item's grade arrive afterwards; neither is evidence for the exam
    const later = course([sub("hw1"), sub("exam", { score: 0.95 }), sub("hw2", { score: 0.95 })]);
    expect(await freezePrediction(db, cpts, later, exam, [], new Date("2026-11-10T00:00:00Z"))).toEqual(before);
    expect(await stores(db).frozen_prediction.get("exam")).toEqual(before);
    // and the evidence itself ignores them: a fresh store gives the same distribution
    const db2 = await fresh();
    expect((await freezePrediction(db2, cpts, later, exam, [], PAST))?.deciles).toEqual(before?.deciles);
    db.close();
    db2.close();
  });
});
