import type { CourseCache, Submission } from "../canvas/load";
import type { Cpts } from "../priors/cpts";

/** Design doc, Data model. Field names match the table there. */
export interface StudySession {
  session_id: string;
  course_id: number;
  module_id: number;
  started_at: string;
  ended_at: string;
  active_minutes: number;
}
export interface QuizItem {
  question_id: string;
  module_id: number;
  source_page: string;
  difficulty_tag: string;
  flagged: boolean;
}
export interface QuizAnswer {
  question_id: string;
  correct: boolean;
  answered_at: string;
}
export interface Moments {
  mean: number;
  variance: number;
}
export interface Posterior {
  course_id: number;
  /** θ, u, v per module (means, variances), keyed by module id. */
  modules: Record<string, { theta: Moments; u: Moments; v: Moments }>;
  updated_at: string;
}
export interface Availability {
  /** Singleton record. */
  id: "default";
  weekly_defaults: { day: number; minutes: number }[]; // day 0 = Sunday
  busy_blocks: { start: string; end: string; label: string }[];
  /** Study window, minutes after local midnight. Default 540 (9:00) to 1320 (22:00). */
  window_start?: number;
  window_end?: number;
  /** Daily maximum M in hours. Default 6; at least 5 so Intense stays possible. */
  max_hours?: number;
}
export interface FrozenPrediction {
  item_id: string;
  p_at_least_target: number;
  interval: [number, number];
  created_at: string;
}

/** A student's coverage for one exam; confirmed stays null until they confirm it. */
export interface CoverageOverride {
  item_id: string;
  module_ids: number[];
  confirmed: boolean | null;
}

/** Singleton: local date (YYYY-MM-DD) the timer was first used; its absence means "never used". */
export interface TimerMeta {
  id: "default";
  first_use: string;
}

/** Singleton: the student's λ preset (planner/utility.ts). */
export interface Settings {
  id: "default";
  lambda_preset: "grades" | "balanced" | "wellbeing";
}

export interface CptsCache {
  /** Singleton record. */
  id: "default";
  version: string;
  data: Cpts;
}

/** store name -> [key path, record type]. */
export interface Schema {
  cpts_cache: CptsCache;
  course_cache: CourseCache;
  submission_history: Submission;
  study_session: StudySession;
  quiz_item: QuizItem;
  quiz_answer: QuizAnswer;
  posterior: Posterior;
  availability: Availability;
  frozen_prediction: FrozenPrediction;
  coverage_override: CoverageOverride;
  timer_meta: TimerMeta;
  settings: Settings;
}
export type StoreName = keyof Schema;

const KEY_PATHS: { [K in StoreName]: string } = {
  course_cache: "canvas_course_id",
  submission_history: "item_id",
  study_session: "session_id",
  quiz_item: "question_id",
  quiz_answer: "question_id",
  posterior: "course_id",
  availability: "id",
  frozen_prediction: "item_id",
  cpts_cache: "id",
  coverage_override: "item_id",
  timer_meta: "id",
  settings: "id",
};

/**
 * Migrations[i] upgrades schema version i to i + 1, so the current version is
 * migrations.length. To change the schema, append a function; never edit old ones.
 */
export const MIGRATIONS: ((db: IDBDatabase, tx: IDBTransaction) => void)[] = [
  (db) => {
    for (const [name, keyPath] of Object.entries(KEY_PATHS)) db.createObjectStore(name, { keyPath });
  },
  // Submissions gain Canvas late/missing/seconds_late; shortcut: old rows get false/false/0 until the next Canvas load rewrites them.
  (_db, tx) => {
    const req = tx.objectStore("submission_history").openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      c.update({ late: false, missing: false, seconds_late: 0, ...c.value });
      c.continue();
    };
  },
  // Migration 0 creates every KEY_PATHS store, so a fresh install already has cpts_cache; only upgrades need it.
  (db) => {
    if (!db.objectStoreNames.contains("cpts_cache")) db.createObjectStore("cpts_cache", { keyPath: "id" });
  },
  (db) => {
    if (!db.objectStoreNames.contains("coverage_override")) db.createObjectStore("coverage_override", { keyPath: "item_id" });
  },
  (db) => {
    if (!db.objectStoreNames.contains("timer_meta")) db.createObjectStore("timer_meta", { keyPath: "id" });
  },
  (db) => {
    if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "id" });
  },
];
export const SCHEMA_VERSION = MIGRATIONS.length;

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function openDb(
  name = "study-planner",
  migrations: typeof MIGRATIONS = MIGRATIONS,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, migrations.length);
    req.onupgradeneeded = (e) => {
      const tx = req.transaction as IDBTransaction;
      for (let v = e.oldVersion; v < migrations.length; v++) migrations[v](req.result, tx);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Typed access to one object store. */
export function store<N extends StoreName>(db: IDBDatabase, name: N) {
  const os = (mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);
  return {
    put: (rec: Schema[N]) => wrap(os("readwrite").put(rec)).then(() => undefined),
    get: (key: IDBValidKey) => wrap(os("readonly").get(key)) as Promise<Schema[N] | undefined>,
    getAll: () => wrap(os("readonly").getAll()) as Promise<Schema[N][]>,
    delete: (key: IDBValidKey) => wrap(os("readwrite").delete(key)),
  };
}

/** One typed wrapper per store in the data model. */
export const stores = (db: IDBDatabase) => ({
  course_cache: store(db, "course_cache"),
  submission_history: store(db, "submission_history"),
  study_session: store(db, "study_session"),
  quiz_item: store(db, "quiz_item"),
  quiz_answer: store(db, "quiz_answer"),
  posterior: store(db, "posterior"),
  availability: store(db, "availability"),
  frozen_prediction: store(db, "frozen_prediction"),
  cpts_cache: store(db, "cpts_cache"),
  coverage_override: store(db, "coverage_override"),
  timer_meta: store(db, "timer_meta"),
  settings: store(db, "settings"),
});
