import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Undated } from "../ui/Undated";
import { confirmDueAt, setDueAt, undatedItems } from "./undated";
import { createCanvasClient } from "./client";
import { loadCanvas } from "./load";
import { openDb, stores } from "../storage/db";
import type { CourseCache, Item } from "./load";

const item = (o: Partial<Item>): Item => ({
  item_id: "assignment:1", name: "Midterm", type: "exam", due_at: null, weight: null, points: 50,
  module_ids: [], class_stats: null, ...o,
});
const course = (items: Item[]): CourseCache => ({
  canvas_course_id: 7, course_code: "STAT 251", term: null, instructor: null, modules: [], items,
});

describe("undated items", () => {
  const c = course([
    item({}),
    item({ item_id: "assignment:2", name: "HW1", due_at: "2026-11-20T07:59:00Z" }),
    item({ item_id: "assignment:3", name: "Ungraded survey", points: 0 }),
  ]);

  it("popup lists graded items with no due date", () => {
    expect(undatedItems([c]).map((r) => r.item.item_id)).toEqual(["assignment:1"]);
    const html = renderToStaticMarkup(<Undated courses={[c]} onSet={() => {}} />);
    expect(html).toContain("Midterm");
    expect(html).not.toContain("HW1");
    expect(html).not.toContain("Ungraded survey");
  });

  it("popup lets the student set a due date, which removes the item from the list", () => {
    const next = setDueAt([c], 7, "assignment:1", "2026-12-01T23:59:00.000Z");
    expect(next[0].items[0].due_at).toBe("2026-12-01T23:59:00.000Z");
    expect(next[0].items[1]).toBe(c.items[1]);
    expect(undatedItems(next)).toEqual([]);
  });

  it("renders nothing when every graded item has a date", () => {
    const dated = course([item({ due_at: "2026-11-20T00:00:00Z" })]);
    expect(renderToStaticMarkup(<Undated courses={[dated]} onSet={() => {}} />)).toBe("");
  });
});

describe("confirming a date", () => {
  const c = course([item({})]);
  const endOfDec1 = new Date(2026, 11, 1, 23, 59).toISOString();

  it("Confirm saves the changed course with the end of the chosen day in local time", async () => {
    const saved: CourseCache[] = [];
    const next = await confirmDueAt([c], 7, "assignment:1", "2026-12-01", async (x) => void saved.push(x));
    expect(saved).toHaveLength(1);
    expect(saved[0].items[0].due_at).toBe(endOfDec1);
    expect(next[0]).toBe(saved[0]);
  });

  it("a failed save rejects, so the popup keeps the item listed", async () => {
    await expect(
      confirmDueAt([c], 7, "assignment:1", "2026-12-01", () => Promise.reject(new Error("quota"))),
    ).rejects.toThrow("quota");
  });

  it("a confirmed date stored in IndexedDB survives a Canvas reload that still has no date", async () => {
    const cache = stores(await openDb("undated-test")).course_cache;
    await cache.put(c);
    await confirmDueAt([c], 7, "assignment:1", "2026-12-01", cache.put);
    const fetchFn = (async (url: string) => {
      const path = url.replace("https://canvas.ubc.ca/api/v1", "");
      const body = path.startsWith("/courses?")
        ? [{ id: 7, course_code: "STAT 251" }]
        : path.includes("/assignments?")
          ? [{ id: 1, name: "Midterm", due_at: null, points_possible: 50 }]
          : [];
      return new Response(JSON.stringify(body));
    }) as unknown as typeof fetch;
    await loadCanvas(createCanvasClient({ fetchFn }), {
      putCourse: cache.put,
      putSubmission: async () => {},
      getCourse: cache.get,
    });
    expect((await cache.get(7))!.items[0].due_at).toBe(endOfDec1);
  });
});
