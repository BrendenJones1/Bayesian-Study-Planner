/**
 * Freezes the baseline's exam-standing prediction once an item's due date has passed (design-v2, Personal
 * offset, step 1), so the offset residual later compares the actual decile with what the baseline said
 * beforehand. Evidence is built as of the due day, so only earlier data counts (no leakage).
 */
import type { Item } from "../canvas/load";
import type { FrozenPrediction, StudySession } from "../storage/db";
import { localDay, type CutPoints } from "./encode";
import { examStandingDist } from "./infer";
import { buildEvidence, type CourseData } from "./query";

/**
 * Stores the prediction for `item` unless one exists; a stored record is never overwritten. Returns the stored
 * record, or null while the item has no due date or is not yet past due.
 * shortcut: scores of earlier items count as dated by their due date; upgrade if Canvas grade-release times are kept.
 */
export async function freezePrediction(
  db: IDBDatabase,
  cpts: unknown,
  course: CourseData,
  item: Item,
  sessions: StudySession[],
  now: Date = new Date(),
): Promise<FrozenPrediction | null> {
  if (!item.due_at || Date.parse(item.due_at) > now.getTime()) return null;
  const cuts = (cpts as { cut_points: CutPoints }).cut_points;
  const deciles = examStandingDist(cpts, buildEvidence(course, item, sessions, localDay(item.due_at), cuts));
  const rec: FrozenPrediction = {
    item_id: item.item_id,
    deciles,
    most_likely: deciles.indexOf(Math.max(...deciles)) + 1,
    created_at: now.toISOString(),
  };
  const os = db.transaction("frozen_prediction", "readwrite").objectStore("frozen_prediction");
  return new Promise((resolve, reject) => {
    const add = os.add(rec); // add, not put: fails if the key exists
    add.onsuccess = () => resolve(rec);
    add.onerror = (e) => {
      e.preventDefault(); // keep the transaction alive
      if (add.error?.name !== "ConstraintError") return reject(add.error);
      const get = os.get(item.item_id);
      get.onsuccess = () => resolve(get.result as FrozenPrediction);
      get.onerror = () => reject(get.error);
    };
  });
}
