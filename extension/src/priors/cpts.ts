import type { Tables } from "../model/infer";
import type { LoadCuts } from "../model/stress";
import { stores } from "../storage/db";

/** Published by the priors job to GitHub Pages (design-v2, Learning the CPTs, step 4). */
export const CPTS_URL = "https://brendenjones1.github.io/Bayesian-Study-Planner/cpts.json";
/** Oldest cpts.json model_version this extension understands. */
export const MIN_MODEL_VERSION = "2.0.0";

export interface Cpts extends Tables {
  model_version: string;
  built_at: string;
  cut_points: { load_deadlines_next_3_days: LoadCuts };
}
export interface CptsResult {
  cpts: Cpts | null;
  /** Set when the fetch failed or the file was rejected; cpts then holds the last cached tables. */
  message?: string;
  /** Set instead of `message` when the fetch failed but the bundled tables stand in: not an error. */
  note?: string;
}

const older = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};

/** GET cpts.json, cache it with its version, and fall back to the cache with a message on any failure. */
export async function loadCpts(
  db: IDBDatabase,
  opts: { fetchFn?: typeof fetch; minVersion?: string; bundled?: Cpts } = {},
): Promise<CptsResult> {
  const cache = stores(db).cpts_cache;
  const doFetch = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const min = opts.minVersion ?? MIN_MODEL_VERSION;
  // The bundled copy only stands in when nothing is cached (first install, before Pages is live).
  const saved = (await cache.get("default"))?.data;
  const cached = saved ?? opts.bundled ?? null;
  const fail = (message: string): CptsResult =>
    !saved && opts.bundled ? { cpts: cached, note: "Using built-in tables; will update when online." } : { cpts: cached, message };
  let data: Cpts;
  try {
    const res = await doFetch(CPTS_URL, { method: "GET" });
    if (!res.ok) return fail(`Could not load the latest tables (status ${res.status}); using the last saved ones.`);
    data = await res.json();
  } catch {
    return fail("Could not load the latest tables (missing or corrupt file); using the last saved ones.");
  }
  if (typeof data?.model_version !== "string" || typeof data.built_at !== "string" || typeof data.tables !== "object" || !data.tables)
    return fail("The latest tables are corrupt; using the last saved ones.");
  if (older(data.model_version, min))
    return fail(`The latest tables (version ${data.model_version}) are older than this extension needs (${min}); using the last saved ones.`);
  await cache.put({ id: "default", version: data.model_version, data });
  return { cpts: data };
}
