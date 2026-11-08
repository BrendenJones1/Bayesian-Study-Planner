import { LAMBDA_PRESETS, type LambdaPreset } from "../model/constants";
import { ACTIONS, type Action } from "../model/query";

/** EU(a) = 100·P(grade ≥ t | e, a) − λ·100·E[stress next | e, a] (design-v2, Decision). Stress is in [0, 1]. */
export const utility = (p: number, stress: number, lambda: number): number => 100 * p - lambda * 100 * stress;

/** The action with the highest EU under a preset; ties go to the earlier action in ACTIONS (the more study). */
export function bestAction(
  p: Record<Action, number>,
  stress: Record<Action, number>,
  preset: LambdaPreset,
): Action {
  const eu = (a: Action) => utility(p[a], stress[a], LAMBDA_PRESETS[preset]);
  return ACTIONS.reduce((best, a) => (eu(a) > eu(best) ? a : best));
}
