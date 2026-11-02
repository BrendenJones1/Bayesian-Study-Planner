import { useEffect, useState } from "react";
import type { CourseCache } from "../canvas/load";
import type { StudySession } from "../storage/db";
import { back, idle, resolveIdle, start, stop, type Timer as T } from "../timer/session";

export type IdleApi = {
  onStateChanged: { addListener(f: (s: string) => void): void; removeListener(f: (s: string) => void): void };
};

/** Start/stop with a required module; idle pauses and asks on return whether to keep the gap. */
export function Timer({
  courses,
  save,
  idleApi = (globalThis as { chrome?: { idle?: IdleApi } }).chrome?.idle,
  now = Date.now,
}: {
  courses: CourseCache[];
  save: (s: StudySession) => Promise<void>;
  idleApi?: IdleApi;
  now?: () => number;
}) {
  const [pick, setPick] = useState("");
  const [t, setT] = useState<T | null>(null);
  useEffect(() => {
    if (!idleApi) return;
    const f = (s: string) => setT((c) => c && (s === "active" ? back(c, now()) : idle(c, now())));
    idleApi.onStateChanged.addListener(f);
    return () => idleApi.onStateChanged.removeListener(f);
  }, [idleApi, now]);

  if (t?.returnedAt != null)
    return (
      <section>
        <p>You were idle for a while. Keep the idle time?</p>
        <button onClick={() => setT(resolveIdle(t, true, now()))}>Keep</button>{" "}
        <button onClick={() => setT(resolveIdle(t, false, now()))}>Discard</button>
      </section>
    );
  if (t)
    return (
      <section>
        <p>{t.since === null ? "Paused (idle)" : "Studying…"}</p>
        <button
          onClick={() => {
            void save(stop(t, now(), crypto.randomUUID()));
            setT(null);
          }}
        >
          Stop
        </button>
      </section>
    );
  const [cid, mid] = pick.split(":").map(Number);
  return (
    <section>
      <select aria-label="Module" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">Choose a module</option>
        {courses.flatMap((c) =>
          c.modules.map((m) => (
            <option key={`${c.canvas_course_id}:${m.id}`} value={`${c.canvas_course_id}:${m.id}`}>
              {c.course_code}: {m.name}
            </option>
          )),
        )}
      </select>{" "}
      <button disabled={!pick} onClick={() => setT(start(cid, mid, now()))}>
        Start studying
      </button>
    </section>
  );
}
