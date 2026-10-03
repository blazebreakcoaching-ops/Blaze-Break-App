// Boundary Contract (My Default Boundaries): boundaries decided ahead of
// time, so a real crossing doesn't have to be renegotiated from scratch.
// A contract is never auto-enforced - every crossing is reviewed by the
// person themselves with Keep / Make Exception / Change, and a single
// exception never silently rewrites the default.

export type BoundaryContractCategory =
  | 'after_hours_messages'
  | 'weekend_work'
  | 'extra_meetings'
  | 'last_minute_requests'
  | 'scope_creep'
  | 'other';

export const BOUNDARY_CONTRACT_CATEGORY_ORDER: BoundaryContractCategory[] = [
  'after_hours_messages', 'weekend_work', 'extra_meetings', 'last_minute_requests', 'scope_creep', 'other',
];

export const BOUNDARY_CONTRACT_CATEGORY_LABELS: Record<BoundaryContractCategory, string> = {
  after_hours_messages: 'After-hours messages',
  weekend_work: 'Weekend work',
  extra_meetings: 'Extra meetings',
  last_minute_requests: 'Last-minute requests',
  scope_creep: 'Scope creep',
  other: 'Other',
};

export const BOUNDARY_CONTRACT_CATEGORY_PROMPTS: Record<BoundaryContractCategory, string> = {
  after_hours_messages: "What's your default response to messages after hours?",
  weekend_work: "What's your default response to weekend work requests?",
  extra_meetings: "What's your default response to another meeting being added?",
  last_minute_requests: "What's your default response to a last-minute request?",
  scope_creep: 'What’s your default response when a task quietly grows?',
  other: 'What boundary do you want a default response for?',
};

export type ContractReviewChoice = 'keep' | 'make_exception' | 'change';

export const CONTRACT_REVIEW_CHOICE_ORDER: ContractReviewChoice[] = ['keep', 'make_exception', 'change'];

export const CONTRACT_REVIEW_CHOICE_LABELS: Record<ContractReviewChoice, string> = {
  keep: 'Keep it',
  make_exception: 'Make an exception this time',
  change: 'Change the default',
};

export const CONTRACT_REVIEW_QUESTION = 'This boundary got tested. What now?';

export interface ContractReviewEntry {
  at: string;
  choice: ContractReviewChoice;
}

// A single "make an exception" never rewrites the default - only an
// explicit "change" (with real replacement text) does.
export const applyContractReview = (
  currentResponse: string,
  choice: ContractReviewChoice,
  newResponse?: string
): string => (choice === 'change' && newResponse && newResponse.trim() ? newResponse.trim() : currentResponse);

const EXCEPTION_PATTERN_MIN_REVIEWS = 3;
const EXCEPTION_DOMINANCE_RATIO = 0.6;

// Mirrors the Memory Graph's own discipline: don't suggest a contract isn't
// working until there's a real, consistent pattern of exceptions, not one
// bad week.
export const suggestsContractNeedsRevisiting = (history: ContractReviewEntry[]): boolean => {
  if (history.length < EXCEPTION_PATTERN_MIN_REVIEWS) return false;
  const exceptions = history.filter((h) => h.choice === 'make_exception').length;
  return exceptions / history.length >= EXCEPTION_DOMINANCE_RATIO;
};

export const NEEDS_REVISITING_LINE = "This default has needed an exception most times it's come up lately. Worth changing it?";
