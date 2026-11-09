import { coverage } from "./coverage";
import { endOfDay } from "./undated";
import type { CourseCache, Item } from "./load";
import type { Proposal } from "./propose";

export interface ExamInput {
  title: string;
  /** Local date, YYYY-MM-DD. */
  day: string;
  /** Module ids; omitted = the modules released since the previous exam (coverage.ts). */
  modules?: number[];
  /** Percent of the course grade; used only when no group matches. */
  weight?: number | null;
}

const examType = (title: string): Item["type"] => (/midterm/i.test(title) ? "midterm" : "exam");

/** The group already holding this exam type (group name decides type, as in the loader) and its total weight, or null. */
function matchingGroup(course: CourseCache, type: Item["type"]) {
  const inGroup = course.items.filter((i) => i.type === type && i.group_id != null && !i.weight_is_fallback && (i.weight ?? 0) > 0);
  if (!inGroup.length) return null;
  const { group_id, group_name } = inGroup[0];
  const total = inGroup.filter((i) => i.group_id === group_id).reduce((a, i) => a + (i.weight ?? 0), 0);
  return { group_id, group_name, total, n: course.items.filter((i) => i.group_id === group_id).length };
}

/** Default weight: the matching group's weight split evenly across its items, the new one included. Null = ask for a manual %. */
export function defaultWeight(course: CourseCache, title: string): number | null {
  const g = matchingGroup(course, examType(title));
  return g && g.total / (g.n + 1);
}

/** Returns the course with the exam added (item_id "user:<id>"), tagged added_by_you. */
export function addExam(course: CourseCache, input: ExamInput, id: string = crypto.randomUUID()): CourseCache {
  const type = examType(input.title);
  const g = matchingGroup(course, type);
  const draft: Item = {
    item_id: `user:${id}`,
    name: input.title,
    type,
    due_at: endOfDay(input.day),
    group_id: g?.group_id ?? null,
    group_name: g?.group_name ?? null,
    weight: defaultWeight(course, input.title) ?? input.weight ?? null,
    weight_is_fallback: false,
    study_candidate: true,
    points: null,
    module_ids: [],
    class_stats: null,
    added_by_you: true,
  };
  const next = { ...course, items: [...course.items, draft] };
  draft.covered_modules = input.modules ?? coverage(next, draft.item_id);
  return next;
}

/** Edits an exam the student added, in place; Canvas items are left alone. */
export function editExam(course: CourseCache, itemId: string, input: ExamInput): CourseCache {
  const old = course.items.find((i) => i.item_id === itemId && i.added_by_you);
  if (!old) return course;
  const without = { ...course, items: course.items.filter((i) => i !== old) };
  const edited = addExam(without, input, itemId.slice("user:".length)).items.at(-1)!;
  return { ...course, items: course.items.map((i) => (i === old ? edited : i)) };
}

export const deleteExam = (course: CourseCache, itemId: string): CourseCache => ({
  ...course,
  items: course.items.filter((i) => !(i.item_id === itemId && i.added_by_you)),
});

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
const day = (iso: string) => new Date(iso).toDateString();

/**
 * Called by the loader. A student-added exam that now matches a Canvas exam (same title, or same local day)
 * is merged into the Canvas item (which keeps the student's modules and a date Canvas lacks).
 * Returns the added exams still unmatched, so there is never a duplicate.
 */
export function mergeAddedExams(canvasItems: Item[], old: Item[]): Item[] {
  return old.filter((u) => {
    if (!u.added_by_you) return false;
    const m = canvasItems.find(
      (c) =>
        (c.type === "exam" || c.type === "midterm") &&
        (norm(c.name) === norm(u.name) || (c.due_at && u.due_at && day(c.due_at) === day(u.due_at))),
    );
    if (!m) return true;
    m.covered_modules ??= u.covered_modules;
    m.due_at ??= u.due_at;
    return false;
  });
}

/** Pre-fills the form from a syllabus/announcement proposal. Module numbers in text map to Canvas module order (1 = first). */
export function prefill(course: CourseCache, p: Proposal): Partial<ExamInput> {
  const title = course.items.find((i) => i.item_id === p.item_id)?.name;
  if (p.kind === "date") return { title, day: p.date };
  return { title, modules: p.modules.flatMap((n) => course.modules[n - 1]?.id ?? []) };
}
