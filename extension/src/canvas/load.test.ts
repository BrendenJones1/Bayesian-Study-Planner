import { describe, expect, it } from "vitest";
import { createCanvasClient } from "./client";
import { loadCanvas, normalizeScore, type CourseCache, type Submission } from "./load";

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
      score_statistics: { min: 10, lower_q: 25, median: 36, upper_q: 45, max: 50, mean: 35 },
      submission: { submitted_at: "2026-09-08T12:00:00Z", score: 42, workflow_state: "graded" },
    },
    { id: 101, name: "Midterm", due_at: "2026-10-10T12:00:00Z", assignment_group_id: 5, points_possible: 100, submission: { submitted_at: null } },
    { id: 102, name: "HW2", due_at: "2026-09-20T12:00:00Z", assignment_group_id: 5, points_possible: 10, submission: { submitted_at: "2026-09-20T18:00:00Z", score: 7, workflow_state: "graded" } },
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
    expect(subs[0]).toEqual({
      item_id: "assignment:100", submitted_at: "2026-09-08T12:00:00Z",
      due_at: "2026-09-10T12:00:00Z", score: 0.84, bonus: false, lead_days: 2,
    });
  });

  it("requests score statistics with assignments; stores min, lower quartile, median, upper quartile, max, mean when present", async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(fixtures[url.replace("https://canvas.ubc.ca/api/v1", "")] ?? []));
    }) as unknown as typeof fetch;
    await loadCanvas(createCanvasClient({ fetchFn }), { putCourse: async () => {}, putSubmission: async () => {} });
    expect(urls.some((u) => u.includes("/assignments?") && u.includes("include[]=score_statistics"))).toBe(true);
    const { courses } = await run();
    expect(courses[0].items[0].class_stats).toEqual({ min: 10, lower_q: 25, median: 36, upper_q: 45, max: 50, mean: 35 });
  });

  it("missing statistics are recorded as null, never as zero", async () => {
    const { courses } = await run();
    expect(courses[0].items[1].class_stats).toBeNull(); // hidden entirely
    const a = fixtures["/courses/1/assignments?include[]=submission&include[]=score_statistics&per_page=100"] as { score_statistics?: unknown }[];
    a[2].score_statistics = { min: 1, max: 9 }; // partial
    const { courses: c2 } = await run();
    delete a[2].score_statistics;
    expect(c2[0].items[2].class_stats).toEqual({ min: 1, lower_q: null, median: null, upper_q: null, max: 9, mean: null });
  });

  it("lead_days computed as due_at minus submitted_at for every past submission", async () => {
    const { subs } = await run();
    expect(subs.map((s) => s.lead_days)).toEqual([2, -0.25]); // unsubmitted Midterm skipped; late HW2 negative
  });

  it("unit tests run against recorded fixture responses with no live Canvas", async () => {
    await expect(run()).resolves.toBeDefined(); // fetchFn is injected; global fetch never touched
  });
});

describe("score validation", () => {
  const g = (o: object) => ({ workflow_state: "graded", ...o });
  it("scores above 100% (bonus marks) are capped at 1 and flagged", () => {
    expect(normalizeScore(g({ score: 12 }), 10)).toEqual({ score: 1, bonus: true });
  });
  it("excused items are dropped, never recorded as 0", () => {
    expect(normalizeScore(g({ score: null, excused: true }), 10)).toBeNull();
    expect(normalizeScore(g({ score: 0, excused: true }), 10)).toBeNull();
  });
  it("ungraded items are dropped, never recorded as 0", () => {
    expect(normalizeScore({ score: null, workflow_state: "submitted" }, 10)).toBeNull();
    expect(normalizeScore(g({ score: null }), 10)).toBeNull();
  });
  it("missing items are dropped, never recorded as 0", () => {
    expect(normalizeScore({ score: 0, missing: true, workflow_state: "unsubmitted" }, 10)).toBeNull();
  });
  it("negative scores and missing points_possible are dropped, never recorded as 0", () => {
    expect(normalizeScore(g({ score: -1 }), 10)).toBeNull();
    expect(normalizeScore(g({ score: 5 }), 0)).toBeNull();
    expect(normalizeScore(g({ score: 5 }), null)).toBeNull();
  });
  it("loadCanvas stores no submission for an excused item", async () => {
    const key = "/courses/1/assignments?include[]=submission&include[]=score_statistics&per_page=100";
    const a = fixtures[key] as { submission: object }[];
    const orig = a[2].submission;
    try {
      a[2].submission = { submitted_at: "2026-09-20T18:00:00Z", score: null, excused: true, workflow_state: "graded" };
      const { subs } = await run();
      expect(subs.map((s) => s.item_id)).toEqual(["assignment:100"]);
    } finally {
      a[2].submission = orig;
    }
  });
  it("instructor-entered grades (graded, score, no submitted_at) are kept with null lead time", async () => {
    const key = "/courses/1/assignments?include[]=submission&include[]=score_statistics&per_page=100";
    const a = fixtures[key] as { submission: object }[];
    const orig = a[1].submission;
    try {
      a[1].submission = { submitted_at: null, score: 80, workflow_state: "graded" };
      const { subs } = await run();
      expect(subs.find((s) => s.item_id === "assignment:101")).toEqual({
        item_id: "assignment:101", submitted_at: null, due_at: "2026-10-10T12:00:00Z",
        score: 0.8, bonus: false, lead_days: null,
      });
    } finally {
      a[1].submission = orig;
    }
  });
  it("exact 0 and exact 1 are passed through unchanged", () => {
    expect(normalizeScore(g({ score: 0 }), 10)).toEqual({ score: 0, bonus: false });
    expect(normalizeScore(g({ score: 10 }), 10)).toEqual({ score: 1, bonus: false });
  });
});
