import { DEFAULTS } from "../planner/availability";
import type { Availability } from "../storage/db";

export const FREEBUSY_SCOPE = "https://www.googleapis.com/auth/calendar.freebusy";
export const FREEBUSY_URL ="https://www.googleapis.com/calendar/v3/freeBusy";
const HOUR = 3_600_000;

interface Identity {
  getAuthToken(o: { interactive: boolean; scopes: string[] }): Promise<{ token?: string } | string>;
}

/** Starts Google sign-in. Only called from the Connect button, so nothing reaches Google before a click. */
export async function connectCalendar(
  identity: Identity = (globalThis as unknown as { chrome: { identity: Identity } }).chrome.identity,
): Promise<string> {
  const r = await identity.getAuthToken({ interactive: true, scopes: [FREEBUSY_SCOPE] });
  const token = typeof r === "string" ? r : r.token;
  if (!token) throw new Error("Google sign-in did not return a token");
  return token;
}

/** Busy intervals [start, end) in ms inside [lo, hi]. The query asks for free/busy only, so no titles or details come back. */
export async function busyIntervals(token: string, lo: number, hi: number, fetchFn: typeof fetch = fetch) {
  const res = await fetchFn(FREEBUSY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: new Date(lo).toISOString(), timeMax: new Date(hi).toISOString(), items: [{ id: "primary" }] }),
  });
  if (!res.ok) throw new Error(`Google Calendar error ${res.status}`);
  const body = (await res.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
  return (body.calendars?.primary?.busy ?? []).map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
}

/** F: free time in [lo, hi] in hours, counting only free gaps of at least 1 hour. Busy intervals may overlap. */
export function freeHours(busy: readonly (readonly [number, number])[], lo: number, hi: number): number {
  let free = 0;
  let t = lo;
  const gap = (to: number) => {
    if (to - t >= HOUR) free += to - t;
  };
  for (const [s, e] of [...busy].sort((a, b) => a[0] - b[0])) {
    gap(Math.min(hi, s));
    t = Math.max(t, Math.min(hi, e));
  }
  gap(hi);
  return free / HOUR;
}

export type Hours = { hours: number; note?: string };

/** H = min(F, M) for tomorrow's study window. If Google fails, `manual` (hours) is used and the note says so. */
export async function tomorrowHours(token: string, a: Availability, now: Date, manual: number, fetchFn: typeof fetch = fetch): Promise<Hours> {
  const at = (min: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, min).getTime();
  const lo = at(a.window_start ?? DEFAULTS.window_start);
  const hi = at(a.window_end ?? DEFAULTS.window_end);
  try {
    const f = freeHours(await busyIntervals(token, lo, hi, fetchFn), lo, hi);
    return { hours: Math.min(f, a.max_hours ?? DEFAULTS.max_hours) };
  } catch {
    return { hours: manual, note: "Could not reach Google Calendar; using your manual availability tonight." };
  }
}
