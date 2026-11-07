import { describe, expect, it } from "vitest";
import { encodeDaysLeft, encodeStudy, localDay, encodeTimeliness, type CutPoints } from "./encode";
import type { StudySession } from "../storage/db";

const cuts: CutPoints = {
  study_volume_hours_per_course_week: { low_max: 2, med_max: 4 },
  study_active_day_share: { low_max: 0.2, med_max: 0.4 },
  study_level_sum: { Low: [0, 1], Med: [2], High: [3, 4] },
  timeliness: { some_late_max: 1 / 3 },
};
const ses = (day: string, active_minutes: number): StudySession => ({
  session_id: day, course_id: 1, module_id: 1, started_at: `${day}T10:00:00Z`, ended_at: `${day}T11:00:00Z`, active_minutes,
});
const today = "2026-11-10";

describe("encodeStudy", () => {
  const full = "2026-10-01"; // first use more than 28 days before today
  const d = (n: number) => new Date(Date.parse(today) - n * 86_400_000).toISOString().slice(0, 10); // n days before today
  it("criterion 1: 28-day minutes per day become Low, Med or High at the volume and active-day edges", () => {
    // one active day (1/28 -> 0); hours per week = hours / 4: 7.9 h -> 0, 8 h -> 1, 16 h -> 2
    expect(encodeStudy([ses(d(1), 474)], today, full, cuts)).toBe("Low"); // 0+0
    expect(encodeStudy([ses(d(1), 480)], today, full, cuts)).toBe("Low"); // 1+0
    expect(encodeStudy([ses(d(1), 960)], today, full, cuts)).toBe("Med"); // 2+0
    // 12 active days (12/28 = 0.43 > 0.4 -> 2), 4 h total -> vol 0
    const twelve = Array.from({ length: 12 }, (_, i) => ses(d(i + 1), 20));
    expect(encodeStudy(twelve, today, full, cuts)).toBe("Med"); // 0+2
    expect(encodeStudy([...twelve, ses(d(14), 900)], today, full, cuts)).toBe("High"); // 2+2
  });
  it("criterion 1: an active-day share equal to a cut point stays in the lower bucket", () => {
    const c = { ...cuts, study_active_day_share: { low_max: 1 / 28, med_max: 2 / 28 } };
    expect(encodeStudy([ses(d(1), 960)], today, full, c)).toBe("Med"); // act 0 (1/28 <= low_max) + vol 2
  });
  it("criterion 1: a timer used for less than 28 days divides by the days actually covered", () => {
    // first use 6 days ago -> 7 days covered: 4 h = 4 h/week (vol 2), 1 of 7 days active (0.14 -> 0)
    expect(encodeStudy([ses(d(1), 240)], today, d(6), cuts)).toBe("Med");
    // the same 4 h over a full 28 days is 1 h/week
    expect(encodeStudy([ses(d(1), 240)], today, full, cuts)).toBe("Low");
  });
  it("criterion 2: a timer that has never been used leaves Study unobserved", () => {
    expect(encodeStudy([], today, null, cuts)).toBeNull();
    expect(encodeStudy([ses(d(1), 600)], today, "2026-11-11", cuts)).toBeNull(); // first use after today
  });
  it("criterion 2: a timer in use with no minutes for this course in the window is Low, not unobserved", () => {
    expect(encodeStudy([], today, full, cuts)).toBe("Low");
    expect(encodeStudy([ses(d(40), 600)], today, full, cuts)).toBe("Low"); // only old study
    expect(encodeStudy([ses(d(-1), 600)], today, full, cuts)).toBe("Low"); // future session ignored
  });
  it("criterion 3: an evening session in America/Vancouver counts on its local date, not the UTC date", () => {
    // 2026-11-09 20:00 PST = 2026-11-10T04:00Z. Local day is the 9th; UTC day is the 10th.
    const evening: StudySession = { ...ses("2026-11-09", 960), started_at: "2026-11-10T04:00:00Z" };
    expect(localDay(evening.started_at, "America/Vancouver")).toBe("2026-11-09");
    expect(localDay(evening.started_at, "UTC")).toBe("2026-11-10");
    // as of local 2026-11-09 the session is in the window; by its UTC date it would be tomorrow and dropped
    expect(encodeStudy([evening], "2026-11-09", full, cuts, "America/Vancouver")).toBe("Med");
    expect(encodeStudy([evening], "2026-11-09", full, cuts, "UTC")).toBe("Low");
  });
});

describe("encodeTimeliness", () => {
  const items = (late: number, n: number) => Array.from({ length: n }, (_, i) => ({ late: i < late, missing: false }));
  it("criterion 2: On time, Some late, Often late or missing at the 0 and 1/3 edges", () => {
    expect(encodeTimeliness(items(0, 3), cuts)).toBe("On time");
    expect(encodeTimeliness(items(1, 3), cuts)).toBe("Some late"); // exactly 1/3
    expect(encodeTimeliness(items(2, 5), cuts)).toBe("Often late or missing"); // 0.4
    // the cut is read from cpts.json, not hardcoded
    expect(encodeTimeliness(items(2, 5), { timeliness: { some_late_max: 0.5 } })).toBe("Some late");
    expect(encodeTimeliness([{ late: false, missing: true }], cuts)).toBe("Often late or missing");
  });
  it("criterion 2: no earlier items leaves it unobserved", () => {
    expect(encodeTimeliness([], cuts)).toBeNull();
  });
});

describe("encodeDaysLeft", () => {
  it("criterion 3: 1 to 2, 3 to 7, 8 and over from the exam date and today", () => {
    const d = (n: number) => encodeDaysLeft(new Date(Date.parse(today) + n * 86_400_000).toISOString(), today);
    expect([1, 2, 3, 7, 8, 30].map(d)).toEqual(["1-2", "1-2", "3-7", "3-7", "8+", "8+"]);
    expect([0, -1].map(d)).toEqual([null, null]);
  });
});
