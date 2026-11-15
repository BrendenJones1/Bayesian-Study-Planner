import type { CourseCache, Item, Submission } from "./load";


/** Undated, unscored exams and major projects (study candidates, or added by you); the student sets a date in the popup. */
export const undatedItems = (
  courses: CourseCache[],
  submissions: Submission[] = [],
): { course: CourseCache; item: Item }[] => {
  const scored = new Set(submissions.filter((s) => s.score != null).map((s) => s.item_id));
  return courses.flatMap((course) =>
    course.items
      .filter((i) => !i.due_at && (i.study_candidate || i.added_by_you) && !scored.has(i.item_id))
      .map((item) => ({ course, item })),
  );
};

/** End of the chosen day (YYYY-MM-DD), 23:59 local time, as an ISO string. */
export const endOfDay = (day: string): string => new Date(`${day}T23:59:00`).toISOString();

/** Sets the date, saves the changed course, then returns the new list. A failed save throws. */
export async function confirmDueAt(
  courses: CourseCache[],
  courseId: number,
  itemId: string,
  day: string,
  save: (c: CourseCache) => Promise<void>,
): Promise<CourseCache[]> {
  const next = setDueAt(courses, courseId, itemId, endOfDay(day));
  await save(next.find((c) => c.canvas_course_id === courseId)!);
  return next;
}

/** Returns courses with the item's due_at set; every other item is untouched. */
export const setDueAt = (courses: CourseCache[], courseId: number, itemId: string, dueAt: string): CourseCache[] =>
  courses.map((c) =>
    c.canvas_course_id !== courseId
      ? c
      : { ...c, items: c.items.map((i) => (i.item_id === itemId ? { ...i, due_at: dueAt } : i)) },
  );
