// Validated, idempotent transitions for the existing recovery outcome loop.
// Avoid double-counting help ratings when network retries or users correct answers.
export type OutcomeAction = 'started' | 'declined' | 'completed' | 'abandoned';
export type Helpfulness = 'better' | 'same' | 'not_really' | 'not_sure';
export interface ExistingOutcome {
  startedAt?: string;
  outcome?: 'declined' | 'completed' | 'abandoned' | null;
  helpfulness?: Helpfulness | null;
  feedbackWithdrawnAt?: string | null;
}
export type TransitionResult =
  | { allowed: true; changed: boolean; counter: OutcomeAction | null; patch: Record<string, string | null> }
  | { allowed: false; changed: false; reason: string };
export function planOutcomeTransition(
  previous: ExistingOutcome, action: OutcomeAction, helpfulness: Helpfulness | null, now: string
): TransitionResult {
  // A forgotten rating must not be restored by a delayed client retry.
  if (action === 'completed' && previous.feedbackWithdrawnAt) {
    return { allowed: false, changed: false, reason: 'This rating was forgotten.' };
  }
  if (action === 'completed' && !helpfulness) {
    return { allowed: false, changed: false, reason: 'A helpfulness answer is required.' };
  }
  if (action === 'started') {
    if (previous.outcome) return { allowed: false, changed: false, reason: 'This recommendation is already closed.' };
    if (previous.startedAt) return { allowed: true, changed: false, counter: null, patch: {} };
    return { allowed: true, changed: true, counter: 'started', patch: { startedAt: now } };
  }
  if (previous.outcome) {
    if (action === 'completed' && previous.outcome === 'completed') {
      if (previous.helpfulness === helpfulness) return { allowed: true, changed: false, counter: null, patch: {} };
      return { allowed: true, changed: true, counter: null, patch: { helpfulness } };
    }
    return { allowed: false, changed: false, reason: 'This recommendation has already been closed.' };
  }
  if (action === 'completed') {
    return { allowed: true, changed: true, counter: 'completed', patch: { outcome: 'completed', helpfulness, outcomeAt: now } };
  }
  return { allowed: true, changed: true, counter: action, patch: { outcome: action, outcomeAt: now } };
}
