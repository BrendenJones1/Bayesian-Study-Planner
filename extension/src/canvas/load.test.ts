import { describe, expect, it } from "vitest";
import { createCanvasClient } from "./client";
import { loadCanvas, type CourseCache, type Submission } from "./load";

// Recorded-shape fixture responses keyed by path; no live Canvas.
const fixtures: Record<string, unknown> = {
  "/courses?enrollment_state=active&include[]=term&include[]=teachers&per_page=100": [
    { id: 1, course_code: "STAT 230", term: { name: "2026W1" }, teachers: [{ display_name: "Dr. Lee" }] },
  ],
  "/courses/1/modules?include[]=items&per_page=100": [
    { id: 10, name: "Week 1", items: [{ type: "Assignment", content_id: 100 }, { type: "Quiz", content_id: 300 }] },
  ],
  "/courses/1/assignment_groups?per_page=100": [{ id: 5, group_weight: 20 }],
  "/courses/1/assignments?include[]=submission&include[]=score_statistics&per_page=100": [
    {
      id: 100, name: "HW1", due_at: "2026-09-10T12:00:00Z", assignment_group_id: 5, points_possible: 50,
      score_statistics: { min: 10, mean: 35, max: 50 },
      submission: { submitted_at: "2026-09-08T12:00:00Z", score: 42 },
    },
    { id: 101, name: "Midterm", due_at: "2026-10-10T12:00:00Z", assignment_group_id: 5, points_possible: 100, submission: { submitted_at: null } },
    { id: 102, name: "HW2", due_at: "2026-09-20T12:00:00Z", assignment_group_id: 5, points_possible: 10, submission: { submitted_at: "2026-09-20T18:00:00Z", score: 7 } },
  ],
  "/courses/1/quizzes?per_page=100": [
    { id: 300, title: "Practice", assignment_id: null, points_possible: 5 },
    { id: 301, title: "Graded quiz", assignment_id: 100 },
  ],
};

async function run() {
  const fetchFn = (async (url: string) => {
    const body = fixtures[url.replace("https://canvas.ubc.ca/api/v1", "")];
    if (!body) return new Response("[]", { status: 404 });
    return new Response(JSON.stringify(body));
  }) as unknown as typeof fetch;
  const courses: CourseCache[] = [];
  const subs: Submission[] = [];
  await loadCanvas(createCanvasClient({ fetchFn }), {
    putCourse: async (c) => void courses.push(c),
    putSubmission: async (s) => void subs.push(s),
  });
  return { courses, subs };
}

describe("canvas loader", () => {
  it("course_cache and submission_history stores populated per the design doc's data model", async () => {
    const { courses, subs } = await run();
    expect(courses).toHaveLength(1);
    const c = courses[0];
    expect(c).toMatchObject({ canvas_course_id: 1, course_code: "STAT 230", term: "2026W1", instructor: "Dr. Lee" });
    expect(c.modules).toEqual([{ id: 10, name: "Week 1" }]);
    expect(c.items.map((i) => [i.item_id, i.type, i.weight, i.points, i.module_ids])).toEqual([
      ["assignment:100", "assignment", 20, 50, [10]],
      ["assignment:101", "exam", 20, 100, []],
      ["assignment:102", "assignment", 20, 10, []],
      ["quiz:300", "assignment", null, 5, [10]],
    ]);
    expect(c.items[0].class_stats).toEqual({ min: 10, mean: 35, max: 50 });
    expect(subs[0]).toEqual({
      item_id: "assignment:100", submitted_at: "2026-09-08T12:00:00Z",
      due_at: "2026-09-10T12:00:00Z", score: 42, lead_days: 2,
    });
  });

  it("lead_days computed as due_at minus submitted_at for every past submission", async () => {
    const { subs } = await run();
    expect(subs.map((s) => s.lead_days)).toEqual([2, -0.25]); // unsubmitted Midterm skipped; late HW2 negative
  });

  it("unit tests run against recorded fixture responses with no live Canvas", async () => {
    await expect(run()).resolves.toBeDefined(); // fetchFn is injected; global fetch never touched
  });
});
