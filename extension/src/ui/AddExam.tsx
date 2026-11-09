import { useState } from "react";
import type { CourseCache } from "../canvas/load";
import { proposeFromText } from "../canvas/propose";
import { addExam, defaultWeight, deleteExam, editExam, prefill, type ExamInput } from "../canvas/addExam";
import { coverage, isProvisional } from "../canvas/coverage";

/** "Add exam" form, the exams added by you (edit, delete), and syllabus proposals that open the form pre-filled. */
export function AddExam({ courses, onChange }: { courses: CourseCache[]; onChange: (c: CourseCache) => void }) {
  const [courseId, setCourseId] = useState(courses[0]?.canvas_course_id);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ExamInput>>({});
  const course = courses.find((c) => c.canvas_course_id === courseId);
  if (!course) return null;
  const title = form.title ?? "";
  const auto = title ? defaultWeight(course, title) : null;
  const probe = form.day ? addExam(course, { title: title || "Exam", day: form.day }, "probe") : null;
  const modules = form.modules ?? (probe ? coverage(probe, "user:probe") : []);
  const proposals = proposeFromText(course);
  const done = (next: CourseCache) => {
    onChange(next);
    setForm({});
    setEditing(null);
  };
  return (
    <section>
      <h2>Add exam</h2>
      <select aria-label="Course" value={courseId} onChange={(e) => (setCourseId(Number(e.target.value)), setForm({}))}>
        {courses.map((c) => <option key={c.canvas_course_id} value={c.canvas_course_id}>{c.course_code}</option>)}
      </select>
      <input aria-label="Exam title" value={title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input type="date" aria-label="Exam date" value={form.day ?? ""} onChange={(e) => setForm({ ...form, day: e.target.value })} />
      <fieldset>
        <legend>Covered modules</legend>
        {course.modules.map((m) => (
          <label key={m.id}>
            <input
              type="checkbox"
              checked={modules.includes(m.id)}
              onChange={(e) => setForm({ ...form, modules: e.target.checked ? [...modules, m.id] : modules.filter((x) => x !== m.id) })}
            />
            {m.name}
          </label>
        ))}
      </fieldset>
      {auto === null && title && (
        <input type="number" aria-label="Weight (%)" value={form.weight ?? ""} onChange={(e) => setForm({ ...form, weight: e.target.value === "" ? null : Number(e.target.value) })} />
      )}
      <button
        disabled={!title || !form.day}
        onClick={() => {
          const input = { title, day: form.day!, modules, weight: form.weight };
          done(editing ? editExam(course, editing, input) : addExam(course, input));
        }}
      >
        {editing ? "Save exam" : "Add exam"}
      </button>
      {proposals.map((p, k) => (
        <p key={k}>
          Found in {p.source}: “{p.sentence}” (provisional){" "}
          <button onClick={() => setForm(prefill(course, p))}>Use in form</button>
        </p>
      ))}
      <ul>
        {course.items.filter((i) => i.study_candidate || i.added_by_you).map((i) => (
          <li key={i.item_id}>
            {i.name}
            {i.added_by_you && " (added by you)"}
            {isProvisional(course, i.item_id) && " (provisional)"}
            {i.added_by_you && (
              <>
                {" "}
                <button onClick={() => (setEditing(i.item_id), setForm({ title: i.name, day: i.due_at ? new Date(i.due_at).toLocaleDateString("en-CA") : "", modules: i.covered_modules, weight: i.weight }))}>Edit</button>
                <button onClick={() => onChange(deleteExam(course, i.item_id))}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
