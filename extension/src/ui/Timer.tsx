import { useEffect, useState } from "react";
import type { CourseCache } from "../canvas/load";
import type { StudySession } from "../storage/db";
import { IDLE_SECONDS, back, idle, resolveIdle, start, stop, type Timer as TimerState } from "../timer/session";

export type IdleApi = {
  setDetectionInterval(seconds: number): void;
  onStateChanged: { addListener(f: (s: string) => void): void; removeListener(f: (s: string) => void): void };
};

/** Sets chrome.idle's threshold to IDLE_SECONDS (Chrome's default is 60 s) and feeds state changes to `set`. Returns cleanup. */
export function listenIdle(
  api: IdleApi,
  set: (f: (c: TimerState | null) => TimerState | null) => void,
  now: () => number,
) {
  api.setDetectionInterval(IDLE_SECONDS);
  const f = (s: string) => set((c) => c && (s === "active" ? back(c, now()) : idle(c, now(), s === "locked")));
  api.onStateChanged.addListener(f);
  return () => api.onStateChanged.removeListener(f);
}

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
  const [failed, setFailed] = useState(false);
  const [t, setT] = useState<TimerState | null>(null);
  useEffect(() => (idleApi ? listenIdle(idleApi, setT, now) : undefined), [idleApi, now]);

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
        {failed && <p role="alert">Could not save the session. Try Stop again.</p>}
        <button
          onClick={() =>
            // Timer keeps running on failure so the session is not lost.
            save(stop(t, now(), crypto.randomUUID())).then(
              () => {
                setFailed(false);
                setT(null);
              },
              () => setFailed(true),
            )
          }
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
