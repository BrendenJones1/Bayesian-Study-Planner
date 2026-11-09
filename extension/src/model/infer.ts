/**
 * Exact inference for the network of docs/design-v2.md (Network, Prediction): plain enumeration over
 * every hidden variable, with no sampling or approximation. It mirrors eval/bsp_eval/network.py, which
 * builds the same network for pgmpy VariableElimination; shared/fixtures/inference.json pins the two together.
 * Research basis: inference by enumeration (Koller & Friedman, Probabilistic Graphical Models, ch. 9).
 * Every probability comes from cpts.json; the only numbers here are the uniform priors of root nodes,
 * which cancel once a root is evidence.
 */

type State = string;
interface Node {
  states: State[];
  parents: string[];
  dist: (pa: Record<string, State>) => number[];
}
interface Table {
  parents: Record<string, string[]>;
  states: string[];
  values: Record<string, number[]>;
}
/** P(grade >= target | final decile): target (as text) to one value per decile 1..10. */
export type GradeMap = Record<string, number[]>;

/**
 * The course's own grade map. A course with under 2 years of history already carries its difficulty group's
 * pooled table (priors/ builds it in), so the only other case is a course with no history: the pooled Medium
 * table, flagged weak ("based on similar courses").
 */
export const gradeMapFor = (c: Tables, course: string): { table: GradeMap; weak: boolean } => {
  const own = c.tables.grade_map.courses[course];
  return own ? { table: own, weak: false } : { table: c.tables.grade_map.pooled_medium, weak: true };
};

export interface Tables {
  tables: Record<string, Table> & {
    grade_map: { courses: Record<string, GradeMap>; pooled_medium: GradeMap };
  };
  hand_built: Record<string, Table>;
}
export interface Answer {
  p_grade: Record<number, number>;
  e_stress_next: number;
}

export const TARGETS = [50, 55, 60, 64, 68, 72, 76, 80, 85, 90];
const LEVELS = ["Low", "Med", "High"];
const STRESS_SCORE: Record<string, number> = { Low: 0, Med: 0.5, High: 1 };
const OFFSETS = ["-2", "-1", "0", "1", "2"];
const DECILES = Array.from({ length: 10 }, (_, i) => String(i + 1));

const root = (states: State[]): Node => ({ states, parents: [], dist: () => states.map(() => 1 / states.length) });
const fromTable = (t: Table, parents: string[]): Node => ({
  states: t.states,
  parents,
  dist: (pa) => t.values[parents.map((p) => pa[p]).join("|")],
});

function buildNodes(c: Tables): Record<string, Node> {
  const { tables: t, hand_built: h } = c;
  const k = Object.keys(h.perf.parents).length;
  const ds = Array.from({ length: k }, (_, i) => `D${i + 1}`);
  const ms = Array.from({ length: k }, (_, i) => `M${i + 1}`);
  const weights = t.final_standing_g25.parents.item_weight;
  const nodes: Record<string, Node> = {};
  ds.forEach((d) => (nodes[d] = root(h.exam_difficulty.states)));
  ms.forEach((m) => (nodes[m] = root(LEVELS)));
  Object.assign(nodes, {
    ExamDifficulty: fromTable(h.exam_difficulty, ds),
    Perf: fromTable(h.perf, ms),
    Timeliness: root(t.exam_standing.parents.timeliness),
    DaysLeft: root(h.study_before.parents.days_left),
    GradedSoFar: root(["25", "50"]),
    ItemWeight: root(weights),
    LoadToday: root(LEVELS),
    LoadTomorrow: root(LEVELS),
    Action: root(h.study_before.parents.action),
    PersonalOffset: root(OFFSETS),
    Study: fromTable(t.study, ["Perf"]),
    StudyBefore: fromTable(h.study_before, ["Study", "Action", "DaysLeft"]),
    ExamStanding: fromTable(t.exam_standing, ["Perf", "StudyBefore", "Timeliness", "ExamDifficulty"]),
    StressNow: fromTable(t.stress_now, ["LoadToday"]),
    StressNext: fromTable(t.stress_next, ["StressNow", "LoadTomorrow"]),
    // The checkpoint picks the table; the offset shifts the exam decile, clipped to 1..10.
    FinalStanding: {
      states: DECILES,
      parents: ["Perf", "ExamStanding", "PersonalOffset", "ItemWeight", "GradedSoFar"],
      dist: (pa: Record<string, State>) => {
        const s = Math.min(10, Math.max(1, Number(pa.ExamStanding) + Number(pa.PersonalOffset)));
        return t[`final_standing_g${pa.GradedSoFar}`].values[`${pa.Perf}|${s}|${pa.ItemWeight}`];
      },
    },
  });
  return nodes;
}

/** P(query | evidence) by summing the product of CPT entries over every assignment of the hidden ancestors. */
function posterior(nodes: Record<string, Node>, query: string, evidence: Record<string, State>): number[] {
  const need = new Set<string>();
  const visit = (n: string) => {
    if (need.has(n)) return;
    need.add(n);
    nodes[n].parents.forEach(visit);
  };
  visit(query);
  const order = Object.keys(nodes).filter((n) => need.has(n)); // parents are defined before children
  const out = nodes[query].states.map(() => 0);
  const pa: Record<string, State> = {};
  const go = (i: number, w: number) => {
    if (i === order.length) {
      out[nodes[query].states.indexOf(pa[query])] += w;
      return;
    }
    const name = order[i];
    const n = nodes[name];
    const p = n.dist(pa);
    n.states.forEach((s, j) => {
      if (p[j] === 0 || (name in evidence && evidence[name] !== s)) return;
      pa[name] = s;
      go(i + 1, w * p[j]);
    });
  };
  go(0, 1);
  const z = out.reduce((a, b) => a + b, 0);
  return out.map((x) => x / z);
}

/**
 * P(grade >= t | e, a) for each target t, and E[stress next | e, a]. Same contract as
 * bsp_eval.network.answer: evidence maps node names to states; PersonalOffset defaults to 0.
 */
export function infer(
  cpts: unknown,
  course: string,
  evidence: Record<string, string | number>,
  action: string,
  targets: number[] = TARGETS,
): Answer {
  const c = cpts as Tables;
  const nodes = buildNodes(c);
  const ev: Record<string, State> = { PersonalOffset: "0" };
  for (const [k, v] of Object.entries(evidence)) ev[k] = String(v);
  ev.Action = action;
  const finalStanding = posterior(nodes, "FinalStanding", ev);
  const gm = gradeMapFor(c, course).table;
  const p_grade: Record<number, number> = {};
  for (const t of targets) p_grade[t] = finalStanding.reduce((a, p, i) => a + p * gm[String(t)][i], 0);
  return { p_grade, e_stress_next: expectedStress(nodes, ev) };
}

const expectedStress = (nodes: Record<string, Node>, ev: Record<string, State>) =>
  posterior(nodes, "StressNext", ev).reduce((a, p, i) => a + STRESS_SCORE[LEVELS[i]] * p, 0);

/** E[stress next | evidence] alone (Low 0, Med 0.5, High 1). Stress sits on its own branch, so no grade evidence is needed. */
export const stressNext = (cpts: Tables, evidence: Record<string, string>): number =>
  expectedStress(buildNodes(cpts), evidence);
