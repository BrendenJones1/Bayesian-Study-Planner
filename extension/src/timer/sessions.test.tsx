import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Sessions } from "../ui/Sessions";
import { deleteSession, editSession } from "./sessions";
import { openDb, stores } from "../storage/db";
import type { StudySession } from "../storage/db";
import type { CourseCache } from "../canvas/load";

const s = (o: Partial<StudySession>): StudySession => ({
  session_id: "a", course_id: 7, module_id: 1, started_at: "2026-11-01T10:00:00Z",
  ended_at: "2026-11-01T10:30:00Z", active_minutes: 30, ...o,
});
const course = (id: number, code: string): CourseCache => ({
  canvas_course_id: id, course_code: code, term: null, instructor: null, events: null, syllabus: null, announcements: null,
  modules: [{ id: 1, name: "Intro" }, { id: 2, name: "Bayes" }], items: [],
});
const all = [s({}), s({ session_id: "b", course_id: 8, active_minutes: 45 })];

describe("session list", () => {
  it("lists sessions per course", () => {
    const html = renderToStaticMarkup(
      <Sessions courses={[course(7, "STAT 251"), course(8, "CPSC 340")]} sessions={all} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(html.indexOf("STAT 251")).toBeLessThan(html.indexOf('value="30"'));
    expect(html.indexOf('value="30"')).toBeLessThan(html.indexOf("CPSC 340"));
    expect(html.indexOf("CPSC 340")).toBeLessThan(html.indexOf('value="45"'));
  });
});

describe("edit session", () => {
  it("changes minutes and module of only that session", () => {
    const next = editSession(all, "a", { active_minutes: 50, module_id: 2 });
    expect(next[0]).toMatchObject({ active_minutes: 50, module_id: 2 });
    expect(next[1]).toBe(all[1]);
  });

  it("rejects non-positive minutes", () => {
    expect(() => editSession(all, "a", { active_minutes: 0, module_id: 1 })).toThrow();
    expect(() => editSession(all, "a", { active_minutes: NaN, module_id: 1 })).toThrow();
  });

  it("an edit saved to IndexedDB persists", async () => {
    const st = stores(await openDb("sessions-edit-test")).study_session;
    await st.put(all[0]);
    await st.put(editSession(all, "a", { active_minutes: 50, module_id: 2 })[0]);
    expect(await st.get("a")).toMatchObject({ active_minutes: 50, module_id: 2 });
  });
});

describe("delete session", () => {
  it("removes only that session", () => {
    expect(deleteSession(all, "a")).toEqual([all[1]]);
  });

  it("a deletion in IndexedDB persists", async () => {
    const st = stores(await openDb("sessions-delete-test")).study_session;
    await st.put(all[0]);
    await st.put(all[1]);
    await st.delete("a");
    expect((await st.getAll()).map((x) => x.session_id)).toEqual(["b"]);
  });
});
