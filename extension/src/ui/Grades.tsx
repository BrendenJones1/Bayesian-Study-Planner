import type { CourseCache, Item, Submission } from "../canvas/load";

/** Per course: graded items the model used (score, bonus badge) and items it did not count. Past-due items with no submission were excused or ungraded (the loader drops both). */
export function Grades({
  courses,
  submissions,
  now = new Date(),
}: {
  courses: CourseCache[];
  submissions: Submission[];
  now?: Date;
}) {
  const sub = new Map(submissions.map((s) => [s.item_id, s]));
  return (
    <section>
      <h2>Grades the model used</h2>
      {courses.map((c) => {
        const rows = c.items.flatMap((it): { it: Item; s: Submission | undefined }[] => {
          const s = sub.get(it.item_id);
          if (s?.score != null) return [{ it, s }];
          const pastDue = it.due_at != null && Date.parse(it.due_at) <= now.getTime();
          return s || pastDue ? [{ it, s: undefined }] : [];
        });
        if (!rows.length) return null;
        return (
          <div key={c.canvas_course_id}>
            <h3>{c.course_code}</h3>
            <ul>
              {rows.map(({ it, s }) => (
                <li key={it.item_id}>
                  {it.name}: {s?.score != null ? `${Math.round(s.score * 100)}%` : "not counted"}
                  {s?.bonus && <> <em>bonus, counted as 100%</em></>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
