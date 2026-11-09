// @vitest-environment jsdom
import "fake-indexeddb/auto";
import bundledJson from "../../../priors/tables/cpts.json";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { loadOnOpen } from "./open";
import { CPTS_URL, type Cpts } from "../priors/cpts";
import { openDb, stores, type Availability } from "../storage/db";
import type { CourseCache, Item } from "../canvas/load";
import { ACTION_HOURS, LAMBDA_PRESETS } from "../model/constants";
import { localDay } from "../model/encode";
import { gradeQuery, type Action } from "../model/query";
import { deadlineCount, stressCurve } from "../model/stress";
import { bestPlan } from "../planner/plan";

const bundled = bundledJson as unknown as Cpts;
afterEach(cleanup);

const DAY = 86_400_000;
const item = (id: string, type: Item["type"], due: number | null): Item => ({
  item_id: id, name: id, type, due_at: due === null ? null : new Date(Date.now() + due * DAY).toISOString(), group_id: null, group_name: null,
  weight: 0.3, weight_is_fallback: false, study_candidate: true, points: 100, module_ids: [], class_stats: null,
});
const course = (id: number, code: string, items: Item[]): CourseCache => ({
  canvas_course_id: id, course_code: code, term: null, instructor: null, events: null, syllabus: null, announcements: null, modules: [], items,
});
const free: Availability = { id: "default", weekly_defaults: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, minutes: 600 })), busy_blocks: [] };

let n = 0;
/** A fresh db seeded with courses; a fake Canvas that lists no courses (so the seeded ones stay) and a fake fetch for the tables. */
async function setup(courses: CourseCache[], cptsFetch: typeof fetch, opts: { availability?: Availability; preset?: "grades" | "wellbeing"; scored?: string[] } = {}) {
  const db = await openDb(`tonight-${n++}`);
  for (const c of courses) await stores(db).course_cache.put(c);
  for (const id of opts.scored ?? [])
    await stores(db).submission_history.put({ item_id: id, submitted_at: null, due_at: null, score: 0.6, bonus: false, lead_days: 1, late: false, missing: false, seconds_late: 0 });
  const canvasFetch = vi.fn(async () => new Response("[]", { status: 200 })) as unknown as typeof fetch;
  const saved: unknown[] = [];
  render(
    <App
      save={async () => {}}
      availability={opts.availability ?? free}
      settings={{ id: "default", lambda_preset: opts.preset ?? "balanced" }}
      saveSettings={async (s) => void saved.push(s)}
      load={(p) => loadOnOpen(db, { canvasFetch, fetchFn: cptsFetch, bundled }, p)}
    />,
  );
  return { db, canvasFetch, saved };
}
const down = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
const exam5 = [course(1, "ANTH 100", [item("final", "exam", 5)])];
/** With a deadline tomorrow and 6 h free, Grades first picks Intense and Wellbeing first picks Rest. */
const w = (i: Item, weight: number): Item => ({ ...i, weight });
const flip = course(1, "ANTH 100", [w(item("hw1", "assignment", -20), 0.1), w(item("hw2", "assignment", -10), 0.1), w(item("final", "exam", 5), 0.4), item("due-tomorrow", "assignment", 1)]);
const recommended = () => document.querySelector("strong")?.textContent;

describe("popup: tonight's plan", () => {
  it("opening the popup calls loadCanvas then loadCpts, shows progress and errors, and shows cached data while loading", async () => {
    const order: string[] = [];
    const cptsFetch = vi.fn(async () => { order.push("cpts"); throw new Error("offline"); }) as unknown as typeof fetch;
    const db = await openDb(`tonight-${n++}`);
    await stores(db).course_cache.put(exam5[0]);
    const canvasFetch = vi.fn(async () => { order.push("canvas"); return new Response("[]"); }) as unknown as typeof fetch;
    render(
      <App
        save={async () => {}}
        initial={exam5}
        initialCpts={bundled}
        availability={free}
        load={(p) => loadOnOpen(db, { canvasFetch, fetchFn: cptsFetch, bundled }, p)}
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/Loading/); // progress
    expect(screen.getByText("ANTH 100")).toBeTruthy(); // cached, while loading
    // The bundled tables stand in, so this is a neutral note, not an error.
    await waitFor(() => expect(screen.getByRole("note").textContent).toMatch(/Using built-in tables; will update when online/));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(order).toEqual(["canvas", "cpts"]);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a Canvas error is shown and the tables still load", async () => {
    const db = await openDb(`tonight-${n++}`);
    const canvasFetch = vi.fn(async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    const r = await loadOnOpen(db, { canvasFetch, fetchFn: down, bundled });
    expect(r.errors[0]).toMatch(/Canvas auth error 403/);
    expect(r.cpts).toBe(bundled);
  });

  it("first install with the fetch failing uses the bundled tables", async () => {
    await setup(exam5, down);
    await waitFor(() => screen.getByText(/Plan tonight/));
    expect(screen.getAllByText(/of students like you reached the target/)).toHaveLength(3);
  });

  it("the published file wins when it loads and is not older", async () => {
    const newer = { ...bundled, model_version: "2.9.0" };
    const db = await openDb(`tonight-${n++}`);
    const r = await loadOnOpen(db, { canvasFetch: vi.fn(async () => new Response("[]")) as unknown as typeof fetch, fetchFn: vi.fn(async (u: unknown) => (u === CPTS_URL ? new Response(JSON.stringify(newer)) : new Response("", { status: 404 }))) as unknown as typeof fetch, bundled });
    expect(r.cpts?.model_version).toBe("2.9.0");
  });

  it("a course with no exam shows no card", async () => {
    await setup([course(1, "ANTH 100", [item("hw", "assignment", 3)])], down);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByText(/Plan tonight/)).toBeNull();
    expect(screen.queryByText("Tonight")).toBeNull();
  });

  it("an exam more than 14 days away gets no card", async () => {
    await setup([course(1, "ANTH 100", [item("final", "exam", 20)])], down);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByText(/Plan tonight/)).toBeNull();
  });

  it("a card shows the exam date, a target picker limited to TARGETS defaulting to 72, and a bound reason when there is one", async () => {
    await setup(exam5, down);
    const picker = (await screen.findByLabelText("Target for ANTH 100")) as HTMLSelectElement;
    expect(picker.value).toBe("72");
    expect(Array.from(picker.options).map((o) => o.value)).toEqual(["50", "55", "60", "64", "68", "72", "76", "80", "85", "90"]);
    expect(screen.getByText(/^Exam: \d{4}-\d{2}-\d{2}$/)).toBeTruthy();
  });

  it("a target change re-queries and is stored per course", async () => {
    const { saved } = await setup(exam5, down);
    const picker = await screen.findByLabelText("Target for ANTH 100");
    const before = screen.getAllByText(/of students like you/).map((e) => e.textContent);
    fireEvent.change(picker, { target: { value: "90" } });
    expect(screen.getAllByText(/of students like you/).map((e) => e.textContent)).not.toEqual(before);
    expect(saved).toEqual([expect.objectContaining({ targets: { 1: 90 } })]);
  });

  it("a preset change changes the recommendation immediately", async () => {
    await setup([flip], down, { preset: "grades", scored: ["hw1", "hw2"] });
    await screen.findByText(/Plan tonight/);
    expect(recommended()).toBe("Intense");
    fireEvent.change(screen.getByLabelText("Preset"), { target: { value: "wellbeing" } });
    expect(recommended()).toBe("Rest");
  });

  it("shows today's available hours, and Intense is not recommended under 5", async () => {
    const short: Availability = { ...free, weekly_defaults: free.weekly_defaults.map((d) => ({ ...d, minutes: 120 })) };
    await setup([flip], down, { availability: short, preset: "grades", scored: ["hw1", "hw2"] });
    await screen.findByText(/Plan tonight/);
    expect(screen.getByText("Hours available today: 2.0")).toBeTruthy();
    expect(recommended()).not.toBe("Intense");
  });

  it("an unconfirmed exam shows no number and links to the date-confirmation view", async () => {
    await setup([course(1, "ANTH 100", [item("final", "exam", null)])], down);
    const link = await screen.findByRole("link", { name: /Confirm the exam date/ });
    expect(link.getAttribute("href")).toBe("#undated");
    expect(document.getElementById("undated")).toBeTruthy();
    expect(screen.queryByText(/reached the target/)).toBeNull();
  });

  it("copy uses population wording and never 'you will'", async () => {
    await setup(exam5, down);
    await screen.findByText(/Plan tonight/);
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/students like you/);
    expect(text).not.toMatch(/you will/i);
  });

  it("a bound reason renders on the card", async () => {
    const locked = course(1, "ANTH 100", [w(item("hw1", "assignment", -20), 40), w(item("hw2", "assignment", -10), 40), w(item("final", "exam", 5), 20)]);
    await setup([locked], down, { scored: ["hw1", "hw2"] }); // 60% on 80% of the grade: 90 is out of reach
    fireEvent.change(await screen.findByLabelText("Target for ANTH 100"), { target: { value: "90" } });
    expect(screen.getAllByText(/\(out of reach\)/)).toHaveLength(3);
  });

  it("a course absent from the published history is based on similar courses", async () => {
    await setup([course(1, "ZZZZ 999", [item("final", "exam", 5)])], down);
    await screen.findByText(/Plan tonight/);
    expect(screen.getByText("Based on similar courses.")).toBeTruthy();
    expect(screen.getAllByText(/of students like you reached the target/)).toHaveLength(3);
  });

  it("3 courses and 6 h: the plan never exceeds 6 h and matches bestPlan on the same inputs", async () => {
    const six: Availability = { ...free, weekly_defaults: free.weekly_defaults.map((d) => ({ ...d, minutes: 360 })) };
    const cs = ["ANTH 100", "ANTH 103", "ANTH 170"].map((code, i) => course(i + 1, code, [item(`final${i}`, "exam", 5), item(`due${i}`, "assignment", 1)]));
    await setup(cs, down, { availability: six, preset: "grades" });
    await screen.findByText(/Plan total/);
    const shown = Array.from(document.querySelectorAll("strong")).map((e) => e.textContent);
    const total = shown.reduce((s, a) => s + ACTION_HOURS[a as Action], 0);
    expect(total).toBeLessThanOrEqual(6);
    expect(screen.getByText(`Plan total: ${total} h`)).toBeTruthy();
    const today = localDay(new Date().toISOString());
    const tomorrow = localDay(new Date(Date.now() + DAY).toISOString());
    const items = cs.flatMap((c) => c.items);
    const p = cs.map((c) => {
      const q = gradeQuery(bundled, { ...c, submissions: [] }, c.items[0], [], today, 72);
      return { Intense: q.Intense.p, Light: q.Light.p, Rest: q.Rest.p };
    });
    const S = stressCurve(bundled, { loadToday: deadlineCount(items, today), loadTomorrow: deadlineCount(items, tomorrow), H: 6 });
    expect(shown).toEqual(bestPlan(p, S, LAMBDA_PRESETS.grades).plan);
  });
});
