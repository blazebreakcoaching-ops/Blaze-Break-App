import { secureApiFetch } from './secure-api';
import { SituationKey, Capacity, RecipeStepType } from '../../recovery-recipes-content';
import { RecipeEnhancement } from '../../recovery-recipes-engine';

// Batch 7's Nova intelligence (Recovery Recipes upgrade, section 30) - the
// only client entry point into the new /api/recovery-recipes/enhance
// route. Deliberately sends labels only (situationKey/capacity/step-type
// enums), never raw free text, matching the server route's own contract.
//
// "AI must remain optional" (sections 29/38) is enforced here, not just
// described: this returns null on ANY failure - network error, a non-ok
// response, an unexpected shape - so every caller can fall back to the
// deterministic recipe it already has without special-casing anything.
// There is deliberately no retry and no thrown error; a missed
// enhancement is invisible to the user, not a broken experience.
export interface RecipeEnhancementRequest {
  situationKey: SituationKey;
  capacity?: Capacity;
  optionalStepTypes?: RecipeStepType[];
  hasReflectionStep?: boolean;
}

const RECIPE_STEP_TYPES: RecipeStepType[] = ['movement', 'nova_reflection', 'grounding', 'practical_action', 'release', 'connection', 'rest'];

const isRecipeStepType = (value: unknown): value is RecipeStepType =>
  typeof value === 'string' && RECIPE_STEP_TYPES.includes(value as RecipeStepType);

// Re-validates the response shape again on the client, even though the
// server already validated it - the same "never trust, re-check" posture
// movement-snacks-service.ts and recovery-recipes-service.ts already take
// on every Firestore read, just applied to a network response instead.
const parseEnhancement = (data: any): RecipeEnhancement | null => {
  if (!data || typeof data.reason !== 'string' || !data.reason.trim()) return null;
  const enhancement: RecipeEnhancement = { reason: data.reason };
  if (typeof data.reflectionQuestion === 'string' && data.reflectionQuestion.trim()) {
    enhancement.reflectionQuestion = data.reflectionQuestion;
  }
  if (Array.isArray(data.preferredStepOrder)) {
    const order = data.preferredStepOrder.filter(isRecipeStepType);
    if (order.length > 0) enhancement.preferredStepOrder = order;
  }
  return enhancement;
};

export const getRecipeEnhancement = async (request: RecipeEnhancementRequest): Promise<RecipeEnhancement | null> => {
  try {
    const res = await secureApiFetch('/api/recovery-recipes/enhance', { method: 'POST', data: request });
    const data = await res.json();
    return parseEnhancement(data);
  } catch (e) {
    // Network error, rate limit, quota reached, Gemini unavailable - all
    // treated identically, since none of them should ever be surfaced as
    // an error for a feature that already works without this call.
    return null;
  }
};
