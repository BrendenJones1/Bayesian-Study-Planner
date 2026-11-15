// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../ui/App";
import { busyIntervals, FREEBUSY_SCOPE, freeHours, tomorrowHours } from "./freebusy";
import type { Availability } from "../storage/db";

afterEach(cleanup);
const H = 3_600_000;
const avail: Availability = { id: "default", weekly_defaults: [], busy_blocks: [], window_start: 540, window_end: 1320, max_hours: 6 };
const ok = (busy: { start: string; end: string }[]) => new Response(JSON.stringify({ calendars: { primary: { busy } } }));

describe("issue 61 criteria", () => {
  it("a Connect Google Calendar button starts sign-in; no Google request is made before it is clicked", async () => {
    const connect = vi.fn().mockResolvedValue("tok");
    const calendarFetch = vi.fn().mockResolvedValue(ok([]));
    render(<App connect={connect} calendarFetch={calendarFetch} save={async () => {}} />);
    expect(connect).not.toHaveBeenCalled();
    expect(calendarFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Connect Google Calendar"));
    await waitFor(() => expect(calendarFetch).toHaveBeenCalledTimes(1));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("sign-in scope is calendar.freebusy", () => {
    expect(FREEBUSY_SCOPE).toBe("https://www.googleapis.com/auth/calendar.freebusy");
  });

  it("the free/busy query returns busy intervals only; no titles or details are requested", async () => {
    const f = vi.fn().mockResolvedValue(ok([{ start: "2026-11-12T17:00:00Z", end: "2026-11-12T18:00:00Z" }]));
    const r = await busyIntervals("tok", 0, H, f as unknown as typeof fetch);
    expect(r).toEqual([[Date.parse("2026-11-12T17:00:00Z"), Date.parse("2026-11-12T18:00:00Z")]]);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(Object.keys(body).sort()).toEqual(["items", "timeMax", "timeMin"]);
    expect(f.mock.calls[0][0]).toBe("https://www.googleapis.com/calendar/v3/freeBusy");
  });

  it("H = min(F, M), where F counts free blocks of at least 1 hour", async () => {
    // Gaps: 0-0.5 (dropped, under 1 h), 1.5-3 (1.5 h), 4-5 (1 h).
    expect(freeHours([[0.5 * H, 1.5 * H], [3 * H, 4 * H]], 0, 5 * H)).toBe(2.5);
    expect(freeHours([[0.5 * H, 1.2 * H]], 0, 3 * H)).toBe(1.8); // 0-0.5 dropped
    // M caps F: whole 13 h window free, M = 6.
    const day = new Date(2026, 10, 11, 12);
    const f = vi.fn().mockResolvedValue(ok([]));
    expect((await tomorrowHours("t", avail, day, 2, f as unknown as typeof fetch)).hours).toBe(6);
    // F below M: a 3 h window with a half-hour busy block.
    const small = { ...avail, window_start: 540, window_end: 720 };
    const busy = ok([{ start: new Date(2026, 10, 12, 10).toISOString(), end: new Date(2026, 10, 12, 10, 30).toISOString() }]);
    // gaps: 9-10 (1 h) counts, 10:30-12 (1.5 h) counts => 2.5
    expect((await tomorrowHours("t", small, day, 9, vi.fn().mockResolvedValue(busy) as unknown as typeof fetch)).hours).toBe(2.5);
  });

  it("if Google cannot be reached, the manual setting is used for that night and the UI says so", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await tomorrowHours("t", avail, new Date(), 3, failing as unknown as typeof fetch)).toEqual({
      hours: 3,
      note: "Could not reach Google Calendar; using your manual availability tonight.",
    });
    render(<App connect={async () => "t"} calendarFetch={failing} save={async () => {}} />);
    fireEvent.click(screen.getByText("Connect Google Calendar"));
    expect((await screen.findByRole("note")).textContent).toContain("using your manual availability");
  });

  it("every Google call lives in extension/src/calendar/", () => {
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const offenders = walk("src").filter(
      (p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) && !p.startsWith(join("src", "calendar")) &&
        /googleapis|chrome\.identity/.test(readFileSync(p, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
