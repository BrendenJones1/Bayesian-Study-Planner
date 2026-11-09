/** Hand-set (assumed) numbers, each with its sensitivity check (docs/design-v2.md, Assumptions and limitations). */

/** Item-weight cut as a fraction of the course grade: "<=15%" at or below, ">15%" above. */
export const ITEM_WEIGHT_CUT = 0.15;

/**
 * θ: deadline-equivalents added to tomorrow's Load per study hour (design-v2, Stress). Assumed, no data.
 * Sensitivity check: the θ sweep {0, 0.1, 0.2, 0.3} is run by the evaluation issue (G21), not here. A named setting, never fitted.
 */
export const THETA = 0.2;

/**
 * λ presets: weight on E[stress next] in EU(a) (design-v2, Decision). A preference, never fitted.
 * Sensitivity check: the report shows the chosen action across λ (evaluation issue); Balanced is the design's worked example.
 */
export const LAMBDA_PRESETS = { grades: 0.1, balanced: 0.4, wellbeing: 1.0 } as const;
export type LambdaPreset = keyof typeof LAMBDA_PRESETS;

/** Study hours per action (design-v2, Decision): Intense 5 h, Light 1 h, Rest 0. Assumed, not fitted. */
export const ACTION_HOURS = { Intense: 5, Light: 1, Rest: 0 } as const;
