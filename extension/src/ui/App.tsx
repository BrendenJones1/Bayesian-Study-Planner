import { useEffect, useState } from "react";
import type { LambdaPreset } from "../model/constants";
import type { Cpts } from "../priors/cpts";
import type { Availability, Settings } from "../storage/db";
import type { Loaded } from "./open";
import { Tonight } from "./Tonight";
import type { CourseCache, Submission } from "../canvas/load";
import { Grades } from "./Grades";
import { confirmDueAt } from "../canvas/undated";
import type { StudySession } from "../storage/db";
import { deleteSession, editSession } from "../timer/sessions";
import { Sessions } from "./Sessions";
import { Undated } from "./Undated";
import { Timer } from "./Timer";

export function App({
  initial = [],
  submissions: initialSubmissions = [],
  load,
  initialCpts = null,
  availability = { id: "default", weekly_defaults: [], busy_blocks: [] },
  settings = { id: "default", lambda_preset: "balanced" },
  saveSettings = async () => {},
  firstUse,
  save,
  initialSessions = [],
  putSession = async () => {},
  removeSession = async () => {},
  onExport,
}: {
  onExport?: () => Promise<void>;
  /** Runs on open: loadCanvas, then loadCpts. Cached data shows meanwhile. */
  load?: (progress: (step: string) => void) => Promise<Loaded>;
  initialCpts?: Cpts | null;
  availability?: Availability;
  settings?: Settings;
  saveSettings?: (s: Settings) => Promise<void>;
  firstUse?: string | null;
  initial?: CourseCache[];
  submissions?: Submission[];
  save: (c: CourseCache) => Promise<void>;
  initialSessions?: StudySession[];
  putSession?: (s: StudySession) => Promise<void>;
  removeSession?: (id: string) => Promise<unknown>;
}) {
  const [courses, setCourses] = useState(initial);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [cpts, setCpts] = useState(initialCpts);
  const [prefs, setPrefs] = useState(settings);
  const [step, setStep] = useState<string | null>(load ? "Loading…" : null);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    if (!load) return;
    load(setStep)
      .then((r) => {
        setCourses(r.courses);
        setSubmissions(r.submissions);
        setCpts(r.cpts);
        setErrors(r.errors);
      }, (e) => setErrors([e instanceof Error ? e.message : String(e)]))
      .finally(() => setStep(null));
  }, [load]);
  const [sessions, setSessions] = useState(initialSessions);
  const [failed, setFailed] = useState(false);
  const ok = () => setFailed(false);
  const fail = () => setFailed(true);
  const savePrefs = (next: Settings) => {
    setPrefs(next);
    saveSettings(next).then(ok, fail);
  };
  return (
    <>
      <h1>Bayesian Study Planner</h1>
      {failed && <p role="alert">Could not save the change.</p>}
      {step && <p role="status">{step}</p>}
      {errors.map((m) => <p role="alert" key={m}>{m}</p>)}
      <Tonight
        courses={courses}
        submissions={submissions}
        sessions={sessions}
        cpts={cpts}
        availability={availability}
        firstUse={firstUse}
        preset={prefs.lambda_preset}
        targets={prefs.targets ?? {}}
        onTarget={(id, t) => savePrefs({ ...prefs, targets: { ...prefs.targets, [id]: t } })}
        onPreset={(p: LambdaPreset) => savePrefs({ ...prefs, lambda_preset: p })}
      />
      <Timer courses={courses} save={putSession} />
      <Undated
        courses={courses}
        onSet={(c, i, d) =>
          confirmDueAt(courses, c, i, d, save).then((next) => {
            ok();
            setCourses(next);
          }, fail)
        }
      />
      <Grades courses={courses} submissions={submissions} />
      <Sessions
        courses={courses}
        sessions={sessions}
        onEdit={(id, change) => {
          const next = editSession(sessions, id, change);
          return putSession(next.find((s) => s.session_id === id)!).then(() => {
            ok();
            setSessions(next);
          }, fail);
        }}
        onDelete={(id) =>
          removeSession(id).then(() => {
            ok();
            setSessions(deleteSession(sessions, id));
          }, fail)
        }
      />
      {onExport && <button onClick={() => onExport().then(ok, fail)}>Export my data</button>}
    </>
  );
}
