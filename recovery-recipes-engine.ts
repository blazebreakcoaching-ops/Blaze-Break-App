// Recovery Recipes' orchestration engine (Batch 1 - Foundation, section 28).
// Deterministic by design, same reasoning as movement-snacks-recommendation.ts
// and grounding-adaptive.ts: the core "what should this recipe contain"
// decision must work with zero AI cost and zero network dependency (section
// 29's "basic Recovery Recipes must work without AI"). Nova (Batch 7) may
// improve wording, relevance and sequencing on top of this, but a valid
// recipe always comes back even if Nova/the AI route is completely
// unavailable - callers use getRecipeFallback() for that case.
//
// This file only assembles and adapts recipes - it never touches Firestore
// or the network, so it's trivially unit-testable in isolation (section
// 28's explicit requirement). Firestore-backed operations (recording an
// outcome, loading saved recipes) live in src/lib/recovery-recipes-service.ts,
// mirroring Movement Snacks' recommendation/service split.

import {
  SituationKey, Capacity, CAPACITY_ORDER, RecipeStep, RecipeStepType, RECIPE_TEMPLATES,
  DurationCategory, estimateDurationMinutes, categoriseDuration,
} from './recovery-recipes-content';
import { MovementUsageEntry, getMovementRecommendation } from './movement-snacks-recommendation';

export interface RecoveryRecipeContext {
  situationKey: SituationKey;
  // Defaults to 'some_space' (the "standard" sequence) when omitted - the
  // capacity check is optional (section 3), so a recipe must still be
  // buildable without one.
  capacity?: Capacity;
  // An optional hard ceiling (section 21) - if the assembled recipe runs
  // longer, optional content is trimmed first; the core minimum-useful
  // sequence is never cut to fit a time budget.
  timeAvailableMinutes?: number;
  // Used only to steer a movement step away from something the person
  // recently marked "more uncomfortable" (section 4's "recently overused
  // interventions" consideration) - reuses Movement Snacks' own
  // recommendation engine rather than reimplementing cooldown logic.
  movementUsage?: MovementUsageEntry[];
  // Batch 6 personalisation (section 17's "preferred recipe length") -
  // only used to pick a default capacity when the person hasn't chosen one
  // this session; an explicit capacity always wins. Never overrides the
  // minimum-useful-recipe floor, just which floor applies by default.
  preferredDurationCategory?: DurationCategory;
  // Batch 6 personalisation (section 17's "which interventions help most")
  // - most-helpful-first order for step TYPES, derived from history. Used
  // only to reorder optionalSteps so "One more step" offers the type the
  // person has found useful before, never to exclude anything or to
  // change which steps exist.
  helpfulStepTypes?: RecipeStepType[];
}

const DURATION_TO_DEFAULT_CAPACITY: Record<DurationCategory, Capacity> = {
  quick: 'almost_nothing', short: 'a_little', standard: 'some_space', deep: 'can_go_deeper',
};


export interface BuiltRecoveryRecipe {
  recipeTitle: string;
  reason: string;
  estimatedDurationMinutes: number;
  durationCategory: DurationCategory;
  steps: RecipeStep[];
  // Steps that exist for this situation but weren't included at the
  // current capacity - surfaced so the UI can offer "add one more step"
  // (section 20's adapt-on-repeat, section 9's "Choose another").
  optionalSteps: RecipeStep[];
  closingAction: string;
  fallbackRecipeId: SituationKey | null;
  // The situation actually requested, even if it didn't resolve to its own
  // template (an unrecognised key always falls back to just_need_reset).
  sourceContext: SituationKey;
  templateId: string;
}

const resolveMovementStep = (step: RecipeStep, movementUsage?: MovementUsageEntry[]): RecipeStep => {
  if (step.type !== 'movement' || !step.movementId || !movementUsage?.length) return step;
  const usageEntry = movementUsage.find((u) => u.movementId === step.movementId);
  if (!usageEntry?.recentlyUncomfortable) return step;
  if (!step.movementContext) return step;
  const rec = getMovementRecommendation({ context: step.movementContext, usage: movementUsage });
  if (!rec || rec.movementId === step.movementId) return step;
  return { ...step, movementId: rec.movementId };
};

// Assembles steps for a given capacity: coreSteps alone at 'almost_nothing'
// (already capped to 1-2 steps as a content invariant - see
// recovery-recipes-content.test.ts), coreSteps + expandedSteps once there's
// "some space", and the template's deepStep added only at 'can_go_deeper'
// (section 3's "may include a brief reflective component").
const assembleForCapacity = (
  coreSteps: RecipeStep[], expandedSteps: RecipeStep[], deepStep: RecipeStep | undefined, capacity: Capacity
): { included: RecipeStep[]; leftOver: RecipeStep[] } => {
  if (capacity === 'almost_nothing') {
    return { included: coreSteps, leftOver: [...expandedSteps, ...(deepStep ? [deepStep] : [])] };
  }
  if (capacity === 'a_little') {
    return { included: coreSteps, leftOver: [...expandedSteps, ...(deepStep ? [deepStep] : [])] };
  }
  if (capacity === 'some_space') {
    return { included: [...coreSteps, ...expandedSteps], leftOver: deepStep ? [deepStep] : [] };
  }
  // can_go_deeper
  return { included: [...coreSteps, ...expandedSteps, ...(deepStep ? [deepStep] : [])], leftOver: [] };
};

// Trims optional (non-core) content to fit a requested time budget, never
// touching coreSteps - the minimum useful recipe is inviolable (section 6).
const trimToTimeBudget = (
  coreSteps: RecipeStep[], rest: RecipeStep[], timeAvailableMinutes: number
): { included: RecipeStep[]; leftOver: RecipeStep[] } => {
  const included = [...coreSteps];
  const leftOver: RecipeStep[] = [];
  let minutes = estimateDurationMinutes(included);
  for (const step of rest) {
    const withStep = estimateDurationMinutes([...included, step]);
    if (withStep <= timeAvailableMinutes) {
      included.push(step);
      minutes = withStep;
    } else {
      leftOver.push(step);
    }
  }
  return { included, leftOver };
};

export const buildRecoveryRecipe = (context: RecoveryRecipeContext): BuiltRecoveryRecipe => {
  // An unrecognised or unset situation (e.g. "Something else" with free
  // text the deterministic engine can't classify) always resolves safely
  // to the universal fallback rather than throwing or returning nothing.
  const template = RECIPE_TEMPLATES[context.situationKey] ?? RECIPE_TEMPLATES.just_need_reset;
  const capacity = context.capacity
    ?? (context.preferredDurationCategory ? DURATION_TO_DEFAULT_CAPACITY[context.preferredDurationCategory] : 'some_space');

  const { included: byCapacity, leftOver: leftOverByCapacity } = assembleForCapacity(
    template.coreSteps, template.expandedSteps, template.deepStep, capacity
  );

  let included = byCapacity;
  let optionalSteps = leftOverByCapacity;
  if (typeof context.timeAvailableMinutes === 'number') {
    const coreCount = template.coreSteps.length;
    const trimmed = trimToTimeBudget(byCapacity.slice(0, coreCount), byCapacity.slice(coreCount), context.timeAvailableMinutes);
    included = trimmed.included;
    optionalSteps = [...trimmed.leftOver, ...leftOverByCapacity];
  }

  if (context.helpfulStepTypes?.length) {
    const rank = new Map(context.helpfulStepTypes.map((t, i) => [t, i]));
    // Stable sort - only reorders by how helpful the step's TYPE has been,
    // never drops or adds anything; ties (including types with no signal
    // yet) keep their original relative order.
    optionalSteps = [...optionalSteps].sort((a, b) => (rank.get(a.type) ?? Infinity) - (rank.get(b.type) ?? Infinity));
  }

  const resolvedSteps = included.map((s) => resolveMovementStep(s, context.movementUsage));
  const estimatedDurationMinutes = estimateDurationMinutes(resolvedSteps);

  return {
    recipeTitle: template.title,
    reason: template.reason,
    estimatedDurationMinutes,
    durationCategory: categoriseDuration(estimatedDurationMinutes),
    steps: resolvedSteps,
    optionalSteps,
    closingAction: template.closingAction,
    fallbackRecipeId: template.fallbackTemplateId ?? null,
    sourceContext: context.situationKey,
    templateId: template.id,
  };
};

// The valid, always-available recipe shown when Nova/the AI route fails
// (section 29/30) - the universal fallback template, built with whatever
// capacity/time context is already known.
export const getRecipeFallback = (context?: Partial<RecoveryRecipeContext>): BuiltRecoveryRecipe =>
  buildRecoveryRecipe({
    situationKey: 'just_need_reset',
    capacity: context?.capacity,
    timeAvailableMinutes: context?.timeAvailableMinutes,
    movementUsage: context?.movementUsage,
  });

// Section 11's mid-recipe adaptation - always re-runs the same deterministic
// builder with new, explicit inputs, so the result stays traceable ("Keep
// adaptation understandable. Do not make it feel random").
export type RecipeAdaptationSignal =
  | { type: 'reveal_situation'; situationKey: SituationKey }
  | { type: 'lower_capacity' }
  | { type: 'shorten' };

export const adaptRecoveryRecipe = (
  context: RecoveryRecipeContext, signal: RecipeAdaptationSignal
): BuiltRecoveryRecipe => {
  if (signal.type === 'reveal_situation') {
    return buildRecoveryRecipe({ ...context, situationKey: signal.situationKey });
  }
  if (signal.type === 'lower_capacity') {
    const idx = CAPACITY_ORDER.indexOf(context.capacity ?? 'some_space');
    return buildRecoveryRecipe({ ...context, capacity: CAPACITY_ORDER[Math.max(0, idx - 1)] });
  }
  // 'shorten' - section 9's "Make it shorter" button drops straight to the
  // tightest capacity regardless of what was selected.
  return buildRecoveryRecipe({ ...context, capacity: 'almost_nothing' });
};

export interface SuggestedRecipeContext {
  hourLocal?: number;
  capacity?: Capacity;
  timeAvailableMinutes?: number;
  movementUsage?: MovementUsageEntry[];
}

// A default suggestion for when the person hasn't picked a situation yet
// (section 22/23's smart-entry surfaces) - deterministic time-of-day-only
// heuristic today, mirroring Movement Snacks' getTimeOfDayCategory. Nova's
// pattern-aware suggestion (Batch 7) layers on top of this contract rather
// than replacing it, so a suggestion always exists even without AI.
export const getSuggestedRecipe = (context: SuggestedRecipeContext): BuiltRecoveryRecipe => {
  let situationKey: SituationKey = 'just_need_reset';
  if (typeof context.hourLocal === 'number' && context.hourLocal >= 17 && context.hourLocal < 23) {
    situationKey = 'need_switch_off';
  }
  return buildRecoveryRecipe({
    situationKey, capacity: context.capacity, timeAvailableMinutes: context.timeAvailableMinutes, movementUsage: context.movementUsage,
  });
};
