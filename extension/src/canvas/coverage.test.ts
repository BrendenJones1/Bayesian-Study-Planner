import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { coverage } from "./coverage";
import type { CourseCache, Item } from "./load";
import { openDb, stores } from "../storage/db";

const item = (item_id: string, due_at: string | null, module_ids: number[] = [], type: Item["type"] = "exam"): Item => ({
  item_id, name: item_id, type, due_at, group_id: null, group_name: null, weight: null, weight_is_fallback: false,
  study_candidate: true, points: 100, module_ids, class_stats: null,
});
const course = (modules: CourseCache["modules"], items: Item[]): CourseCache => ({
  canvas_course_id: 1, course_code: "STAT 251", term: null, instructor: null, events: null, syllabus: null, announcements: null, modules, items,
});
const mods = [
  { id: 1, name: "M1", unlock_at: "2026-09-01T00:00:00Z" },
  { id: 2, name: "M2", unlock_at: "2026-09-15T00:00:00Z" },
  { id: 3, name: "M3", unlock_at: "2026-10-05T00:00:00Z" },
  { id: 4, name: "M4", unlock_at: "2026-11-01T00:00:00Z" },
];
const mid = item("mid", "2026-10-10T00:00:00Z");
const fin = item("fin", "2026-12-10T00:00:00Z");

describe("coverage rule", () => {
  it("first exam covers every module released by its date", () => {
    expect(coverage(course(mods, [mid, fin]), "mid")).toEqual([1, 2, 3]);
  });
  it("second exam covers the modules released since the previous exam", () => {
    expect(coverage(course(mods, [mid, fin]), "fin")).toEqual([4]);
  });
  it("uses module order when Canvas gives no unlock_at", () => {
    const m = [1, 2, 3, 4].map((id) => ({ id, name: `M${id}`, unlock_at: null }));
    const c = course(m, [item("mid", "2026-10-10T00:00:00Z", [2]), item("fin", "2026-12-10T00:00:00Z", [4])]);
    expect(coverage(c, "mid")).toEqual([1, 2]);
    expect(coverage(c, "fin")).toEqual([3, 4]);
  });
  it("returns an empty set for a course with no modules", () => {
    expect(coverage(course([], [mid, fin]), "fin")).toEqual([]);
  });
  it("keeps module links already on items and does not change them", () => {
    const linked = item("hw", "2026-10-01T00:00:00Z", [2], "assignment");
    const c = course(mods, [linked, mid]);
    coverage(c, "mid");
    expect(linked.module_ids).toEqual([2]);
  });
  it("an override wins and is stored with confirmed unset until the student confirms", async () => {
    const o = { item_id: "fin", module_ids: [2, 3], confirmed: null };
    expect(coverage(course(mods, [mid, fin]), "fin", o)).toEqual([2, 3]);
    const db = await openDb("cov-test");
    const s = stores(db);
    await s.coverage_override.put(o);
    expect((await s.coverage_override.get("fin"))?.confirmed).toBeNull();
    db.close();
  });
  it("is a pure function: same inputs, same output", () => {
    const c = course(mods, [mid, fin]);
    expect(coverage(c, "fin")).toEqual(coverage(c, "fin"));
  });
});
