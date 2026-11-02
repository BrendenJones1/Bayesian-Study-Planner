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
  class_stats: ClassStats | null;
}
/** Canvas score_statistics; a field Canvas omits is null, never 0. */
export interface ClassStats {
  min: number | null;
  lower_q: number | null;
  median: number | null;
  upper_q: number | null;
  max: number | null;
  mean: number | null;
}
const STAT_KEYS = ["min", "lower_q", "median", "upper_q", "max", "mean"] as const;
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
  submitted_at: string | null; // null for instructor-entered grades (e.g. paper exams)
  due_at: string | null;
  score: number; // fraction of points possible in [0, 1]
  bonus: boolean; // raw score exceeded 100% and was capped at 1
  lead_days: number | null;
}
/** Minimal sink for the two IndexedDB stores (design doc, Data model). */
export interface Stores {
  putCourse(c: CourseCache): Promise<void>;
  /** Optional: when given, student-confirmed due dates survive a reload. */
  getCourse?(id: number): Promise<CourseCache | undefined>;
  putSubmission(s: Submission): Promise<void>;
}

const DAY = 86_400_000;
/** lead_days = due_at − submitted_at, in days (positive = early). */
export const leadDays = (dueAt: string, submittedAt: string): number =>
  (Date.parse(dueAt) - Date.parse(submittedAt)) / DAY;

/**
 * Canvas submission -> model score, or null to drop it (excused, ungraded, missing).
 * Exact 0 and 1 pass through untouched; only >1 is capped (design doc, Score validation).
 */
export function normalizeScore(
  s: { score?: number | null; excused?: boolean; missing?: boolean; workflow_state?: string } | null | undefined,
  pointsPossible: number | null | undefined,
): { score: number; bonus: boolean } | null {
  if (!s || s.excused || s.missing || s.workflow_state !== "graded") return null;
  // No points_possible (null/0) means no fraction to compute: dropped. Negative scores are invalid: dropped, not turned into 0.
  if (s.score == null || s.score < 0 || !pointsPossible || pointsPossible <= 0) return null;
  const f = s.score / pointsPossible;
  return f > 1 ? { score: 1, bonus: true } : { score: f, bonus: false };
}

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
        ? (Object.fromEntries(STAT_KEYS.map((k) => [k, a.score_statistics[k] ?? null])) as unknown as ClassStats)
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

    // Canvas still has no date for these; keep the one the student confirmed.
    const old = await stores.getCourse?.(id);
    for (const it of items) it.due_at ??= old?.items.find((o) => o.item_id === it.item_id)?.due_at ?? null;

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
      const n = normalizeScore(s, a.points_possible);
      if (!n) continue;
      await stores.putSubmission({
        item_id: `assignment:${a.id}`,
        submitted_at: s.submitted_at ?? null,
        due_at: a.due_at ?? null,
        score: n.score,
        bonus: n.bonus,
        lead_days: a.due_at && s.submitted_at ? leadDays(a.due_at, s.submitted_at) : null,
      });
    }
  }
}
