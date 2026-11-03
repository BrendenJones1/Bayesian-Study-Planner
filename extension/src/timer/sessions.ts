import type { StudySession } from "../storage/db";

/** Returns the sessions with one edited; rejects minutes that are not a positive number. */
export function editSession(
  sessions: StudySession[],
  id: string,
  change: { active_minutes: number; module_id: number },
): StudySession[] {
  if (!(change.active_minutes > 0) || !Number.isFinite(change.active_minutes)) {
    throw new Error("minutes must be a positive number");
  }
  return sessions.map((s) => (s.session_id === id ? { ...s, ...change } : s));
}

export const deleteSession = (sessions: StudySession[], id: string): StudySession[] =>
  sessions.filter((s) => s.session_id !== id);
