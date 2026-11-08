// NHEI Adaptive Intelligence: a privacy-first, explainable extension of the
// existing Recovery Routing Engine. This is not a second recommendation engine.
// It only adjusts preferences on candidates; selectRoute still enforces safety,
// user capacity, explicit requests, cooldowns and recommendation budget.
import type { InterventionCandidate, PreferenceMatch } from './recovery-routing-engine';
import type { BandwidthBand } from './recovery-capacity-gate';

export type AdaptiveFeedback = 'better' | 'same' | 'not_really' | 'not_sure';
export interface AdaptiveOutcome {
  sourceModule: string;
  feedback: AdaptiveFeedback;
  bandwidthBand?: BandwidthBand;
}
export interface AdaptiveContext {
  // Learning is opt-in. Missing consent must never activate personal adaptation.
  learningEnabled: boolean;
  // Only user's own recorded feedback, never employer-facing data.
  outcomes: readonly AdaptiveOutcome[];
  // Outcomes from a different energy/capacity context are not interchangeable.
  currentBandwidthBand?: BandwidthBand;
  // A person's explicit preference always wins over inferred patterns.
  preferredModules?: readonly string[];
  avoidedModules?: readonly string[];
}

export interface AdaptiveExplanation {
  candidateId: string;
  basis: 'explicit_preference' | 'confirmed_outcomes';
  preference: PreferenceMatch;
  samples: number;
}

// Minimum evidence before adapting a preference from outcomes. This does not
// claim clinical effectiveness and deliberately avoids interpreting symptoms.
export const MIN_ADAPTIVE_OUTCOMES = 3;
export const MAX_RECENT_ADAPTIVE_OUTCOMES = 5;

export function adaptInterventionCandidates(
  candidates: readonly InterventionCandidate[],
  context: AdaptiveContext | null | undefined,
): { candidates: InterventionCandidate[]; explanations: AdaptiveExplanation[] } {
  if (!context?.learningEnabled) return { candidates: [...candidates], explanations: [] };
  const explanations: AdaptiveExplanation[] = [];
  const preferred = new Set(context.preferredModules ?? []);
  const avoided = new Set(context.avoidedModules ?? []);
  const candidatesOut = candidates.map(candidate => {
    // Do not override a direct request, an existing manually supplied
    // preference, or any safety/eligibility field from the caller.
    if (candidate.explicitUserRequest || (candidate.userPreferenceMatch && candidate.userPreferenceMatch !== 'neutral')) {
      return { ...candidate };
    }
    let preference: PreferenceMatch = 'neutral';
    let basis: AdaptiveExplanation['basis'] | null = null;
    let samples = 0;
    if (avoided.has(candidate.sourceModule)) {
      preference = 'avoided';
      basis = 'explicit_preference';
    } else if (preferred.has(candidate.sourceModule)) {
      preference = 'preferred';
      basis = 'explicit_preference';
    } else {
      const recent = context.outcomes
        .filter(outcome => outcome.sourceModule === candidate.sourceModule &&
          outcome.feedback !== 'not_sure' &&
          (!context.currentBandwidthBand || outcome.bandwidthBand === context.currentBandwidthBand))
        .slice(-MAX_RECENT_ADAPTIVE_OUTCOMES);
      samples = recent.length;
      if (samples >= MIN_ADAPTIVE_OUTCOMES) {
        const better = recent.filter(outcome => outcome.feedback === 'better').length;
        const notReally = recent.filter(outcome => outcome.feedback === 'not_really').length;
        if (better >= MIN_ADAPTIVE_OUTCOMES && notReally === 0) {
          preference = 'preferred';
          basis = 'confirmed_outcomes';
        } else if (notReally >= MIN_ADAPTIVE_OUTCOMES && better === 0) {
          preference = 'avoided';
          basis = 'confirmed_outcomes';
        }
      }
    }
    if (basis) explanations.push({ candidateId: candidate.candidateId, basis, preference, samples });
    return { ...candidate, userPreferenceMatch: preference };
  });
  return { candidates: candidatesOut, explanations };
}
