// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";
import { visibleCourses } from "./visibleCourses";
import type { CourseCache } from "../canvas/load";
import type { Settings } from "../storage/db";

afterEach(cleanup);
const today = new Date("2026-11-15T12:00:00Z");
const mk = (id: number, code: string, end_at?: string | null): CourseCache => ({
  canvas_course_id: id, course_code: code, term: null, end_at, instructor: null, events: null, syllabus: null, announcements: null, modules: [],
  items: [{
    item_id: `a:${id}`, name: `Final ${code}`, type: "exam", due_at: "2027-01-01T00:00:00Z", group_id: null, group_name: null, weight: 30,
    weight_is_fallback: false, study_candidate: true, points: 10, module_ids: [], class_stats: null,
  }],
});
const old = mk(1, "OLD 100", "2026-04-30T00:00:00Z");
const cur = mk(2, "CUR 200", "2027-04-30T00:00:00Z");
const open = mk(3, "OPEN 300", null);
const base: Settings = { id: "default", lambda_preset: "balanced" };

describe("My courses", () => {
  it("lists every loaded course with a checkbox", () => {
    render(<App initial={[old, cur, open]} save={async () => {}} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });
  it("unticks by default a course whose end date is before today; no end date is ticked", () => {
    expect(visibleCourses([old, cur, open], base, today)).toEqual([cur, open]);
  });
  it("the saved choice beats the default and is saved to settings", () => {
    expect(visibleCourses([old, cur], { ...base, ticked: { 1: true, 2: false } }, today)).toEqual([old]);
    const save = vi.fn(async () => {});
    render(<App initial={[old, cur]} save={async () => {}} saveSettings={save} />);
    fireEvent.click(screen.getByLabelText("CUR 200"));
    expect(save).toHaveBeenCalledWith({ ...base, ticked: { 2: false } });
  });
  it("an unticked course is absent from the sections and its grades are not used", () => {
    const { container } = render(<App initial={[old, cur]} settings={{ ...base, ticked: { 2: false } }} save={async () => {}} />);
    const sections = Array.from(container.querySelectorAll("section")).filter((s) => s.querySelector("h2")?.textContent !== "My courses");
    expect(sections.map((s) => s.textContent).join(" ")).not.toContain("CUR 200");
    expect(visibleCourses([old, cur], { ...base, ticked: { 2: false } }, today).map((c) => c.canvas_course_id)).not.toContain(2);
  });
  it("unticked courses stay in the list so they can be ticked again", () => {
    render(<App initial={[old]} save={async () => {}} />);
    expect((screen.getByLabelText("OLD 100") as HTMLInputElement).checked).toBe(false);
  });
});
