import { describe, expect, it } from "vitest";
import { createCanvasClient } from "./client";
import { loadCanvas, normalizeScore, type CourseCache, type Submission } from "./load";

const COURSES = "/courses?enrollment_state=active&include[]=term&include[]=teachers&include[]=syllabus_body&per_page=100";
// Recorded-shape fixture responses keyed by path; no live Canvas.
const fixtures: Record<string, unknown> = {
  "/calendar_events?context_codes[]=course_1&all_events=true&per_page=100": [
    { id: 9, title: "Midterm review", start_at: "2026-10-08T17:00:00Z", end_at: "2026-10-08T18:00:00Z", description: "ignored" },
  ],
  "/announcements?context_codes[]=course_1&start_date=2000-01-01&end_date=2100-01-01&per_page=100": [
    { id: 8, title: "Room change", posted_at: "2026-09-01T10:00:00Z", message: "<p>Now in <b>ESB</b> 1012</p>" },
  ],
  [COURSES]: [
    { id: 1, course_code: "STAT 230", syllabus_body: "<h1>Syllabus</h1><p>Exam &amp; quiz&nbsp;rules</p>", term: { name: "2026W1" }, teachers: [{ display_name: "Dr. Lee" }] },
  ],
  "/courses/1/modules?include[]=items&per_page=100": [
    { id: 10, name: "Week 1", items: [{ type: "Assignment", content_id: 100 }, { type: "Quiz", content_id: 300 }] },
  ],
  "/courses/1/assignment_groups?per_page=100": [
    { id: 5, name: "Assignments", group_weight: 20 },
    { id: 6, name: "Midterms", group_weight: 30 },
  ],
  "/courses/1/assignments?include[]=submission&include[]=score_statistics&per_page=100": [
    {
      id: 100, name: "HW1", due_at: "2026-09-10T12:00:00Z", assignment_group_id: 5, points_possible: 50,
      score_statistics: { min: 10, lower_q: 25, median: 36, upper_q: 45, max: 50, mean: 35 },
      submission: { submitted_at: "2026-09-08T12:00:00Z", score: 42, workflow_state: "graded" },
    },
    { id: 101, name: "Midterm", due_at: "2026-10-10T12:00:00Z", assignment_group_id: 6, points_possible: 100, submission: { submitted_at: null } },
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
    expect(c.modules).toEqual([{ id: 10, name: "Week 1", unlock_at: null }]);
    expect(c.items.map((i) => [i.item_id, i.type, i.weight, i.points, i.module_ids])).toEqual([
      ["assignment:100", "assignment", (20 * 50) / 60, 50, [10]], // group weight 20 split by points (50 of 60)
      ["assignment:101", "midterm", 30, 100, []],
      ["assignment:102", "assignment", (20 * 10) / 60, 10, []],
      ["quiz:300", "assignment", null, 5, [10]],
    ]);
    expect(subs[0]).toEqual({
      item_id: "assignment:100", submitted_at: "2026-09-08T12:00:00Z",
      due_at: "2026-09-10T12:00:00Z", score: 0.84, bonus: false, lead_days: 2, late: false, missing: false, seconds_late: 0,
    });
  });

  it("start_at/end_at come from the course dates first, else the term dates, else are absent", async () => {
    const key = COURSES;
    const orig = fixtures[key];
    const base = { id: 1, course_code: "STAT 230", syllabus_body: "", teachers: [] };
    const window = async (c: object) => {
      fixtures[key] = [{ ...base, ...c }];
      const { courses } = await run();
      return [courses[0].start_at ?? null, courses[0].end_at ?? null];
    };
    try {
      expect(await window({ start_at: "2027-01-05T00:00:00Z", end_at: "2027-04-20T00:00:00Z", term: { name: "T", start_at: "2026-09-01T00:00:00Z", end_at: "2026-12-20T00:00:00Z" } })).toEqual(["2027-01-05T00:00:00Z", "2027-04-20T00:00:00Z"]);
      expect(await window({ term: { name: "T", start_at: "2026-09-01T00:00:00Z", end_at: "2026-12-20T00:00:00Z" } })).toEqual(["2026-09-01T00:00:00Z", "2026-12-20T00:00:00Z"]);
      expect(await window({ term: { name: "T" } })).toEqual([null, null]);
    } finally { fixtures[key] = orig; }
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
        score: 0.8, bonus: false, lead_days: null, late: false, missing: false, seconds_late: 0,
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

describe("assignment groups", () => {
  const A = "/courses/1/assignments?include[]=submission&include[]=score_statistics&per_page=100";
  const runWith = async (groups: object[], assignments: object[]) => {
    const fx: Record<string, unknown> = {
      ...fixtures,
      "/courses/1/assignment_groups?per_page=100": groups,
      [A]: assignments,
      "/courses/1/quizzes?per_page=100": [],
    };
    const fetchFn = (async (url: string) =>
      new Response(JSON.stringify(fx[url.replace("https://canvas.ubc.ca/api/v1", "")] ?? []))) as unknown as typeof fetch;
    const courses: CourseCache[] = [];
    await loadCanvas(createCanvasClient({ fetchFn }), {
      putCourse: async (c) => void courses.push(c),
      putSubmission: async () => {},
    });
    return courses[0].items;
  };
  const a = (id: number, name: string, gid: number, points = 10) => ({
    id, name, assignment_group_id: gid, points_possible: points,
  });

  it("each item stores its assignment-group id and name", async () => {
    const [it] = await runWith([{ id: 7, name: "Labs", group_weight: 10 }], [a(1, "L1", 7)]);
    expect([it.group_id, it.group_name]).toEqual([7, "Labs"]);
  });
  it("weighted groups: item weight is group_weight divided by the items in the group", async () => {
    const items = await runWith(
      [{ id: 1, name: "Homework", group_weight: 30 }, { id: 2, name: "Final Exam", group_weight: 40 }],
      [a(1, "H1", 1), a(2, "H2", 1), a(3, "H3", 1), a(4, "Final", 2)],
    );
    expect(items.map((i) => [i.weight, i.weight_is_fallback])).toEqual([[10, false], [10, false], [10, false], [40, false]]);
  });
  it("weighted groups: group_weight is split across the group's items by points", async () => {
    const items = await runWith([{ id: 1, name: "Homework", group_weight: 30 }], [a(1, "H1", 1, 10), a(2, "H2", 1, 20)]);
    expect(items.map((i) => i.weight)).toEqual([10, 20]);
  });
  it("unweighted groups: weight falls back to share of total points and is marked as a fallback", async () => {
    for (const gw of [0, null]) {
      const items = await runWith([{ id: 1, name: "Homework", group_weight: gw }], [a(1, "H1", 1, 30), a(2, "H2", 1, 70)]);
      expect(items.map((i) => [i.weight, i.weight_is_fallback])).toEqual([[30, true], [70, true]]);
    }
  });
  it("item type comes from the group name, with the name pattern as fallback", async () => {
    const items = await runWith(
      [{ id: 1, name: "Quizzes" }, { id: 2, name: "Midterm" }, { id: 3, name: "Exams" }, { id: 4, name: "Misc" }],
      [a(1, "Q1", 1), a(2, "M", 2), a(3, "E", 3), a(4, "Final exam", 4), a(5, "Thing", 4)],
    );
    expect(items.map((i) => i.type)).toEqual(["quiz", "midterm", "exam", "exam", "assignment"]);
  });
  it("lab group: items are typed lab and are not study-block candidates", async () => {
    const [lab] = await runWith([{ id: 1, name: "Labs", group_weight: 20 }], [a(1, "Lab 1", 1)]);
    expect([lab.type, lab.study_candidate]).toEqual(["lab", false]);
  });
  it("only exam-type items and major projects (project/paper/essay group, share over 15%) are study-block candidates", async () => {
    const items = await runWith(
      [
        { id: 1, name: "Final Exam", group_weight: 40 },
        { id: 2, name: "Project", group_weight: 20 },
        { id: 3, name: "Essays", group_weight: 20 },
        { id: 4, name: "Homework", group_weight: 20 },
      ],
      [a(1, "Final", 1), a(2, "Proj", 2), a(3, "E1", 3), a(4, "E2", 3), a(5, "H1", 4)],
    );
    expect(items.map((i) => i.study_candidate)).toEqual([true, true, false, false, false]); // essays: 10% each
  });
});

describe("late, missing and excused status", () => {
  const key = "/courses/1/assignments?include[]=submission&include[]=score_statistics&per_page=100";
  // Recorded-shape responses: HW1 late (graded), Midterm missing, HW2 excused.
  const withSubs = async (subs: object[]) => {
    const a = fixtures[key] as { submission: object }[];
    const orig = a.map((x) => x.submission);
    try {
      subs.forEach((s, i) => (a[i].submission = s));
      return (await run()).subs;
    } finally {
      orig.forEach((s, i) => (a[i].submission = s));
    }
  };
  const recs = () =>
    withSubs([
      { submitted_at: "2026-09-10T13:00:00Z", score: 42, workflow_state: "graded", late: true, seconds_late: 3600 },
      { submitted_at: null, score: null, workflow_state: "unsubmitted", missing: true },
      { submitted_at: "2026-09-20T18:00:00Z", score: null, excused: true, late: true, workflow_state: "graded" },
    ]);

  it("submission records keep Canvas late, missing and seconds_late next to submitted_at", async () => {
    const [late, missing] = await recs();
    expect(late).toMatchObject({ submitted_at: "2026-09-10T13:00:00Z", late: true, missing: false, seconds_late: 3600 });
    expect(missing).toMatchObject({ submitted_at: null, late: false, missing: true, seconds_late: 0 });
  });
  it("a late or missing item is recorded for Timeliness without producing a score; excused items are still dropped", async () => {
    const subs = await withSubs([
      { submitted_at: "2026-09-10T13:00:00Z", score: null, workflow_state: "submitted", late: true, seconds_late: 3600 },
      { submitted_at: null, score: 0, workflow_state: "unsubmitted", missing: true },
      { submitted_at: null, score: null, excused: true, missing: true, workflow_state: "graded" },
    ]);
    expect(subs.map((s) => [s.item_id, s.score])).toEqual([["assignment:100", null], ["assignment:101", null]]);
  });
  it("scores, bonus flags and lead_days of graded items are unchanged", async () => {
    const [late] = await recs();
    expect(late).toMatchObject({ score: 0.84, bonus: false, lead_days: -1 / 24 });
  });
});

describe("calendar events, syllabus and announcements", () => {
  it("calendar events for each course are stored with title, start and end", async () => {
    const { courses } = await run();
    expect(courses[0].events).toEqual([{ title: "Midterm review", start_at: "2026-10-08T17:00:00Z", end_at: "2026-10-08T18:00:00Z" }]);
  });

  it("the syllabus body is requested with include[]=syllabus_body and stored as plain text", async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(fixtures[url.replace("https://canvas.ubc.ca/api/v1", "")] ?? []));
    }) as unknown as typeof fetch;
    await loadCanvas(createCanvasClient({ fetchFn }), { putCourse: async () => {}, putSubmission: async () => {} });
    expect(urls.some((u) => u.includes("/courses?") && u.includes("include[]=syllabus_body"))).toBe(true);
    expect((await run()).courses[0].syllabus).toBe("Syllabus\nExam & quiz rules");
  });

  it("announcements are read for each course and stored with title, posted_at and plain-text message", async () => {
    const { courses } = await run();
    expect(courses[0].announcements).toEqual([{ title: "Room change", posted_at: "2026-09-01T10:00:00Z", message: "Now in ESB 1012" }]);
  });

  it("a course where any of the three is unavailable still loads, and the gap is recorded as null, not empty", async () => {
    const saved = { ...fixtures };
    delete fixtures["/calendar_events?context_codes[]=course_1&all_events=true&per_page=100"];
    delete fixtures["/announcements?context_codes[]=course_1&start_date=2000-01-01&end_date=2100-01-01&per_page=100"];
    (fixtures[COURSES] as { syllabus_body: string | null }[])[0] = { ...(fixtures[COURSES] as object[])[0], syllabus_body: null } as never;
    try {
      const { courses } = await run();
      expect(courses).toHaveLength(1);
      expect(courses[0].items).toHaveLength(4);
      expect([courses[0].events, courses[0].syllabus, courses[0].announcements]).toEqual([null, null, null]);
    } finally {
      Object.assign(fixtures, saved);
    }
  });
});
