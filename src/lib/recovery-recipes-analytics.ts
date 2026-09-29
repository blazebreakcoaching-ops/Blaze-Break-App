import { secureApiFetch } from './secure-api';

// Fire-and-forget, privacy-preserving event logging for Recovery Recipes
// (section 36) - mirrors movement-analytics.ts exactly. Never throws into
// the caller. Event names and the optional situationKey/stepType are
// validated server-side against a fixed allowlist - there is no field here
// for raw emotional text, private Nova content, faith preference or
// journal content (section 36's explicit exclusion list).
export type RecipeEventType =
  | 'recipe_started' | 'recipe_completed' | 'recipe_abandoned' | 'recipe_step_skipped' | 'recipe_saved' | 'recipe_feedback';

export const logRecipeEvent = (
  eventType: RecipeEventType,
  extra?: { situationKey?: string; stepType?: string },
): void => {
  secureApiFetch('/api/recovery-recipes/analytics-event', {
    method: 'POST',
    data: { eventType, ...extra },
  }).catch(() => {
    // Non-fatal - analytics only.
  });
};
