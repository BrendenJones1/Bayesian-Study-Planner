import { describe, expect, it } from "vitest";
import { encodeDaysLeft, encodeStudy, encodeTimeliness, type CutPoints } from "./encode";
import type { StudySession } from "../storage/db";

const cuts: CutPoints = {
  study_volume_hours_per_course_week: { low_max: 2, med_max: 4 },
  study_active_day_share: { low_max: 0.2, med_max: 0.4 },
  study_level_sum: { Low: [0, 1], Med: [2], High: [3, 4] },
};
const ses = (day: string, active_minutes: number): StudySession => ({
  session_id: day, course_id: 1, module_id: 1, started_at: `${day}T10:00:00Z`, ended_at: `${day}T11:00:00Z`, active_minutes,
});
const today = "2026-11-10";

describe("encodeStudy", () => {
  it("criterion 1: minutes per day become Low, Med or High at the volume and active-day edges", () => {
    // one active day (1/7 <= 0.2 -> 0); hours 1.98 -> 0, 2 -> 1, 4 -> 2
    expect(encodeStudy([ses("2026-11-09", 119)], today, cuts)).toBe("Low"); // 0+0
    expect(encodeStudy([ses("2026-11-09", 120)], today, cuts)).toBe("Low"); // 1+0
    expect(encodeStudy([ses("2026-11-09", 240)], today, cuts)).toBe("Med"); // 2+0
    // 3 active days (3/7 > 0.4 -> 2), 1 h total -> vol 0
    const three = ["2026-11-07", "2026-11-08", "2026-11-09"].map((d) => ses(d, 20));
    expect(encodeStudy(three, today, cuts)).toBe("Med"); // 0+2
    expect(encodeStudy([...three, ses("2026-11-10", 200)], today, cuts)).toBe("High"); // 2+2
    // 2 active days: 2/7 = 0.286 -> 1; 4 h -> 2; sum 3
    expect(encodeStudy([ses("2026-11-08", 120), ses("2026-11-09", 120)], today, cuts)).toBe("High");
  });
  it("criterion 1: an active-day share equal to a cut point stays in the lower bucket", () => {
    const c = { ...cuts, study_active_day_share: { low_max: 1 / 7, med_max: 2 / 7 } };
    expect(encodeStudy([ses("2026-11-09", 240)], today, c)).toBe("Med"); // act 0 (1/7 <= low_max) + vol 2
  });
  it("criterion 1: with no timer use (no sessions in the last 7 days) the node is left unobserved", () => {
    expect(encodeStudy([], today, cuts)).toBeNull();
    expect(encodeStudy([ses("2026-11-03", 600)], today, cuts)).toBeNull(); // 7 days ago, outside the window
    expect(encodeStudy([ses("2026-11-04", 600)], today, cuts)).not.toBeNull(); // window edge: 6 days ago
    expect(encodeStudy([ses("2026-11-11", 600)], today, cuts)).toBeNull(); // future
  });
});

describe("encodeTimeliness", () => {
  const items = (late: number, n: number) => Array.from({ length: n }, (_, i) => ({ late: i < late, missing: false }));
  it("criterion 2: On time, Some late, Often late or missing at the 0 and 1/3 edges", () => {
    expect(encodeTimeliness(items(0, 3))).toBe("On time");
    expect(encodeTimeliness(items(1, 3))).toBe("Some late"); // exactly 1/3
    expect(encodeTimeliness(items(2, 5))).toBe("Often late or missing"); // 0.4
    expect(encodeTimeliness([{ late: false, missing: true }])).toBe("Often late or missing");
  });
  it("criterion 2: no earlier items leaves it unobserved", () => {
    expect(encodeTimeliness([])).toBeNull();
  });
});

describe("encodeDaysLeft", () => {
  it("criterion 3: 1 to 2, 3 to 7, 8 and over from the exam date and today", () => {
    const d = (n: number) => encodeDaysLeft(new Date(Date.parse(today) + n * 86_400_000).toISOString(), today);
    expect([1, 2, 3, 7, 8, 30].map(d)).toEqual(["1-2", "1-2", "3-7", "3-7", "8+", "8+"]);
    expect([0, -1].map(d)).toEqual([null, null]);
  });
});
