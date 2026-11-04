import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { openDb, stores } from "../storage/db";
import { CPTS_URL, loadCpts } from "./cpts";

let n = 0;
const fresh = () => openDb(`cpts-${n++}`);
const good = { model_version: "2.1.0", built_at: "2026-11-04T00:00:00+00:00", tables: { study: {} } };
const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("loadCpts", () => {
  it("criterion 3: GETs cpts.json from the Pages URL and caches it with its version in cpts_cache", async () => {
    const db = await fresh();
    const fetchFn = reply(good);
    const r = await loadCpts(db, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(CPTS_URL, { method: "GET" });
    expect(new URL(CPTS_URL).hostname).toBe("brendenjones1.github.io");
    expect(r.message).toBeUndefined();
    const row = await stores(db).cpts_cache.get("default");
    expect(row?.version).toBe("2.1.0");
    expect(row?.data).toEqual(good);
  });

  const cases: [string, typeof fetch][] = [
    ["missing file", reply("not found", 404)],
    ["corrupt file", reply("{not json")],
    ["too-old file", reply({ ...good, model_version: "1.9.9" })],
  ];
  for (const [name, bad] of cases) {
    it(`criterion 4: a ${name} shows a message and the last cached tables keep working`, async () => {
      const db = await fresh();
      await loadCpts(db, { fetchFn: reply(good) });
      const r = await loadCpts(db, { fetchFn: bad });
      expect(r.message).toBeTruthy();
      expect(r.cpts).toEqual(good);
      expect((await stores(db).cpts_cache.get("default"))?.data).toEqual(good);
    });
  }

  it("criterion 4: a bad file with nothing cached gives a message and no tables", async () => {
    const r = await loadCpts(await fresh(), { fetchFn: reply("{nope") });
    expect(r.cpts).toBeNull();
    expect(r.message).toBeTruthy();
  });
});
