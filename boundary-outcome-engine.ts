// BOUNDARY AFTERCARE + OUTCOME + PERSONAL EVIDENCE BASE - pure logic for
// what happens after a real boundary action. The difficult part isn't
// over when the message sends: this module never auto-reassures the
// user that a boundary was correct, never encourages repeated checking,
// and never scores an outcome - it only ever reflects the user's own
// confirmed answers back to them.

// ---- Aftercare --------------------------------------------------------------
// Offered once, right after a real action - never auto-reassuring.

export const AFTERCARE_LINE = "You've said it. Don't negotiate against yourself before they've even replied.";

export type AftercareResponse = 'im_okay' | 'second_guessing' | 'feel_guilty' | 'worried_about_response' | 'talk_to_nova';

export const AFTERCARE_RESPONSE_ORDER: AftercareResponse[] = [
  'im_okay', 'second_guessing', 'feel_guilty', 'worried_about_response', 'talk_to_nova',
];

export const AFTERCARE_RESPONSE_LABELS: Record<AftercareResponse, string> = {
  im_okay: "I'm okay",
  second_guessing: "I'm second-guessing it",
  feel_guilty: 'I feel guilty',
  worried_about_response: "I'm worried about the response",
  talk_to_nova: 'Talk to Nova',
};

// ---- Waiting for a response ---------------------------------------------------
// Never encourages repeated checking.

export const WAITING_FOR_RESPONSE_LINE = "No response yet doesn't mean the boundary went badly.";

export type WaitingChoice = 'wait' | 'review_what_i_sent' | 'talk_to_nova';

export const WAITING_CHOICE_ORDER: WaitingChoice[] = ['wait', 'review_what_i_sent', 'talk_to_nova'];

export const WAITING_CHOICE_LABELS: Record<WaitingChoice, string> = {
  wait: 'Wait',
  review_what_i_sent: 'Review what I sent',
  talk_to_nova: 'Talk to Nova',
};

// ---- Boundary Outcome -----------------------------------------------------------
// Closes the learning loop - asked later, never immediately, never scored.

export const BOUNDARY_OUTCOME_QUESTION = 'How did it go?';

export type BoundaryOutcome =
  | 'respected_it' | 'negotiated' | 'pushed_back' | 'i_softened_it'
  | 'i_backed_down' | 'i_changed_my_mind' | 'no_response' | 'something_else';

export const BOUNDARY_OUTCOME_ORDER: BoundaryOutcome[] = [
  'respected_it', 'negotiated', 'pushed_back', 'i_softened_it',
  'i_backed_down', 'i_changed_my_mind', 'no_response', 'something_else',
];

export const BOUNDARY_OUTCOME_LABELS: Record<BoundaryOutcome, string> = {
  respected_it: 'They respected it',
  negotiated: 'They negotiated',
  pushed_back: 'They pushed back',
  i_softened_it: 'I softened it',
  i_backed_down: 'I backed down',
  i_changed_my_mind: 'I changed my mind',
  no_response: 'No response',
  something_else: 'Something else',
};

// Whether an outcome represents the boundary genuinely holding - used
// only to decide what counts as real evidence for the Personal Evidence
// Base below, never shown to the user as a pass/fail grade.
export const outcomeHeldTheBoundary = (outcome: BoundaryOutcome): boolean =>
  outcome === 'respected_it' || outcome === 'negotiated';

// A real, confirmed demand reduction - the only outcomes that justify a
// genuine Capacity Protected update. Never awarded for softening,
// backing down, or changing one's mind.
export const outcomeReflectsRealReduction = (outcome: BoundaryOutcome): boolean =>
  outcome === 'respected_it' || outcome === 'negotiated';

// ---- Personal Evidence Base -------------------------------------------------
// Compares a real FEARED outcome (captured before the action) against
// the real outcome that actually happened - built only from the user's
// own confirmed history, never manufactured or generalised beyond it.

export type FearedOutcome = 'expect_pushback' | 'expect_accepted' | 'not_sure';

export const FEARED_OUTCOME_ORDER: FearedOutcome[] = ['expect_pushback', 'expect_accepted', 'not_sure'];

export const FEARED_OUTCOME_LABELS: Record<FearedOutcome, string> = {
  expect_pushback: 'I expect pushback',
  expect_accepted: "I expect it'll be accepted",
  not_sure: "I'm not sure what to expect",
};

export const WHAT_DO_YOU_EXPECT_QUESTION = 'What do you expect will happen?';

export interface EvidencePair {
  feared: FearedOutcome;
  outcome: BoundaryOutcome;
}

export const MIN_PAIRS_FOR_EVIDENCE_BASE = 3;

export interface EvidenceBaseResult {
  available: boolean;
  fearedPushbackCount: number;
  actuallyHeldCount: number;
  line: string | null;
}

// "You worried about declining three recent late meetings. All three were
// accepted without conflict." - only speaks up with a real minimum sample
// of genuine feared-pushback vs. actual-acceptance mismatches.
export const buildEvidenceBaseResult = (pairs: EvidencePair[]): EvidenceBaseResult => {
  const fearedPushback = pairs.filter((p) => p.feared === 'expect_pushback');
  if (fearedPushback.length < MIN_PAIRS_FOR_EVIDENCE_BASE) {
    return { available: false, fearedPushbackCount: fearedPushback.length, actuallyHeldCount: 0, line: null };
  }
  const actuallyHeld = fearedPushback.filter((p) => outcomeHeldTheBoundary(p.outcome));
  if (actuallyHeld.length < fearedPushback.length) {
    // A genuine mix of real pushback and real acceptance is still
    // meaningful information, but the confident "all were accepted"
    // framing is reserved for when the mismatch is consistent.
    return { available: false, fearedPushbackCount: fearedPushback.length, actuallyHeldCount: actuallyHeld.length, line: null };
  }
  return {
    available: true,
    fearedPushbackCount: fearedPushback.length,
    actuallyHeldCount: actuallyHeld.length,
    line: `You expected pushback on ${fearedPushback.length} recent boundaries. All ${fearedPushback.length} were accepted without conflict.`,
  };
};

export const EVIDENCE_BASE_FOLLOWUP_QUESTION = 'Does seeing that change how risky saying no feels?';

export type EvidenceBaseFollowupAnswer = 'yes' | 'a_little' | 'not_really' | 'want_to_explore';

export const EVIDENCE_BASE_FOLLOWUP_ORDER: EvidenceBaseFollowupAnswer[] = ['yes', 'a_little', 'not_really', 'want_to_explore'];

export const EVIDENCE_BASE_FOLLOWUP_LABELS: Record<EvidenceBaseFollowupAnswer, string> = {
  yes: 'Yes',
  a_little: 'A little',
  not_really: 'Not really',
  want_to_explore: 'I want to explore it',
};

// ---- Boundary Memory Graph -----------------------------------------------------
// Behavioural PATTERNS around situations, never labels on people. These
// dimensions describe the request, not the requester's character.

export type RequestSourceType = 'manager' | 'colleague' | 'client' | 'family' | 'friend' | 'other';

export const REQUEST_SOURCE_ORDER: RequestSourceType[] = ['manager', 'colleague', 'client', 'family', 'friend', 'other'];

export const REQUEST_SOURCE_LABELS: Record<RequestSourceType, string> = {
  manager: 'Manager', colleague: 'Colleague', client: 'Client', family: 'Family', friend: 'Friend', other: 'Other',
};

export interface BoundaryMemoryEntry {
  source: RequestSourceType;
  outcome: BoundaryOutcome;
}

const MIN_ENTRIES_FOR_SOURCE_PATTERN = 3;
// A real majority, not a bare plurality - avoids over-reading a 2-of-5 split.
const SOURCE_PATTERN_DOMINANCE_RATIO = 0.6;

// A real, aggregate behavioural observation about ONE request source -
// e.g. "Manager requests are usually accepted once a trade-off is named."
// Never a trait judgement about a specific manager.
export const detectSourcePattern = (entries: BoundaryMemoryEntry[], source: RequestSourceType): string | null => {
  const matching = entries.filter((e) => e.source === source);
  if (matching.length < MIN_ENTRIES_FOR_SOURCE_PATTERN) return null;
  const held = matching.filter((e) => outcomeHeldTheBoundary(e.outcome)).length;
  if (held / matching.length >= SOURCE_PATTERN_DOMINANCE_RATIO) {
    return `${REQUEST_SOURCE_LABELS[source]} requests have generally been accepted once a boundary was named.`;
  }
  const pushedBack = matching.filter((e) => e.outcome === 'pushed_back' || e.outcome === 'i_backed_down').length;
  if (pushedBack / matching.length >= SOURCE_PATTERN_DOMINANCE_RATIO) {
    return `${REQUEST_SOURCE_LABELS[source]} requests have often involved real pushback.`;
  }
  return null;
};

// Explicit denylist - never store a character/personality label even if
// a user-authored note happens to contain one; this only guards the
// BUILT-IN observation strings above, not free user text elsewhere.
export const MEMORY_GRAPH_BANNED_LABELS: string[] = ['toxic', 'narcissist', 'manipulative', 'unsafe manager', 'abusive'];

export const containsMemoryGraphBannedLabel = (text: string): boolean => {
  const lower = text.toLowerCase();
  return MEMORY_GRAPH_BANNED_LABELS.some((p) => lower.includes(p));
};
