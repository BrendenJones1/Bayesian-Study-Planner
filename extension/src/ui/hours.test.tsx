// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import bundledJson from "../../../priors/tables/cpts.json";
import { App } from "./App";
import type { Cpts } from "../priors/cpts";
import { openDb, stores, type Availability } from "../storage/db";
import type { CourseCache, Item } from "../canvas/load";
import { availableHours } from "../planner/availability";

afterEach(cleanup);
const final: Item = {
  item_id: "final", name: "final", type: "exam", due_at: new Date(Date.now() + 5 * 86_400_000).toISOString(), group_id: null, group_name: null,
  weight: 0.3, weight_is_fallback: false, study_candidate: true, points: 100, module_ids: [], class_stats: null,
};
const courses: CourseCache[] = [{ canvas_course_id: 1, course_code: "ANTH 100", term: null, instructor: null, events: null, syllabus: null, announcements: null, modules: [], items: [final] }];
const empty: Availability = { id: "default", weekly_defaults: [], busy_blocks: [] };
const view = (availability: Availability, put: (a: Availability) => Promise<void> = async () => {}) =>
  render(<App save={async () => {}} initial={courses} initialCpts={bundledJson as unknown as Cpts} availability={availability} putAvailability={put} />);
const fillAll = (v: string) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].forEach((d) => fireEvent.change(screen.getByLabelText(d), { target: { value: v } }));

describe("popup: study hours form", () => {
  it("has a Study hours form that saves weekly_defaults in minutes through saveAvailability", async () => {
    const put = vi.fn(async () => {});
    view(empty, put);
    expect(screen.getByRole("heading", { name: "Study hours" })).toBeTruthy();
    fillAll("2.5");
    fireEvent.click(screen.getByText("Save hours"));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const saved = (put.mock.calls[0] as unknown as [Availability])[0];
    expect(saved.weekly_defaults).toEqual([0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, minutes: 150 })));
  });

  it("shows saved hours again when the popup is reopened", async () => {
    const db = await openDb("hours-reopen");
    view(empty, stores(db).availability.put);
    fillAll("3");
    fireEvent.click(screen.getByText("Save hours"));
    await waitFor(async () => expect(await stores(db).availability.get("default")).toBeTruthy());
    cleanup();
    view((await stores(db).availability.get("default"))!);
    expect((screen.getByLabelText("Monday") as HTMLInputElement).value).toBe("3");
  });

  it("rejects an entry below 0 or above 24 hours with a message and saves nothing", () => {
    const put = vi.fn(async () => {});
    view(empty, put);
    fillAll("2");
    fireEvent.change(screen.getByLabelText("Friday"), { target: { value: "25" } });
    fireEvent.click(screen.getByText("Save hours"));
    expect(screen.getByRole("alert").textContent).toMatch(/between 0 and 24/);
    fireEvent.change(screen.getByLabelText("Friday"), { target: { value: "-1" } });
    fireEvent.click(screen.getByText("Save hours"));
    expect(screen.getByRole("alert").textContent).toMatch(/between 0 and 24/);
    expect(put).not.toHaveBeenCalled();
  });

  it("saving recomputes Hours available today without reopening, using availableHours", async () => {
    view(empty);
    fillAll("4");
    fireEvent.click(screen.getByText("Save hours"));
    const want = availableHours({ ...empty, weekly_defaults: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, minutes: 240 })) }, new Date());
    await waitFor(() => expect(screen.getByText(`Hours available today: ${want.toFixed(1)}`)).toBeTruthy());
  });

  it("before any hours are saved, Tonight says the hours are not set yet and points to the form", () => {
    view(empty);
    expect(screen.getByText(/Hours not set yet/)).toBeTruthy();
    expect(screen.getByText("Set your study hours").getAttribute("href")).toBe("#study-hours");
    expect(screen.queryByText(/Hours available today/)).toBeNull();
  });
});
