import type { createCanvasClient } from "./client";
import { mergeAddedExams } from "./addExam";

type Client = ReturnType<typeof createCanvasClient>;

export interface Item {
  item_id: string;
  name: string;
  type: "exam" | "midterm" | "quiz" | "assignment" | "lab";
  due_at: string | null;
  group_id: number | null;
  group_name: string | null;
  /** Percent of the course grade. */
  weight: number | null;
  /** True when the course has no weighted groups and weight is the item's share of total points. */
  weight_is_fallback: boolean;
  /** Exam-type items and major projects only. */
  study_candidate: boolean;
  points: number | null;
  module_ids: number[];
  class_stats: ClassStats | null;
  /** Exam the student added by hand (canvas/addExam.ts); survives Canvas reloads until a matching Canvas item appears. */
  added_by_you?: boolean;
  /** Module ids the student chose for this exam; wins over the computed default (coverage.ts). */
  covered_modules?: number[];
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
const TYPE_BY_GROUP: [RegExp, Item["type"]][] = [
  [/midterm/i, "midterm"],
  [/exam|final/i, "exam"],
  [/quiz/i, "quiz"],
  [/lab/i, "lab"],
  [/assignment|homework/i, "assignment"],
];
const MAJOR_PROJECT = /project|paper|essay/i;
const MAJOR_SHARE = 15; // percent; design doc, Item-weight cut

/** Group name gives the type; the item name pattern is the fallback. */
export function itemType(groupName: string | null, name: string): Item["type"] {
  const g = TYPE_BY_GROUP.find(([re]) => groupName && re.test(groupName));
  return g ? g[1] : /exam|midterm|final/i.test(name) ? "exam" : "assignment";
}
const STAT_KEYS = ["min", "lower_q", "median", "upper_q", "max", "mean"] as const;
export interface CourseCache {
  canvas_course_id: number;
  course_code: string;
  term: string | null;
  /** Course window (course dates, else term dates); used to place yearless dates in text. */
  start_at?: string | null;
  end_at?: string | null;
  instructor: string | null;
  /** null = Canvas gave us none (unavailable), distinct from an empty list/text. */
  events: { title: string; start_at: string | null; end_at: string | null }[] | null;
  syllabus: string | null; // plain text
  announcements: { title: string; posted_at: string | null; message: string }[] | null;
  /** In Canvas order. unlock_at is when the module opens, null when Canvas gives none. */
  modules: { id: number; name: string; unlock_at?: string | null }[];
  items: Item[];
}
export interface Submission {
  item_id: string;
  submitted_at: string | null; // null for instructor-entered grades (e.g. paper exams)
  due_at: string | null;
  score: number | null; // fraction of points possible in [0, 1]; null when late/missing and not scored
  bonus: boolean; // raw score exceeded 100% and was capped at 1
  lead_days: number | null;
  /** Canvas's own flags, kept for Timeliness. */
  late: boolean;
  missing: boolean;
  seconds_late: number;
}
/** Minimal sink for the two IndexedDB stores (design doc, Data model). */
export interface Stores {
  putCourse(c: CourseCache): Promise<void>;
  /** Optional: when given, student-confirmed due dates survive a reload. */
  getCourse?(id: number): Promise<CourseCache | undefined>;
  putSubmission(s: Submission): Promise<void>;
}

/** Strip tags, decode common entities. shortcut: regex because a service worker has no DOM; upgrade if layout matters. */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|li|h\d|tr)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

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
    "/courses?enrollment_state=active&include[]=term&include[]=teachers&include[]=syllabus_body&per_page=100",
  );
  for (const c of courses) {
    const id = c.id;
    // Any failure (403, 404, 5xx) is a gap recorded as null; the course still loads.
    const orNull = <T,>(p: Promise<T>) => p.catch(() => null);
    const ctx = `context_codes[]=course_${id}`;
    const [events, announcements] = await Promise.all([
      orNull(client.getAll<any>(`/calendar_events?${ctx}&all_events=true&per_page=100`)),
      orNull(client.getAll<any>(`/announcements?${ctx}&start_date=2000-01-01&end_date=2100-01-01&per_page=100`)),
    ]);
    const [modules, groups, assignments, quizzes] = await Promise.all([
      client.getAll<any>(`/courses/${id}/modules?include[]=items&per_page=100`),
      client.getAll<any>(`/courses/${id}/assignment_groups?per_page=100`),
      client.getAll<any>(
        `/courses/${id}/assignments?include[]=submission&include[]=score_statistics&per_page=100`,
      ),
      client.getAll<any>(`/courses/${id}/quizzes?per_page=100`),
    ]);
    const group = new Map<number, any>(groups.map((g) => [g.id, g]));
    const weighted = groups.some((g) => g.group_weight > 0);
    const moduleIds = (key: "Assignment" | "Quiz", contentId: number) =>
      modules
        .filter((m) => (m.items ?? []).some((i: any) => i.type === key && i.content_id === contentId))
        .map((m) => m.id as number);

    const items: Item[] = assignments.map((a) => ({
      item_id: `assignment:${a.id}`,
      name: a.name,
      type: itemType(group.get(a.assignment_group_id)?.name ?? null, a.name),
      due_at: a.due_at ?? null,
      group_id: a.assignment_group_id ?? null,
      group_name: group.get(a.assignment_group_id)?.name ?? null,
      weight: null,
      weight_is_fallback: false,
      study_candidate: false,
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
        type: itemType(group.get(q.assignment_group_id)?.name ?? null, q.title),
        due_at: q.due_at ?? null,
        group_id: q.assignment_group_id ?? null,
        group_name: group.get(q.assignment_group_id)?.name ?? null,
        weight: null,
        weight_is_fallback: false,
        study_candidate: false,
        points: q.points_possible ?? null,
        module_ids: moduleIds("Quiz", q.id),
        class_stats: null,
      });
    }

    // Group weight is split across its items by points (equally if the group has no points);
    // with no weighted groups, use share of total points.
    const inGroup = new Map<number, number>();
    const groupPoints = new Map<number, number>();
    for (const it of items) {
      if (it.group_id == null) continue;
      inGroup.set(it.group_id, (inGroup.get(it.group_id) ?? 0) + 1);
      groupPoints.set(it.group_id, (groupPoints.get(it.group_id) ?? 0) + (it.points ?? 0));
    }
    const totalPoints = items.reduce((t, it) => t + (it.points ?? 0), 0);
    for (const it of items) {
      if (weighted) {
        const gw = group.get(it.group_id as number)?.group_weight;
        const gp = groupPoints.get(it.group_id as number)!;
        it.weight = gw ? (gp > 0 ? (gw * (it.points ?? 0)) / gp : gw / inGroup.get(it.group_id as number)!) : null;
      } else if (totalPoints > 0 && it.points != null) {
        it.weight = (100 * it.points) / totalPoints;
        it.weight_is_fallback = true;
      }
      it.study_candidate =
        it.type === "exam" ||
        it.type === "midterm" ||
        (MAJOR_PROJECT.test(it.group_name ?? "") && (it.weight ?? 0) > MAJOR_SHARE);
    }

    // Canvas still has no date for these; keep the one the student confirmed.
    const old = await stores.getCourse?.(id);
    for (const it of items) {
      const prev = old?.items.find((o) => o.item_id === it.item_id);
      it.due_at ??= prev?.due_at ?? null;
      if (prev?.covered_modules) it.covered_modules = prev.covered_modules;
    }
    items.push(...mergeAddedExams(items, old?.items ?? []));

    await stores.putCourse({
      canvas_course_id: id,
      course_code: c.course_code,
      term: c.term?.name ?? null,
      start_at: c.start_at ?? c.term?.start_at ?? null,
      end_at: c.end_at ?? c.term?.end_at ?? null,
      instructor: c.teachers?.[0]?.display_name ?? null,
      events: events && events.map((e) => ({ title: e.title, start_at: e.start_at ?? null, end_at: e.end_at ?? null })),
      syllabus: typeof c.syllabus_body === "string" ? htmlToText(c.syllabus_body) : null,
      announcements:
        announcements &&
        announcements.map((a) => ({ title: a.title, posted_at: a.posted_at ?? null, message: htmlToText(a.message ?? "") })),
      modules: modules.map((m) => ({ id: m.id, name: m.name, unlock_at: m.unlock_at ?? null })),
      items,
    });

    for (const a of assignments) {
      const s = a.submission;
      if (s?.excused) continue; // excused items are always dropped
      const n = normalizeScore(s, a.points_possible);
      // Late or missing items are kept for Timeliness even without a score.
      if (!n && !s?.late && !s?.missing) continue;
      await stores.putSubmission({
        item_id: `assignment:${a.id}`,
        submitted_at: s.submitted_at ?? null,
        due_at: a.due_at ?? null,
        score: n?.score ?? null,
        bonus: n?.bonus ?? false,
        lead_days: a.due_at && s.submitted_at ? leadDays(a.due_at, s.submitted_at) : null,
        late: !!s.late,
        missing: !!s.missing,
        seconds_late: s.seconds_late ?? 0,
      });
    }
  }
}
