import type { CourseCache, Submission } from "../canvas/load";
import { localDay } from "../model/encode";
import { AddExam } from "./AddExam";
import { Grades, gradeRows } from "./Grades";

const DAY = 86_400_000;
const isExam = (t: string) => t === "exam" || t === "midterm";

/** One collapsible section per course, sorted by course code. Open when an exam is within 14 days. */
export function Courses({
  courses,
  submissions,
  onChange,
  now = new Date(),
}: {
  courses: CourseCache[];
  submissions: Submission[];
  onChange: (c: CourseCache) => void;
  now?: Date;
}) {
  const today = localDay(now.toISOString());
  const last = localDay(new Date(now.getTime() + 14 * DAY).toISOString());
  const sorted = [...courses].sort((a, b) => a.course_code.localeCompare(b.course_code));
  return (
    <>
      {sorted.map((c) => {
        const rows = gradeRows(c, submissions, now);
        const counted = rows.filter((r) => !r.reason).length;
        const next = c.items
          .filter((i) => isExam(i.type) && i.due_at && localDay(i.due_at) >= today)
          .map((i) => localDay(i.due_at!))
          .sort()[0];
        return (
          <details key={c.canvas_course_id} open={next !== undefined && next <= last}>
            <summary>
              {c.course_code}: {counted} graded {counted === 1 ? "item" : "items"} counted, {next ? `next exam ${next}` : "no exam date set"}
            </summary>
            <Grades rows={rows} />
            <AddExam course={c} onChange={onChange} />
          </details>
        );
      })}
    </>
  );
}
