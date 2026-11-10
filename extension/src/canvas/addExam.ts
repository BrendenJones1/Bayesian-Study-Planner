import { coverage } from "./coverage";
import { endOfDay } from "./undated";
import type { CourseCache, Item } from "./load";
import type { Proposal } from "./propose";

export type Kind = "exam" | "quiz" | "project";

export interface ExamInput {
  title: string;
  /** Local date, YYYY-MM-DD. */
  day: string;
  /** Module ids; omitted = the modules released since the previous exam (coverage.ts). */
  modules?: number[];
  /** Percent of the course grade, set by the student and kept on edit. Omitted = the group's split (manual % only if no group). */
  weight?: number | null;
  /** Omitted = from the title. Only exam and project get study blocks. */
  kind?: Kind;
}

const KIND_RE: Record<Kind, RegExp> = { exam: /midterm|exam|final/i, quiz: /quiz/i, project: /project|paper|essay/i };
/** shortcut: the kind comes from title words, then the group of that kind; a group named "Tests" is not found, so use the select. */
export const defaultKind = (title: string): Kind => (KIND_RE.quiz.test(title) ? "quiz" : KIND_RE.project.test(title) ? "project" : "exam");
export const kindOf = (i: Item): Kind => (i.type === "quiz" ? "quiz" : i.type === "assignment" && i.study_candidate ? "project" : "exam");

/** The weighted assignment group of this kind (a midterm title prefers a midterm group), or null. */
function matchingGroup(course: CourseCache, kind: Kind, title: string) {
  const groups = new Map<number, string>();
  for (const i of course.items) if (i.group_id != null && i.group_name && !i.weight_is_fallback) groups.set(i.group_id, i.group_name);
  const mid = (n: string) => +(/midterm/i.test(n) === /midterm/i.test(title));
  const found = [...groups].filter(([, n]) => KIND_RE[kind].test(n)).sort(([, a], [, b]) => mid(b) - mid(a))[0];
  return found ? { id: found[0], name: found[1] } : null;
}

/** The group's total weight: the cached group_weight, else what its items hold now. */
const groupTotal = (course: CourseCache, gid: number) =>
  course.group_weights?.[gid] ?? course.items.filter((i) => i.group_id === gid).reduce((a, i) => a + (i.weight ?? 0), 0);

/**
 * Splits a group's weight across ALL its items so they sum to it: by points when every item has points, otherwise
 * equally. An item with a weight the student set keeps it; the rest share what is left. Returns new objects.
 */
export function splitGroup(items: Item[], gid: number, total: number): Item[] {
  const inGroup = items.filter((i) => i.group_id === gid);
  const free = inGroup.filter((i) => !i.weight_set);
  const left = Math.max(0, total - inGroup.filter((i) => i.weight_set).reduce((a, i) => a + (i.weight ?? 0), 0));
  const pts = free.reduce((a, i) => a + (i.points ?? 0), 0);
  const byPoints = free.every((i) => (i.points ?? 0) > 0);
  return items.map((i) => (free.includes(i) ? { ...i, weight: byPoints ? (left * i.points!) / pts : left / free.length } : i));
}

/** Returns the course with the exam added (item_id "user:<id>"), tagged added_by_you; its group's weight is re-split. */
export function addExam(course: CourseCache, input: ExamInput, id: string = crypto.randomUUID()): CourseCache {
  const kind = input.kind ?? defaultKind(input.title);
  const g = matchingGroup(course, kind, input.title);
  const total = g ? groupTotal(course, g.id) : 0;
  const draft: Item = {
    item_id: `user:${id}`,
    name: input.title,
    type: kind === "quiz" ? "quiz" : kind === "project" ? "assignment" : /midterm/i.test(`${g?.name} ${input.title}`) ? "midterm" : "exam",
    due_at: endOfDay(input.day),
    group_id: g?.id ?? null,
    group_name: g?.name ?? null,
    weight: input.weight ?? null,
    weight_set: input.weight != null,
    weight_is_fallback: false,
    study_candidate: kind !== "quiz",
    points: null,
    module_ids: [],
    class_stats: null,
    added_by_you: true,
  };
  const next = { ...course, items: [...course.items, draft] };
  draft.covered_modules = input.modules ?? coverage(next, draft.item_id);
  return g ? { ...next, items: splitGroup(next.items, g.id, total) } : next;
}

/** The group's default weight for a new exam, or null when no group matches (ask for a manual %). */
export function defaultWeight(course: CourseCache, title: string, kind: Kind = defaultKind(title)): number | null {
  return matchingGroup(course, kind, title) && addExam(course, { title, day: "2000-01-01", kind }, "probe").items.at(-1)!.weight;
}

export function deleteExam(course: CourseCache, itemId: string): CourseCache {
  const old = course.items.find((i) => i.item_id === itemId && i.added_by_you);
  if (!old) return course;
  const total = old.group_id == null ? 0 : groupTotal(course, old.group_id);
  const items = course.items.filter((i) => i !== old);
  return { ...course, items: old.group_id == null ? items : splitGroup(items, old.group_id, total) };
}

/** Edits an exam the student added; Canvas items are left alone. A weight the student set is kept. */
export function editExam(course: CourseCache, itemId: string, input: ExamInput): CourseCache {
  const old = course.items.find((i) => i.item_id === itemId && i.added_by_you);
  if (!old) return course;
  const weight = input.weight ?? (old.weight_set ? old.weight : undefined);
  return addExam(deleteExam(course, itemId), { ...input, weight }, itemId.slice("user:".length));
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
const day = (iso: string) => new Date(iso).toDateString();
const isExam = (i: Item) => i.type === "exam" || i.type === "midterm";

/**
 * Called by the loader, per course. A student-added exam merges into a Canvas item with the same normalized title,
 * or on the same local day when both are exams. The Canvas item keeps the student's modules and a date it lacks.
 * Returns new objects (inputs untouched): the Canvas items, then the added exams still unmatched, so no duplicate.
 */
export function mergeAddedExams(canvasItems: Item[], old: Item[]): Item[] {
  const out = [...canvasItems];
  const left: Item[] = [];
  for (const u of old.filter((o) => o.added_by_you)) {
    const k = out.findIndex(
      (c) =>
        !c.added_by_you &&
        (norm(c.name) === norm(u.name) || (isExam(c) && isExam(u) && !!c.due_at && !!u.due_at && day(c.due_at) === day(u.due_at))),
    );
    if (k < 0) left.push(u);
    else out[k] = { ...out[k], covered_modules: out[k].covered_modules ?? u.covered_modules, due_at: out[k].due_at ?? u.due_at };
  }
  return [...out, ...left];
}

/** The loader's last step: re-split the groups holding exams the student added, so each group sums to its weight. */
export function resplitAdded(items: Item[], groupWeights: Record<number, number>): Item[] {
  const gids = new Set(items.flatMap((i) => (i.added_by_you && i.group_id != null ? [i.group_id] : [])));
  return [...gids].reduce((acc, gid) => (groupWeights[gid] ? splitGroup(acc, gid, groupWeights[gid]) : acc), items);
}

/** Pre-fills the form from a syllabus/announcement proposal. */
export function prefill(course: CourseCache, p: Proposal): Partial<ExamInput> {
  const title = course.items.find((i) => i.item_id === p.item_id)?.name;
  if (p.kind === "date") return { title, day: p.date };
  // A module whose name holds the number ("Module 4", "Week 4") first; Canvas order only if none does.
  const find = (n: number) => (course.modules.find((m) => new RegExp(`(?<!\\d)${n}(?!\\d)`).test(m.name)) ?? course.modules[n - 1])?.id;
  return { title, modules: p.modules.flatMap((n) => find(n) ?? []) };
}
