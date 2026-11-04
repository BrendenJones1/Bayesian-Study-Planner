import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, openDb, stores } from "./db";
import { exportData } from "./export";

describe("export my data", () => {
  it("exports every store; nothing is uploaded", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const db = await openDb("export-1");
    const s = stores(db);
    await s.study_session.put({
      session_id: "s1", course_id: 1, module_id: 2, started_at: "t0", ended_at: "t1", active_minutes: 25,
    });
    await s.quiz_answer.put({ question_id: "q", correct: true, answered_at: "t" });

    const out = await exportData(db);
    expect(Object.keys(out.stores).sort()).toEqual(Array.from(db.objectStoreNames).sort());
    expect(out.stores.study_session).toHaveLength(1);
    expect(out.stores.quiz_answer[0].question_id).toBe("q");
    expect(out.stores.posterior).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("includes schema version and export timestamp", async () => {
    const db = await openDb("export-2");
    const out = await exportData(db, new Date("2026-11-03T12:00:00Z"));
    expect(out.schema_version).toBe(SCHEMA_VERSION);
    expect(out.exported_at).toBe("2026-11-03T12:00:00.000Z");
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
