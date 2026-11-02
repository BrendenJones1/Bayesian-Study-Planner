import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { back, idle, resolveIdle, start, stop } from "./session";
import { Timer } from "../ui/Timer";
import { openDb, stores } from "../storage/db";

const MIN = 60_000;
const course = { canvas_course_id: 7, course_code: "STAT 251", term: null, instructor: null, items: [], modules: [{ id: 2, name: "Week 1" }] };

describe("criterion 1: start/stop from the popup; module required", () => {
  it("start without a module throws", () => {
    expect(() => start(7, null, 0)).toThrow(/module/i);
  });

  it("popup disables Start until a module is chosen, and lists modules", () => {
    const html = renderToStaticMarkup(<Timer courses={[course]} save={async () => {}} idleApi={undefined} />);
    expect(html).toContain("STAT 251: Week 1");
    expect(html).toMatch(/<button disabled=""[^>]*>Start studying/);
  });

  it("stop yields a study_session that is stored", async () => {
    const s = stop(start(7, 2, 0), 25 * MIN, "s1");
    expect(s).toMatchObject({ course_id: 7, module_id: 2, active_minutes: 25 });
    const db = await openDb("timer-test");
    await stores(db).study_session.put(s);
    expect((await stores(db).study_session.get("s1"))?.module_id).toBe(2);
    db.close();
  });
});

describe("criterion 2: idle over 10 minutes pauses and asks on return whether to keep the idle time", () => {
  it("idle pauses the session and return prompts for a decision", () => {
    const paused = idle(start(7, 2, 0), 30 * MIN); // 10 min idle detected at minute 30 -> idle began at 20
    expect(paused.since).toBeNull();
    expect(paused.idleFrom).toBe(20 * MIN);
    expect(back(paused, 50 * MIN).returnedAt).toBe(50 * MIN);
  });

  it("keep counts the gap as study time; discard drops it", () => {
    const back1 = back(idle(start(7, 2, 0), 30 * MIN), 50 * MIN);
    const kept = stop(resolveIdle(back1, true, 50 * MIN), 60 * MIN, "k");
    const dropped = stop(resolveIdle(back1, false, 50 * MIN), 60 * MIN, "d");
    expect(kept.active_minutes).toBe(60);
    expect(dropped.active_minutes).toBe(30); // 20 before idle + 10 after return
  });
});

describe("criterion 3: active_minutes excludes idle time", () => {
  it("stopping while paused or with an unanswered prompt excludes the idle gap", () => {
    const paused = idle(start(7, 2, 0), 30 * MIN);
    expect(stop(paused, 90 * MIN, "p").active_minutes).toBe(20);
    expect(stop(back(paused, 50 * MIN), 90 * MIN, "q").active_minutes).toBe(20);
  });
});
