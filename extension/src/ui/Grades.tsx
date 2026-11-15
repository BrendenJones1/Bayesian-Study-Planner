import type { CourseCache, Item, Submission } from "../canvas/load";

/** What counts for one course: graded items the model used (score, bonus badge) and items it did not count, with the reason the stored data supports. */
export function gradeRows(c: CourseCache, submissions: Submission[], now: Date) {
  const sub = new Map(submissions.map((s) => [s.item_id, s]));
  return c.items.flatMap((it): { it: Item; s: Submission | undefined; reason?: string }[] => {
    const s = sub.get(it.item_id);
    if (s?.score != null) return [{ it, s }];
    if (s && (s.late || s.missing)) return [{ it, s, reason: "late or missing, no score" }];
    const pastDue = it.due_at != null && Date.parse(it.due_at) <= now.getTime();
    return s || pastDue ? [{ it, s, reason: "no score yet" }] : [];
  });
}

export function Grades({ rows }: { rows: ReturnType<typeof gradeRows> }) {
  if (!rows.length) return null;
  return (
    <ul>
      {rows.map(({ it, s, reason }) => (
        <li key={it.item_id}>
          {it.name}: {reason ? `not counted (${reason})` : `${Math.round(s!.score! * 100)}%`}
          {s?.bonus && <> <em>bonus, counted as 100%</em></>}
        </li>
      ))}
    </ul>
  );
}
