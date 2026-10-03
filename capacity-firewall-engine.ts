// CAPACITY FIREWALL - pure, deterministic logic for the entry point of the
// boundary/workload-protection loop: "nothing gets access to your capacity
// without becoming visible first." This module only ever computes from
// REAL inputs (an actual capacity check-in score, actual stressor-derived
// planned load) - it never fabricates a number where the user hasn't
// provided enough information, and it never predicts emotional or
// physiological outcomes. Scenario lines are plain-language comparisons of
// Blaze Break's existing workload model, not forecasts.

// ---- Incoming demand ------------------------------------------------------

export interface IncomingDemand {
  description: string; // "What are they asking?"
  estimatedMinutes: number | null; // optional - the user may not know yet
  isToday: boolean;
}

// ---- Quick Pause -----------------------------------------------------------
// The fastest version - a few seconds, no forced negotiation workflow if
// the user already knows the answer.

export type QuickPauseFit = 'yes' | 'not_comfortably' | 'no' | 'need_more_info';

export const QUICK_PAUSE_FIT_ORDER: QuickPauseFit[] = ['yes', 'not_comfortably', 'no', 'need_more_info'];

export const QUICK_PAUSE_FIT_LABELS: Record<QuickPauseFit, string> = {
  yes: 'Yes', not_comfortably: 'Not comfortably', no: 'No', need_more_info: 'I need more information',
};

export const QUICK_PAUSE_PROMPT = 'Before you answer - can today actually afford this?';
export const QUICK_PAUSE_WHAT_QUESTION = 'What are they asking?';
export const QUICK_PAUSE_FIT_QUESTION = 'Does this fit?';

// Only "not comfortably" and "need more information" warrant the fuller
// Capacity Gate - a confident yes/no doesn't need a forced detour.
export const needsCapacityGate = (fit: QuickPauseFit): boolean => fit === 'not_comfortably' || fit === 'need_more_info';

// ---- Capacity Gate ----------------------------------------------------------
// Scenario calculations based on Blaze Break's existing workload model
// (capacity score vs. stressor-derived planned load, both 0-100) - never a
// prediction of emotional or physiological outcome, never a fabricated
// value for a day that hasn't actually been checked.

export const CAPACITY_NOT_CHECKED_LABEL = 'Capacity not checked today';

export type BufferTightness = 'comfortable' | 'tight' | 'very_tight' | 'over_capacity' | 'unknown';

export const describeBufferAfterAccepting = (capacityScore: number, plannedLoad: number): BufferTightness => {
  const buffer = capacityScore - plannedLoad;
  if (buffer < 0) return 'over_capacity';
  if (buffer <= 5) return 'very_tight';
  if (buffer <= 15) return 'tight';
  return 'comfortable';
};

const ACCEPT_SCENARIO_LINES: Record<BufferTightness, string> = {
  comfortable: 'This still leaves a comfortable buffer.',
  tight: 'Your remaining buffer becomes tight.',
  very_tight: 'Your remaining buffer becomes very tight.',
  over_capacity: "This would push you over today's available capacity.",
  unknown: "We don't have enough information to say.",
};

export interface CapacityGateContext {
  capacityScore: number | null;
  plannedLoad: number | null;
}

export interface CapacityGateScenarios {
  accept: string;
  move: string;
  decline: string;
}

// "IF I MOVE IT" deliberately never names a specific day with more room -
// this app has no per-day forecast to back that claim, so it offers the
// honest next step (go check) rather than inventing one.
export const MOVE_IT_SCENARIO_LINE = 'Moving it means checking whether another day has more room before committing.';
export const DECLINE_SCENARIO_LINE = "Today's current plan stays protected.";

export const buildCapacityGateScenarios = (ctx: CapacityGateContext): CapacityGateScenarios => {
  if (ctx.capacityScore === null || ctx.plannedLoad === null) {
    return {
      accept: "We don't have today's capacity checked, so this would be a guess rather than a real comparison.",
      move: MOVE_IT_SCENARIO_LINE,
      decline: DECLINE_SCENARIO_LINE,
    };
  }
  const tightness = describeBufferAfterAccepting(ctx.capacityScore, ctx.plannedLoad);
  return { accept: ACCEPT_SCENARIO_LINES[tightness], move: MOVE_IT_SCENARIO_LINE, decline: DECLINE_SCENARIO_LINE };
};

// ---- Cost of Yes ------------------------------------------------------------
// Makes the trade-off visible without telling the user which area they
// must sacrifice - they decide.

export type SqueezeArea =
  | 'existing_work' | 'recovery' | 'family_home' | 'sleep' | 'something_for_myself'
  | 'another_commitment' | 'nothing_i_have_room' | 'not_sure';

export const SQUEEZE_AREA_ORDER: SqueezeArea[] = [
  'existing_work', 'recovery', 'family_home', 'sleep', 'something_for_myself',
  'another_commitment', 'nothing_i_have_room', 'not_sure',
];

export const SQUEEZE_AREA_LABELS: Record<SqueezeArea, string> = {
  existing_work: 'Existing work',
  recovery: 'Recovery',
  family_home: 'Family / home',
  sleep: 'Sleep',
  something_for_myself: 'Something for myself',
  another_commitment: 'Another commitment',
  nothing_i_have_room: 'Nothing - I genuinely have room',
  not_sure: "I'm not sure",
};

export const COST_OF_YES_QUESTION = 'If you say yes to this, what gets squeezed?';
export const COST_OF_YES_NOT_FREE_LINE = "This isn't a free yes. Something else will need to move.";

// "Nothing - I genuinely have room" is the one answer that means there's
// truly no trade-off to surface.
export const shouldShowCostOfYesFollowup = (squeezeAreas: SqueezeArea[]): boolean =>
  squeezeAreas.length > 0 && !squeezeAreas.includes('nothing_i_have_room');

// Exclusive, catch-all answers - selecting one doesn't make sense alongside
// a specific squeeze area, so the UI clears other selections when it's chosen.
export const EXCLUSIVE_SQUEEZE_AREAS: SqueezeArea[] = ['nothing_i_have_room', 'not_sure'];

// ---- Choice screen ----------------------------------------------------------

export type FirewallChoice = 'accept' | 'conditional_yes' | 'negotiate' | 'delegate' | 'defer' | 'decline' | 'need_more_info';

export const FIREWALL_CHOICE_ORDER: FirewallChoice[] = [
  'accept', 'conditional_yes', 'negotiate', 'delegate', 'defer', 'decline', 'need_more_info',
];

export const FIREWALL_CHOICE_LABELS: Record<FirewallChoice, string> = {
  accept: 'Accept',
  conditional_yes: 'Conditional Yes',
  negotiate: 'Negotiate',
  delegate: 'Delegate',
  defer: 'Defer',
  decline: 'Decline',
  need_more_info: 'Need More Information',
};

export const CHOICE_SCREEN_QUESTION = 'What do you want to do?';

// ---- Accept ------------------------------------------------------------------
// Intentional acceptance is never shamed or labelled a boundary failure.

export type AcceptRationale = 'making_exception' | 'fits_comfortably' | 'moving_something_else';

export const ACCEPT_RATIONALE_ORDER: AcceptRationale[] = ['making_exception', 'fits_comfortably', 'moving_something_else'];

export const ACCEPT_RATIONALE_LABELS: Record<AcceptRationale, string> = {
  making_exception: "I'm making an exception",
  fits_comfortably: 'This fits comfortably',
  moving_something_else: "I'll move something else",
};

export const ACCEPT_MAKE_ROOM_QUESTION = 'What are you moving to make room?';

export const shouldAskWhatMovingToMakeRoom = (tightness: BufferTightness): boolean =>
  tightness === 'tight' || tightness === 'very_tight' || tightness === 'over_capacity';

// ---- Conditional Yes -----------------------------------------------------------
// Boundary Architect must not teach "boundary = no" - this is deliberately
// as prominent as Decline. Deterministic templates here so the flow is
// complete without depending on an AI call; a richer Nova-assisted
// generator is a separate, additive layer (Boundary Compiler).

export type ConditionalYesLever = 'deadline' | 'scope' | 'duration' | 'ownership' | 'priority' | 'timing' | 'support' | 'custom';

export const CONDITIONAL_YES_LEVER_ORDER: ConditionalYesLever[] = [
  'deadline', 'scope', 'duration', 'ownership', 'priority', 'timing', 'support', 'custom',
];

export const CONDITIONAL_YES_LEVER_LABELS: Record<ConditionalYesLever, string> = {
  deadline: 'Deadline', scope: 'Scope', duration: 'Duration', ownership: 'Ownership',
  priority: 'Priority', timing: 'Timing', support: 'Support', custom: 'Custom',
};

export const CONDITIONAL_YES_QUESTION = 'What would need to change for this to work?';

export const CONDITIONAL_YES_TEMPLATES: Record<ConditionalYesLever, (detail: string) => string> = {
  deadline: (d) => `Yes, if the deadline moves${d ? ` to ${d}` : ''}.`,
  scope: (d) => `Yes, if the scope is reduced${d ? ` to ${d}` : ''}.`,
  duration: (d) => `Yes, but for ${d || 'a shorter time'} rather than the full ask.`,
  ownership: (d) => `Yes, if ${d || 'someone else'} owns part of it.`,
  priority: (d) => `Yes, if this becomes the priority over ${d || 'something else on my plate'}.`,
  timing: (d) => `Yes, ${d || 'just not today'}.`,
  support: (d) => `Yes, if I get support${d ? ` from ${d}` : ''}.`,
  custom: (d) => d || 'Yes, under different conditions.',
};

export const buildConditionalYesMessage = (lever: ConditionalYesLever, detail: string): string =>
  CONDITIONAL_YES_TEMPLATES[lever](detail.trim());

// ---- Delegate / Defer / Need More Information ----------------------------------

export const DELEGATE_QUESTION = "What part doesn't need to stay with you?";
export const DEFER_QUESTION = 'When would this realistically fit?';

export const CLARIFICATION_QUESTIONS: string[] = [
  'What is the actual deadline?',
  'What would success look like?',
  'Which existing priority should move?',
  'Who else is available?',
  'How much of this actually needs me?',
];

// ---- First-use introduction -----------------------------------------------------

export const CAPACITY_FIREWALL_INTRO_LINE = 'Before more gets added to your life, make the cost visible.';
export const CAPACITY_FIREWALL_INTRO_CTA = 'Check My Capacity';

// ---- Companion-voice / overclaiming guardrail -----------------------------------

export const CAPACITY_FIREWALL_BANNED_PHRASES: string[] = [
  'burnout risk', 'guaranteed', 'definitely burn you out', 'this will burn you out',
  'boundary streak', 'assertiveness score', 'success percentage', 'strong boundary badge',
  'you must say no', 'you have to decline', 'failed boundary',
];

export const containsCapacityFirewallBannedPhrase = (text: string): boolean => {
  const lower = text.toLowerCase();
  return CAPACITY_FIREWALL_BANNED_PHRASES.some((p) => lower.includes(p));
};
