/**
 * The grade query P(grade >= t | e, a) and the single place that assembles evidence e (design-v2, Network
 * and Prediction). Pure. The UI calls these; it never builds evidence or recomputes the probability.
 */
import type { CourseCache, Item, Submission } from "../canvas/load";
import { coverage, isProvisional } from "../canvas/coverage";
import type { CoverageOverride, StudySession } from "../storage/db";
import { courseStanding, gradedSoFarState, inferBounded, itemWeightState, type Bound } from "./bounds";
import { encodeDaysLeft, encodeStudy, encodeTimeliness, localDay, type CutPoints } from "./encode";
import { conceptDifficulty, mastery, perf, type Difficulty, type GradeBin, type Graded, type Level } from "./evidence";
import { TARGETS } from "./infer";

export const ACTIONS = ["Intense", "Light", "Rest"] as const;
export type Action = (typeof ACTIONS)[number];
const SLOTS = 3; // concept slots M1..M3 / D1..D3 in the network (cpts.json hand_built.perf)

const MASTERY: Level[] = ["Low", "Med", "High"];
const DIFFICULTY: Difficulty[] = ["Easy", "Med", "Hard"];
const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length); // level index; .5 rounds up

/**
 * Splits modules (in course order) into SLOTS contiguous groups, as even as possible (larger groups first).
 * Under SLOTS modules, each is repeated SLOTS times first, so the overall mean is unchanged and no slot is empty.
 */
function slotGroups<T>(modules: T[]): T[][] {
  const ms = modules.length < SLOTS ? modules.flatMap((m) => Array<T>(SLOTS).fill(m)) : modules;
  const base = Math.floor(ms.length / SLOTS), extra = ms.length % SLOTS;
  let at = 0;
  return Array.from({ length: SLOTS }, (_, i) => ms.slice(at, (at += base + (i < extra ? 1 : 0))));
}

/** A cached course with the student's own submissions, the first timer use and the course's grade history. */
export interface CourseData extends CourseCache {
  submissions: Submission[];
  firstUse?: string | null;
  history?: GradeBin[];
  coverage_override?: CoverageOverride;
}

/**
 * Evidence for the network, from data dated before the exam only (no leakage). Earlier items: same course,
 * not the exam, due before the exam's due_at and on or before `today`; undated items are out.
 * Timeliness reads Canvas's late/missing flags on the items that have a stored submission. The loader stores
 * none for excused items, nor for an unsubmitted item not yet past due, so both count as neither late nor missing.
 * shortcut: an on-time item with no score yet leaves no record and is not counted; upgrade with an `excused` field.
 * Every covered module feeds one of the 3 concept slots (see slotGroups); a slot gets its group's mean level.
 * shortcut: Load nodes stay unobserved (no encoder yet).
 * Nodes with no data are left out, so the network treats them as unobserved.
 */
export function buildEvidence(
  course: CourseData,
  exam: Item,
  sessions: StudySession[],
  today: string,
  cuts: CutPoints,
): Record<string, string | number> {
  const ev: Record<string, string | number> = {};
  const history = course.history ?? [];
  const examDue = exam.due_at ? Date.parse(exam.due_at) : null;
  const earlier = course.items.filter(
    (i) => i.item_id !== exam.item_id && i.due_at && examDue !== null && Date.parse(i.due_at) < examDue && localDay(i.due_at) <= today,
  );
  const subs = new Map(course.submissions.map((s) => [s.item_id, s]));
  const earlierSubs = earlier.flatMap((i) => subs.get(i.item_id) ?? []);
  const graded: Graded[] = earlier.flatMap((item) => {
    const s = subs.get(item.item_id);
    return s?.score != null ? [{ item, score: s.score }] : [];
  });

  const set = (k: string, v: string | number | null) => v !== null && (ev[k] = v);
  set("Timeliness", encodeTimeliness(earlierSubs, cuts));
  set("DaysLeft", exam.due_at ? encodeDaysLeft(exam.due_at, today) : null);
  set("Study", encodeStudy(sessions.filter((s) => s.course_id === course.canvas_course_id), today, course.firstUse ?? null, cuts));
  set("ItemWeight", itemWeightState(courseStanding(course.items, []).itemShare[exam.item_id] ?? 0));
  set("GradedSoFar", gradedSoFarState(courseStanding(course.items, earlierSubs).G));

  const coursePerf = perf(graded, history);
  if (coursePerf) {
    const per = coverage(course, exam.item_id, course.coverage_override).map((m) => {
      const inModule = graded.filter((g) => g.item.module_ids.includes(m));
      return { m: MASTERY.indexOf(mastery(inModule, coursePerf.level, history)), d: DIFFICULTY.indexOf(conceptDifficulty(inModule, graded)) };
    });
    if (per.length)
      slotGroups(per).forEach((g, i) => {
        set(`M${i + 1}`, MASTERY[mean(g.map((x) => x.m))]);
        set(`D${i + 1}`, DIFFICULTY[mean(g.map((x) => x.d))]);
      });
  }
  return ev;
}

export interface ActionResult {
  /** The baseline P(grade >= target | e, a). */
  p: number;
  /** The personalized value; null until the personal offset exists. */
  personalized: number | null;
  /** Set when the target was settled by the achievable-grade bounds before inference. */
  bound?: Bound;
  /** True while the exam's covered modules are a guess the student has not confirmed. */
  provisional?: true;
}

/** P(grade >= target | e, a) for Intense, Light and Rest. @param target a UBC boundary in percent; anything else throws. */
export function gradeQuery(
  cpts: unknown,
  course: CourseData,
  exam: Item,
  sessions: StudySession[],
  today: string,
  target: number,
): Record<Action, ActionResult> {
  if (!TARGETS.includes(target)) throw new RangeError(`Target ${target} is not a UBC boundary (${TARGETS.join(", ")})`);
  const cuts = (cpts as { cut_points: CutPoints }).cut_points;
  const e = buildEvidence(course, exam, sessions, today, cuts);
  const { c, G } = courseStanding(course.items, course.submissions);
  const provisional = isProvisional(course, exam.item_id, course.coverage_override);
  const out = {} as Record<Action, ActionResult>;
  for (const a of ACTIONS) {
    const r = inferBounded(cpts, course.course_code, e, a, c, G, [target]);
    out[a] = { p: r.p_grade[target], personalized: null, ...(provisional && { provisional }), ...(r.bounds[target] && { bound: r.bounds[target] }) };
  }
  return out;
}
