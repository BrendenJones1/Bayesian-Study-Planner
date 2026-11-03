import { useState } from "react";
import type { CourseCache } from "../canvas/load";
import type { StudySession } from "../storage/db";

/** Study sessions listed per course; each row can change minutes and module, or be deleted. */
export function Sessions({
  courses,
  sessions,
  onEdit,
  onDelete,
}: {
  courses: CourseCache[];
  sessions: StudySession[];
  onEdit: (id: string, change: { active_minutes: number; module_id: number }) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, { minutes: string; module: string }>>({});
  const shown = courses.filter((c) => sessions.some((s) => s.course_id === c.canvas_course_id));
  if (!shown.length) return null;
  return (
    <section>
      <h2>Study sessions</h2>
      {shown.map((c) => (
        <div key={c.canvas_course_id}>
          <h3>{c.course_code}</h3>
          <ul>
            {sessions
              .filter((s) => s.course_id === c.canvas_course_id)
              .map((s) => {
                const d = draft[s.session_id] ?? {
                  minutes: String(s.active_minutes),
                  module: String(s.module_id),
                };
                const set = (p: Partial<typeof d>) =>
                  setDraft({ ...draft, [s.session_id]: { ...d, ...p } });
                return (
                  <li key={s.session_id}>
                    {s.started_at.slice(0, 10)}{" "}
                    <input
                      type="number"
                      min={1}
                      aria-label="Minutes"
                      value={d.minutes}
                      onChange={(e) => set({ minutes: e.target.value })}
                    />
                    <select
                      aria-label="Module"
                      value={d.module}
                      onChange={(e) => set({ module: e.target.value })}
                    >
                      {c.modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!(Number(d.minutes) > 0)}
                      onClick={() =>
                        onEdit(s.session_id, {
                          active_minutes: Number(d.minutes),
                          module_id: Number(d.module),
                        })
                      }
                    >
                      Save
                    </button>
                    <button onClick={() => onDelete(s.session_id)}>Delete</button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}
