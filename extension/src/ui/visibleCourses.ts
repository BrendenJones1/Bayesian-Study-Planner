import type { CourseCache } from "../canvas/load";
import type { Settings } from "../storage/db";

/** Default tick: the course has not ended (no end date counts as not ended). */
export const isTicked = (c: CourseCache, settings: Settings, today: Date): boolean =>
  settings.ticked?.[c.canvas_course_id] ?? !(c.end_at != null && new Date(c.end_at) < today);

/** The courses every section works from; the student's choice beats the end-date default. */
export const visibleCourses = (courses: CourseCache[], settings: Settings, today: Date): CourseCache[] =>
  courses.filter((c) => isTicked(c, settings, today));
