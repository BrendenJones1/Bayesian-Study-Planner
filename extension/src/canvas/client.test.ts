import { describe, expect, it, vi } from "vitest";
import { CanvasAuthError, createCanvasClient } from "./client";

const B = "https://canvas.ubc.ca/api/v1";
const json = (body: unknown, status = 200, link?: string) =>
  new Response(JSON.stringify(body), { status, headers: link ? { Link: link } : {} });
const mk = (...rs: Response[]) => {
  const f = vi.fn();
  rs.forEach((r) => f.mockResolvedValueOnce(r));
  const sleep = vi.fn().mockResolvedValue(undefined);
  return { f, sleep, c: createCanvasClient({ fetchFn: f as unknown as typeof fetch, sleep }) };
};

describe("canvas client", () => {
  it("fetches from canvas.ubc.ca/api/v1 with the existing session and follows Link-header pagination", async () => {
    const { f, c } = mk(
      json([1], 200, `<${B}/courses?page=2>; rel="next", <${B}/courses?page=1>; rel="first"`),
      json([2]),
    );
    expect(await c.getAll("/courses")).toEqual([1, 2]);
    expect(f.mock.calls.map((x) => x[0])).toEqual([`${B}/courses`, `${B}/courses?page=2`]);
    expect(f.mock.calls[0][1].credentials).toBe("include");
  });

  it("only GET requests are possible from this module", async () => {
    const { f, c } = mk(json([]));
    expect(Object.keys(c)).toEqual(["getAll"]);
    await c.getAll("/courses");
    expect(f.mock.calls.every((x) => x[1].method === "GET")).toBe(true);
    const evil = mk(json([], 200, `<http://localhost/x>; rel="next"`));
    await expect(evil.c.getAll("/courses")).rejects.toThrow(/non-Canvas/);
  });

  it("retries with backoff on 429/5xx", async () => {
    const { f, sleep, c } = mk(json({}, 429), json({}, 503), json([7]));
    expect(await c.getAll("/x")).toEqual([7]);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((x) => x[0])).toEqual([500, 1000]);
  });

  it("gives up after max retries", async () => {
    const { c } = mk(...Array.from({ length: 5 }, () => json({}, 500)));
    await expect(c.getAll("/x")).rejects.toThrow(/500/);
  });

  it("surfaces auth errors to the UI without retrying", async () => {
    const { f, c } = mk(json({}, 401));
    await expect(c.getAll("/x")).rejects.toBeInstanceOf(CanvasAuthError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
