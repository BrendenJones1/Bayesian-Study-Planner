import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Courses } from "./Courses";
import type { CourseCache, Item, Submission } from "../canvas/load";

const item = (id: string, name: string, due_at: string | null): Item => ({
  item_id: id, name, type: "assignment", due_at, group_id: null, group_name: null, weight: null, weight_is_fallback: false,
  study_candidate: false, points: 10, module_ids: [], class_stats: null,
});
const sub = (id: string, o: Partial<Submission>): Submission => ({
  item_id: id, submitted_at: null, due_at: null, score: 0.8, bonus: false, lead_days: null, late: false, missing: false, seconds_late: 0, ...o,
});
const c: CourseCache = {
  canvas_course_id: 1, course_code: "STAT 251", term: null, instructor: null, events: null, syllabus: null, announcements: null, modules: [],
  items: [
    item("a:1", "HW1", "2026-09-01T00:00:00Z"),
    item("a:2", "HW2", "2026-09-08T00:00:00Z"),
    item("a:3", "HW3", "2026-09-15T00:00:00Z"),
    item("a:4", "HW4", "2026-09-22T00:00:00Z"),
    item("a:5", "HW5", "2027-01-01T00:00:00Z"),
  ],
};
const NOW = new Date("2026-10-01T00:00:00Z");
const subs = [sub("a:1", { score: 0.84 }), sub("a:2", { score: 1, bonus: true }), sub("a:3", { score: null, missing: true })];
const render = (courses: CourseCache[], submissions = subs) =>
  renderToStaticMarkup(<Courses courses={courses} submissions={submissions} onChange={() => {}} now={NOW} />);
const exam = (id: string, due: string): Item => ({ ...item(id, "Final", due), type: "exam" });
const course = (id: number, code: string, items: Item[], modules: CourseCache["modules"] = []): CourseCache => ({ ...c, canvas_course_id: id, course_code: code, items, modules });
const html = render([c]);

describe("per-course sections", () => {
  it("one details section per course, sorted by course code", () => {
    const h = render([course(2, "STAT 251", []), course(1, "MATH 100", [])]);
    expect(h.match(/<details/g)).toHaveLength(2);
    expect(h.indexOf("MATH 100")).toBeLessThan(h.indexOf("STAT 251"));
  });
  it("lists each graded item with its normalized score", () => {
    expect(html).toContain("HW1: 84%");
  });
  it("shows a bonus badge only on capped items", () => {
    expect(html).toContain("HW2: 100%");
    expect(html.match(/bonus, counted as 100%/g)).toHaveLength(1);
  });
  it("gives the reason for items not counted", () => {
    expect(html).toContain("HW3: not counted (late or missing, no score)");
    expect(html).toContain("HW4: not counted (no score yet)");
  });
  it("does not list a future item with no grade", () => {
    expect(html).not.toContain("HW5");
  });
  it("heading shows code, counted items and next exam, or that none is set", () => {
    expect(html).toContain("STAT 251: 2 graded items counted, no exam date set");
    expect(render([course(1, "MATH 100", [exam("e", "2027-01-05T12:00:00Z")])])).toContain("0 graded items counted, next exam 2027-01-05");
  });
  it("starts open only with an exam in the next 14 days", () => {
    expect(render([course(1, "A 1", [exam("e", "2026-10-10T12:00:00Z")])])).toMatch(/<details open/);
    expect(render([course(1, "A 1", [exam("e", "2026-11-10T12:00:00Z")])])).not.toMatch(/<details open/);
    expect(html).not.toMatch(/<details open/);
  });
  it("Add exam shows one checkbox per module on its own line, inside the course section", () => {
    const h = render([course(1, "A 1", [], [{ id: 1, name: "Week 1" }, { id: 2, name: "Week 2" }])]);
    expect(h.match(/<div><label><input type="checkbox"/g)).toHaveLength(2);
    expect(h.indexOf("<details")).toBeLessThan(h.indexOf("Covered modules"));
    expect(h.indexOf("Covered modules")).toBeLessThan(h.indexOf("</details>"));
  });
});
