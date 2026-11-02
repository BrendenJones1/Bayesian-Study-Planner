import type { CourseCache, Item } from "./load";

/** Graded items (points > 0) Canvas gave no due date; the student sets or confirms one in the popup. */
export const undatedItems = (courses: CourseCache[]): { course: CourseCache; item: Item }[] =>
  courses.flatMap((course) =>
    course.items.filter((i) => !i.due_at && (i.points ?? 0) > 0).map((item) => ({ course, item })),
  );

/** Returns courses with the item's due_at set; every other item is untouched. */
export const setDueAt = (courses: CourseCache[], courseId: number, itemId: string, dueAt: string): CourseCache[] =>
  courses.map((c) =>
    c.canvas_course_id !== courseId
      ? c
      : { ...c, items: c.items.map((i) => (i.item_id === itemId ? { ...i, due_at: dueAt } : i)) },
  );
