import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Grades } from "./Grades";
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
const html = renderToStaticMarkup(
  <Grades
    courses={[c]}
    now={new Date("2026-10-01T00:00:00Z")}
    submissions={[sub("a:1", { score: 0.84 }), sub("a:2", { score: 1, bonus: true }), sub("a:3", { score: null, missing: true })]}
  />,
);

describe("grades the model used", () => {
  it("lists each graded item with its normalized score", () => {
    expect(html).toContain("STAT 251");
    expect(html).toContain("HW1: 84%");
  });
  it("shows a bonus badge only on capped items", () => {
    expect(html).toContain("HW2: 100%");
    expect(html.match(/bonus, counted as 100%/g)).toHaveLength(1);
  });
  it("shows missing, and excused or ungraded past-due items, as not counted", () => {
    expect(html).toContain("HW3: not counted");
    expect(html).toContain("HW4: not counted");
  });
  it("does not list a future item with no grade", () => {
    expect(html).not.toContain("HW5");
  });
});
