import { useState } from "react";
import { undatedItems } from "../canvas/undated";
import type { CourseCache } from "../canvas/load";

/** Lists graded items with no due date; Confirm hands the chosen day (YYYY-MM-DD) to onSet. */
export function Undated({
  courses,
  onSet,
}: {
  courses: CourseCache[];
  onSet: (courseId: number, itemId: string, day: string) => void;
}) {
  const [day, setDay] = useState<Record<string, string>>({});
  const rows = undatedItems(courses);
  if (!rows.length) return null;
  return (
    <section>
      <h2>Missing due dates</h2>
      <ul>
        {rows.map(({ course, item }) => {
          const key = `${course.canvas_course_id}:${item.item_id}`;
          return (
            <li key={key}>
              {course.course_code}: {item.name}{" "}
              <input
                type="date"
                aria-label={`Due date for ${item.name}`}
                value={day[key] ?? ""}
                onChange={(e) => setDay({ ...day, [key]: e.target.value })}
              />
              <button
                disabled={!day[key]}
                onClick={() => onSet(course.canvas_course_id, item.item_id, day[key])}
              >
                Confirm
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
