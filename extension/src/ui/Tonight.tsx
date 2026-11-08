import type { CourseCache, Item, Submission } from "../canvas/load";
import { LAMBDA_PRESETS, type LambdaPreset } from "../model/constants";
import { localDay } from "../model/encode";
import { TARGETS } from "../model/infer";
import { ACTIONS, gradeQuery, type Action, type CourseData } from "../model/query";
import { deadlineCount, stressCurve } from "../model/stress";
import { availableHours } from "../planner/availability";
import { bestAction } from "../planner/utility";
import type { Cpts } from "../priors/cpts";
import type { Availability, StudySession } from "../storage/db";

export const DEFAULT_TARGET = 72;
const HORIZON_DAYS = 14;
const HOURS: Record<Action, number> = { Intense: 5, Light: 1, Rest: 0 }; // design-v2, Decision
const DAY = 86_400_000;
const PRESETS: Record<LambdaPreset, string> = { grades: "Grades first", balanced: "Balanced", wellbeing: "Wellbeing first" };
const isExam = (t: string) => t === "exam" || t === "midterm";

/** Tonight's chance of reaching the target under each action, and the recommended action, per course with an exam in the next 14 days. All numbers come from model/ and planner/. */
export function Tonight({
  courses,
  submissions,
  sessions,
  cpts,
  availability,
  firstUse,
  preset,
  targets,
  onTarget,
  onPreset,
  now = new Date(),
}: {
  courses: CourseCache[];
  submissions: Submission[];
  sessions: StudySession[];
  cpts: Cpts | null;
  availability: Availability;
  firstUse?: string | null;
  preset: LambdaPreset;
  targets: Record<number, number>;
  onTarget: (courseId: number, target: number) => void;
  onPreset: (p: LambdaPreset) => void;
  now?: Date;
}) {
  const today = localDay(now.toISOString());
  const tomorrow = localDay(new Date(now.getTime() + DAY).toISOString());
  const last = localDay(new Date(now.getTime() + HORIZON_DAYS * DAY).toISOString());
  const hours = availableHours(availability, now);
  const items = courses.flatMap((c) => c.items);
  const cards = courses.flatMap((c): { c: CourseCache; exam: Item | null }[] => {
    const exams = c.items.filter((i) => isExam(i.type));
    const exam = exams
      .filter((i) => i.due_at && localDay(i.due_at) >= today && localDay(i.due_at) <= last)
      .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!))[0];
    if (!exam) return exams.some((i) => !i.due_at) ? [{ c, exam: null }] : [];
    return [{ c, exam }];
  });
  if (!cards.length) return null;
  return (
    <section>
      <h2>Tonight</h2>
      <label>
        Priority{" "}
        <select aria-label="Preset" value={preset} onChange={(e) => onPreset(e.target.value as LambdaPreset)}>
          {(Object.keys(LAMBDA_PRESETS) as LambdaPreset[]).map((p) => (
            <option key={p} value={p}>{PRESETS[p]}</option>
          ))}
        </select>
      </label>
      <p>Hours available today: {hours.toFixed(1)}</p>
      {cards.map(({ c, exam }) => {
        if (!exam)
          return (
            <div key={c.canvas_course_id}>
              <h3>{c.course_code}</h3>
              <p>Exam date not confirmed. <a href="#undated">Confirm the exam date</a></p>
            </div>
          );
        if (!cpts) return <div key={c.canvas_course_id}><h3>{c.course_code}</h3><p>Tables not loaded yet.</p></div>;
        // A course the published grade history does not cover cannot be queried; say so rather than fail the popup.
        if (!(c.course_code in (cpts.tables as { grade_map: { courses: object } }).grade_map.courses))
          return <div key={c.canvas_course_id}><h3>{c.course_code}</h3><p>No grade history for this course yet.</p></div>;
        const target = targets[c.canvas_course_id] ?? DEFAULT_TARGET;
        const data: CourseData = {
          ...c,
          submissions: submissions.filter((s) => c.items.some((i) => i.item_id === s.item_id)),
          firstUse,
        };
        const q = gradeQuery(cpts, data, exam, sessions, today, target);
        const curve = stressCurve(cpts as never, { loadToday: deadlineCount(items, today), loadTomorrow: deadlineCount(items, tomorrow), H: HOURS.Intense });
        const p = {} as Record<Action, number>;
        const stress = {} as Record<Action, number>;
        for (const a of ACTIONS) {
          // Intense is out of the ranking when under 5 h are free; its chance is still shown.
          p[a] = a === "Intense" && hours < HOURS.Intense ? -Infinity : q[a].p;
          stress[a] = curve[HOURS[a]];
        }
        const best = bestAction(p, stress, preset);
        return (
          <div key={c.canvas_course_id}>
            <h3>{c.course_code}</h3>
            <p>Exam: {localDay(exam.due_at!)}</p>
            <label>
              Target{" "}
              <select
                aria-label={`Target for ${c.course_code}`}
                value={target}
                onChange={(e) => onTarget(c.canvas_course_id, Number(e.target.value))}
              >
                {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <ul>
              {ACTIONS.map((a) => (
                <li key={a}>
                  {a}: {Math.round(q[a].p * 100)}% of students like you reached the target
                  {q[a].bound && <> ({q[a].bound!.reason})</>}
                </li>
              ))}
            </ul>
            <p>Recommended tonight: <strong>{best}</strong></p>
          </div>
        );
      })}
    </section>
  );
}
