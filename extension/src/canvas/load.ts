import type { createCanvasClient } from "./client";

type Client = ReturnType<typeof createCanvasClient>;

export interface Item {
  item_id: string;
  name: string;
  type: "exam" | "assignment";
  due_at: string | null;
  weight: number | null;
  points: number | null;
  module_ids: number[];
  class_stats: { min: number; mean: number; max: number } | null;
}
export interface CourseCache {
  canvas_course_id: number;
  course_code: string;
  term: string | null;
  instructor: string | null;
  modules: { id: number; name: string }[];
  items: Item[];
}
export interface Submission {
  item_id: string;
  submitted_at: string;
  due_at: string | null;
  score: number | null;
  lead_days: number | null;
}
/** Minimal sink for the two IndexedDB stores (design doc, Data model). */
export interface Stores {
  putCourse(c: CourseCache): Promise<void>;
  putSubmission(s: Submission): Promise<void>;
}

const DAY = 86_400_000;
/** lead_days = due_at − submitted_at, in days (positive = early). */
export const leadDays = (dueAt: string, submittedAt: string): number =>
  (Date.parse(dueAt) - Date.parse(submittedAt)) / DAY;

/* eslint-disable @typescript-eslint/no-explicit-any -- Canvas JSON is untyped; fields are read defensively */
export async function loadCanvas(client: Client, stores: Stores): Promise<void> {
  const courses = await client.getAll<any>(
    "/courses?enrollment_state=active&include[]=term&include[]=teachers&per_page=100",
  );
  for (const c of courses) {
    const id = c.id;
    const [modules, groups, assignments, quizzes] = await Promise.all([
      client.getAll<any>(`/courses/${id}/modules?include[]=items&per_page=100`),
      client.getAll<any>(`/courses/${id}/assignment_groups?per_page=100`),
      client.getAll<any>(
        `/courses/${id}/assignments?include[]=submission&include[]=score_statistics&per_page=100`,
      ),
      client.getAll<any>(`/courses/${id}/quizzes?per_page=100`),
    ]);
    const weight = new Map<number, number>(groups.map((g) => [g.id, g.group_weight]));
    const moduleIds = (key: "Assignment" | "Quiz", contentId: number) =>
      modules
        .filter((m) => (m.items ?? []).some((i: any) => i.type === key && i.content_id === contentId))
        .map((m) => m.id as number);

    const items: Item[] = assignments.map((a) => ({
      item_id: `assignment:${a.id}`,
      name: a.name,
      type: /exam|midterm|final/i.test(a.name) ? "exam" : "assignment", // shortcut: name heuristic, replace if Canvas exposes exam type
      due_at: a.due_at ?? null,
      weight: weight.get(a.assignment_group_id) ?? null,
      points: a.points_possible ?? null,
      module_ids: moduleIds("Assignment", a.id),
      class_stats: a.score_statistics
        ? { min: a.score_statistics.min, mean: a.score_statistics.mean, max: a.score_statistics.max }
        : null,
    }));
    // Graded quizzes already appear as assignments; keep only standalone ones.
    for (const q of quizzes.filter((q) => !q.assignment_id)) {
      items.push({
        item_id: `quiz:${q.id}`,
        name: q.title,
        type: "assignment",
        due_at: q.due_at ?? null,
        weight: null,
        points: q.points_possible ?? null,
        module_ids: moduleIds("Quiz", q.id),
        class_stats: null,
      });
    }

    await stores.putCourse({
      canvas_course_id: id,
      course_code: c.course_code,
      term: c.term?.name ?? null,
      instructor: c.teachers?.[0]?.display_name ?? null,
      modules: modules.map((m) => ({ id: m.id, name: m.name })),
      items,
    });

    for (const a of assignments) {
      const s = a.submission;
      if (!s?.submitted_at) continue;
      await stores.putSubmission({
        item_id: `assignment:${a.id}`,
        submitted_at: s.submitted_at,
        due_at: a.due_at ?? null,
        score: s.score ?? null,
        lead_days: a.due_at ? leadDays(a.due_at, s.submitted_at) : null,
      });
    }
  }
}
