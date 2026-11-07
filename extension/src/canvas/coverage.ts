import type { CourseCache, Item } from "./load";
import type { CoverageOverride } from "../storage/db";

const isExam = (i: Item) => i.type === "exam" || i.type === "midterm";
const due = (i: Item) => (i.due_at ? Date.parse(i.due_at) : null);

/**
 * Module ids an exam covers (design doc, Data sources: Coverage). An override wins.
 * Otherwise: the modules released since the previous dated exam of the course, or every
 * module for the first exam. A module is released by an item when its unlock_at is on or
 * before the item's due date; with no unlock_at, by Canvas module order, measured against
 * the last module the item is linked to (an item with no link counts as after every module).
 * Pure: item.module_ids is read, never changed.
 */
export function coverage(course: CourseCache, examId: string, override?: CoverageOverride): number[] {
  if (override && override.item_id === examId) return override.module_ids;
  const exam = course.items.find((i) => i.item_id === examId);
  if (!exam) return [];
  const d = due(exam);
  const prev = course.items
    .filter((i) => isExam(i) && i.item_id !== examId && due(i) !== null && (d === null || due(i)! < d))
    .sort((a, b) => due(b)! - due(a)!)[0];
  const ids = course.modules.map((m) => m.id);
  const releasedBy = (item: Item, i: number) => {
    const t = due(item);
    const u = course.modules[i].unlock_at;
    if (u && t !== null) return Date.parse(u) <= t;
    const last = Math.max(-1, ...item.module_ids.map((id) => ids.indexOf(id)));
    return last < 0 ? true : i <= last;
  };
  return course.modules
    .filter((_, i) => releasedBy(exam, i) && (!prev || !releasedBy(prev, i)))
    .map((m) => m.id);
}
