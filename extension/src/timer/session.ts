import type { StudySession } from "../storage/db";

/** chrome.idle fires after this many seconds without input. */
export const IDLE_SECONDS = 600;

/** Timer state; all times are epoch ms. activeMs counts only time outside idle gaps. */
export interface Timer {
  course_id: number;
  module_id: number;
  started: number;
  activeMs: number;
  /** Start of the current active stretch; null while paused for idle. */
  since: number | null;
  /** When the idle gap began; set while paused. */
  idleFrom: number | null;
  /** Set on return from idle until the student answers keep/discard. */
  returnedAt: number | null;
}

export function start(course_id: number, module_id: number | null | undefined, now: number): Timer {
  if (module_id == null) throw new Error("Pick a module before starting");
  return { course_id, module_id, started: now, activeMs: 0, since: now, idleFrom: null, returnedAt: null };
}

/** Idle detected at `now`: the gap began IDLE_SECONDS ago, or at `now` if the screen was locked. Pauses the session. */
export function idle(t: Timer, now: number, locked = false): Timer {
  if (t.since === null) return t;
  const from = locked ? now : Math.max(t.since, now - IDLE_SECONDS * 1000);
  return { ...t, activeMs: t.activeMs + from - t.since, since: null, idleFrom: from };
}

/** Student is back; waits for resolveIdle. */
export const back = (t: Timer, now: number): Timer =>
  t.idleFrom === null ? t : { ...t, returnedAt: now };

/** keep = count the idle gap as study time; otherwise it is dropped. Resumes the session. */
export function resolveIdle(t: Timer, keep: boolean, now: number): Timer {
  if (t.idleFrom === null) return t;
  const gap = keep ? now - t.idleFrom : 0;
  return { ...t, activeMs: t.activeMs + gap, since: now, idleFrom: null, returnedAt: null };
}

/** Stop; an unanswered idle gap is excluded. */
export function stop(t: Timer, now: number, session_id: string): StudySession {
  const ms = t.activeMs + (t.since === null ? 0 : now - t.since);
  return {
    session_id,
    course_id: t.course_id,
    module_id: t.module_id,
    started_at: new Date(t.started).toISOString(),
    ended_at: new Date(now).toISOString(),
    active_minutes: ms / 60000,
  };
}
