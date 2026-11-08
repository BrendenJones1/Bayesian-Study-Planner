import { describe, expect, it } from "vitest";
import type { CourseCache, Item } from "./load";
import { proposeFromText } from "./propose";

const item = (name: string, due_at: string | null = null): Item => ({
  item_id: name, name, type: "exam", due_at, group_id: null, group_name: null, weight: null, weight_is_fallback: false,
  study_candidate: true, points: 100, module_ids: [], class_stats: null,
});
const course = (p: Partial<CourseCache>): CourseCache => ({
  canvas_course_id: 1, course_code: "STAT 251", term: null, instructor: null, events: null, syllabus: null,
  announcements: null, modules: [], items: [item("Midterm 1"), item("Midterm 2"), item("Final Exam"), item("Quiz 3")], ...p,
});
const now = new Date("2026-09-10T00:00:00Z");
const ann = (title: string, message: string) => ({ title, posted_at: "2026-10-01T00:00:00Z", message });

describe("proposeFromText", () => {
  it("text near midterm/exam/final/quiz with a date yields a proposed date for the matching item", () => {
    const syl = course({ syllabus: "Midterm 1 will be held on October 25.\nThe final exam is on Dec. 12, 2026. Quiz 3: 2026-11-02." });
    const got = proposeFromText(syl, now).filter((p) => p.kind === "date").map((p) => p.kind === "date" && [p.item_id, p.date]);
    expect(got).toEqual([["Midterm 1", "2026-10-25"], ["Final Exam", "2026-12-12"], ["Quiz 3", "2026-11-02"]]);
  });
  it("syllabus snippet with day-first date and ordinal", () => {
    const got = proposeFromText(course({ syllabus: "Midterm 2 is on the 3rd of November." }), now);
    expect(got[0]).toMatchObject({ kind: "date", item_id: "Midterm 2", date: "2026-11-03" });
  });
  it("Modules 4-7, 4 to 7 and 4–7 all yield a coverage set", () => {
    for (const phrase of ["Modules 4-7", "Modules 4 to 7", "Modules 4–7"]) {
      const got = proposeFromText(course({ syllabus: `The final exam covers ${phrase}.` }), now);
      expect(got[0]).toMatchObject({ kind: "coverage", item_id: "Final Exam", modules: [4, 5, 6, 7] });
    }
  });
  it("Canvas due dates and calendar events take precedence over text matches", () => {
    const c = course({
      items: [item("Midterm 1", "2026-10-20T23:59:00Z"), item("Midterm 2"), item("Final Exam")],
      events: [{ title: "Final Exam", start_at: "2026-12-14T09:00:00Z", end_at: null }],
      syllabus: "Midterm 1 is October 25. Midterm 2 is November 3. The final exam is December 12.",
    });
    expect(proposeFromText(c, now).map((p) => p.kind === "date" && p.item_id)).toEqual(["Midterm 2"]);
  });
  it("proposals are provisional and carry their source sentence", () => {
    const c = course({ announcements: [ann("Update", "Reminder: Midterm 2 is on Nov 3. Bring a calculator.")] });
    const [p] = proposeFromText(c, now);
    expect(p).toMatchObject({ provisional: true, source: "announcement", sentence: "Reminder: Midterm 2 is on Nov 3." });
  });
  it("announcement without a year uses its posted year; second announcement works too", () => {
    const c = course({ announcements: [ann("Exam", "The final exam is on 12 December."), ann("Quiz", "Quiz 3 moved to Nov. 9")] });
    expect(proposeFromText(c, now).map((p) => p.kind === "date" && p.date)).toEqual(["2026-12-12", "2026-11-09"]);
  });
  it("text with no match yields nothing", () => {
    expect(proposeFromText(course({ syllabus: "Office hours are Tuesdays. Be kind.", announcements: [ann("Hi", "Welcome!")] }), now)).toEqual([]);
  });
  it("'examples' is not the exam keyword", () => {
    expect(proposeFromText(course({ syllabus: "Practice examples are posted Oct 3." }), now)).toEqual([]);
  });
  it("parsing is pure: no fetch is called and the output is the expected proposal", () => {
    const f = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error("network"); }) as typeof fetch;
    try {
      expect(proposeFromText(course({ syllabus: "Midterm 1 is October 25." }), now)).toEqual([
        { provisional: true, source: "syllabus", sentence: "Midterm 1 is October 25.", kind: "date", item_id: "Midterm 1", date: "2026-10-25" },
      ]);
    } finally { globalThis.fetch = f; }
  });
  it("a yearless date takes the year inside the course term window: Term 2 'February 10' run in December is next year", () => {
    const t2 = course({ start_at: "2027-01-05T00:00:00Z", end_at: "2027-04-20T00:00:00Z", syllabus: "The final exam is on February 10." });
    expect(proposeFromText(t2, new Date("2026-12-10T00:00:00Z"))[0]).toMatchObject({ kind: "date", item_id: "Final Exam", date: "2027-02-10" });
  });
  it("a yearless date that fits neither year in the window yields no date proposal", () => {
    const t2 = course({ start_at: "2027-01-05T00:00:00Z", end_at: "2027-04-20T00:00:00Z", syllabus: "The final exam is on September 10." });
    expect(proposeFromText(t2, new Date("2026-12-10T00:00:00Z"))).toEqual([]);
  });
  it("with a keyword matching two items and no number, the date is ambiguous and nothing is proposed", () => {
    expect(proposeFromText(course({ syllabus: "Quiz 3 is the week after the midterm on Oct 14." }), now)).toHaveLength(0);
  });
  it("with several keywords, the date goes to the nearest one", () => {
    const one = course({ items: [item("Midterm"), item("Quiz 3")], syllabus: "Quiz 3 is the week after the midterm on Oct 14." });
    expect(proposeFromText(one, now)).toMatchObject([{ kind: "date", item_id: "Midterm", date: "2026-10-14" }]);
  });
  it("a calendar event suppresses a proposal only when its title equals the item name after normalising", () => {
    const ev = (title: string) => [{ title, start_at: "2026-12-14T09:00:00Z", end_at: null }];
    const syllabus = "The final exam is on December 12.";
    expect(proposeFromText(course({ events: ev("Final Exam Review"), syllabus }), now)).toHaveLength(1);
    expect(proposeFromText(course({ events: ev("Final exam"), syllabus }), now)).toHaveLength(0);
    expect(proposeFromText(course({ events: ev("  FINAL   Exam! "), syllabus }), now)).toHaveLength(0);
  });
  it("month names match only as whole words: 'Marching 5' and 'Mayor 3' give no date", () => {
    expect(proposeFromText(course({ syllabus: "The final exam is Marching 5." }), now)).toEqual([]);
    expect(proposeFromText(course({ syllabus: "The final exam is Mayor 3." }), now)).toEqual([]);
    expect(proposeFromText(course({ syllabus: "The final exam is on Sept 5." }), now)[0]).toMatchObject({ date: "2026-09-05" });
  });
  it("impossible dates such as Feb 31 are rejected, not proposed", () => {
    expect(proposeFromText(course({ syllabus: "The final exam is on February 31." }), now)).toEqual([]);
    expect(proposeFromText(course({ syllabus: "The final exam is on 2026-02-30." }), now)).toEqual([]);
    expect(proposeFromText(course({ syllabus: "The final exam is on Feb 29, 2027." }), now)).toEqual([]);
  });
});
