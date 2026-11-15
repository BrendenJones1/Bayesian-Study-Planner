import type { CourseCache } from "../canvas/load";

export function MyCourses({
  courses,
  isTicked,
  onToggle,
}: {
  courses: CourseCache[];
  isTicked: (c: CourseCache) => boolean;
  onToggle: (id: number, ticked: boolean) => void;
}) {
  if (courses.length === 0) return null;
  return (
    <section>
      <h2>My courses</h2>
      {courses.map((c) => (
        <label key={c.canvas_course_id} style={{ display: "block" }}>
          <input type="checkbox" checked={isTicked(c)} onChange={(e) => onToggle(c.canvas_course_id, e.target.checked)} />
          {c.course_code}
        </label>
      ))}
    </section>
  );
}
