import type { CourseCache, Submission } from "../canvas/load";
import { loadCanvas } from "../canvas/load";
import { createCanvasClient } from "../canvas/client";
import { loadCpts, type Cpts, type CptsResult } from "../priors/cpts";
import { stores } from "../storage/db";

export interface Loaded {
  courses: CourseCache[];
  submissions: Submission[];
  cpts: Cpts | null;
  /** One message per failed step, shown as-is. */
  errors: string[];
  /** Neutral messages (not errors), shown as-is. */
  notes: string[];
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Popup open: Canvas first, then the tables; a failure in one is reported and the other still runs. Returns what is stored. */
export async function loadOnOpen(
  db: IDBDatabase,
  o: { canvasFetch?: typeof fetch; fetchFn?: typeof fetch; bundled?: Cpts },
  progress: (step: string) => void = () => {},
): Promise<Loaded> {
  const s = stores(db);
  const errors: string[] = [];
  progress("Loading Canvas…");
  try {
    await loadCanvas(createCanvasClient({ fetchFn: o.canvasFetch }), {
      putCourse: s.course_cache.put,
      getCourse: async (id) => (await s.course_cache.get(id)) as CourseCache | undefined,
      putSubmission: s.submission_history.put,
    });
  } catch (e) {
    errors.push(msg(e));
  }
  progress("Loading tables…");
  let r: CptsResult = { cpts: null };
  try {
    r = await loadCpts(db, { fetchFn: o.fetchFn, bundled: o.bundled });
  } catch (e) {
    errors.push(msg(e));
  }
  if (r.message) errors.push(r.message);
  return {
    courses: await s.course_cache.getAll(),
    submissions: await s.submission_history.getAll(),
    cpts: r.cpts,
    errors,
    notes: r.note ? [r.note] : [],
  };
}
