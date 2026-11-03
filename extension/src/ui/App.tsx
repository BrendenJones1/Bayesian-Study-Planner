import { useState } from "react";
import type { CourseCache } from "../canvas/load";
import { confirmDueAt } from "../canvas/undated";
import type { StudySession } from "../storage/db";
import { deleteSession, editSession } from "../timer/sessions";
import { Sessions } from "./Sessions";
import { Undated } from "./Undated";
import { Timer } from "./Timer";
import type { StudySession } from "../storage/db";

export function App({
  initial = [],
  save,
  initialSessions = [],
  putSession = async () => {},
  removeSession = async () => {},
}: {
  initial?: CourseCache[];
  save: (c: CourseCache) => Promise<void>;
  initialSessions?: StudySession[];
  putSession?: (s: StudySession) => Promise<void>;
  removeSession?: (id: string) => Promise<unknown>;
}) {
  const [courses, setCourses] = useState(initial);
  const [sessions, setSessions] = useState(initialSessions);
  const [failed, setFailed] = useState(false);
  const ok = () => setFailed(false);
  const fail = () => setFailed(true);
  return (
    <>
      <h1>Bayesian Study Planner</h1>
      {failed && <p role="alert">Could not save the date.</p>}
      <Timer courses={courses} save={saveSession} />
      <Undated
        courses={courses}
        onSet={(c, i, d) =>
          confirmDueAt(courses, c, i, d, save).then((next) => {
            ok();
            setCourses(next);
          }, fail)
        }
      />
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
    </>
  );
}
