import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, SCHEMA_VERSION, openDb, stores } from "./db";

let n = 0;
const fresh = () => `db-${n++}`;

describe("storage layer", () => {
  it("has typed wrappers for course_cache, submission_history, study_session, quiz_item, quiz_answer, posterior, availability, frozen_prediction", async () => {
    const db = await openDb(fresh());
    const s = stores(db);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(Object.keys(s).sort());
    expect(Object.keys(s)).toHaveLength(8);

    await s.course_cache.put({
      canvas_course_id: 1, course_code: "COSC 111", term: null, instructor: null, events: null, syllabus: null, announcements: null, modules: [], items: [],
    });
    await s.submission_history.put({
      item_id: "a", submitted_at: null, due_at: null, score: 0, bonus: false, lead_days: null, late: false, missing: false, seconds_late: 0,
    });
    await s.study_session.put({
      session_id: "s1", course_id: 1, module_id: 2, started_at: "t0", ended_at: "t1", active_minutes: 25,
    });
    await s.quiz_item.put({ question_id: "q", module_id: 2, source_page: "p", difficulty_tag: "easy", flagged: false });
    await s.quiz_answer.put({ question_id: "q", correct: true, answered_at: "t" });
    await s.posterior.put({ course_id: 1, modules: {}, updated_at: "t" });
    await s.availability.put({ id: "default", weekly_defaults: [], busy_blocks: [] });
    await s.frozen_prediction.put({ item_id: "a", p_at_least_target: 0.7, interval: [0.5, 0.9], created_at: "t" });

    expect((await s.course_cache.get(1))?.course_code).toBe("COSC 111");
    expect((await s.submission_history.get("a"))?.score).toBe(0); // exact 0 survives
    expect(await s.study_session.getAll()).toHaveLength(1);
    expect((await s.frozen_prediction.get("a"))?.interval).toEqual([0.5, 0.9]);
    await s.quiz_answer.delete("q");
    expect(await s.quiz_answer.get("q")).toBeUndefined();
    db.close();
  });

  it("has a schema version field and a migration path that keeps existing data", async () => {
    const name = fresh();
    const v1 = await openDb(name);
    expect(v1.version).toBe(SCHEMA_VERSION);
    await stores(v1).quiz_answer.put({ question_id: "q", correct: false, answered_at: "t" });
    v1.close();

    // A later release appends one migration; v1 data is kept and the step runs once.
    const ran: number[] = [];
    const v2 = await openDb(name, [
      ...MIGRATIONS,
      (_db, tx) => {
        ran.push(1);
        tx.objectStore("quiz_answer").createIndex("by_time", "answered_at");
      },
    ]);
    expect(v2.version).toBe(SCHEMA_VERSION + 1);
    expect(ran).toEqual([1]);
    expect((await stores(v2).quiz_answer.get("q"))?.correct).toBe(false);
    expect(v2.transaction("quiz_answer").objectStore("quiz_answer").indexNames.contains("by_time")).toBe(true);
    v2.close();
  });

  it("the late/missing migration is appended and keeps existing submissions", async () => {
    const name = fresh();
    const old = await openDb(name, MIGRATIONS.slice(0, 1));
    old.transaction("submission_history", "readwrite").objectStore("submission_history")
      .put({ item_id: "a", submitted_at: null, due_at: null, score: 0.5, bonus: false, lead_days: null });
    await new Promise((r) => (old.transaction("submission_history").oncomplete = r));
    old.close();
    const db = await openDb(name);
    expect(await stores(db).submission_history.get("a")).toMatchObject({
      score: 0.5, late: false, missing: false, seconds_late: 0,
    });
    db.close();
  });
});
