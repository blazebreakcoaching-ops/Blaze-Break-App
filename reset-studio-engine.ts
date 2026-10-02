// Pure, deterministic logic behind Reset Studio - the "What's happening
// in your head?" entry point that routes the user to one focused tool
// instead of asking them to pick an intervention themselves (CORE
// RESET STUDIO MODEL, CORE PRODUCT PRINCIPLE). Everything here stays
// intentionally simple: few choices, no scoring, no gamification - this
// is for moments when normal thinking is temporarily difficult.

// ---- The six feeling states --------------------------------------------

export type ResetStudioState = 'looping' | 'fuming' | 'scattered' | 'flooded' | 'flat' | 'stuck';

export const RESET_STUDIO_STATE_ORDER: ResetStudioState[] = [
  'looping', 'fuming', 'scattered', 'flooded', 'flat', 'stuck',
];

export interface ResetStudioStateOption {
  id: ResetStudioState;
  label: string;
  description: string;
  toolName: string;
}

export const RESET_STUDIO_STATES: Record<ResetStudioState, ResetStudioStateOption> = {
  looping: { id: 'looping', label: 'Looping', description: 'I keep replaying something.', toolName: 'The Rumination Furnace' },
  fuming: { id: 'fuming', label: 'Fuming', description: "I'm angry or wound up.", toolName: 'The Pressure Valve' },
  scattered: { id: 'scattered', label: 'Scattered', description: "I can't hold onto one thought.", toolName: 'The Static Sweep' },
  flooded: { id: 'flooded', label: 'Flooded', description: 'Everything feels too much.', toolName: 'Make It Smaller' },
  flat: { id: 'flat', label: 'Flat', description: "I've got nothing left.", toolName: 'The Spark Check' },
  stuck: { id: 'stuck', label: 'Stuck', description: "I know something's wrong but I can't name it.", toolName: 'Untangle With Nova' },
};

// ---- Shared confirmation model ------------------------------------------
// Used by "Keep the Signal" (Rumination Furnace) and anywhere else Reset
// Studio offers Nova's read on something back to the user - an
// interpretation is never stored until the user confirms it themselves.

export type SignalConfirmation = 'yes' | 'partly' | 'no' | 'rewrite';

export const SIGNAL_CONFIRMATION_OPTIONS: { id: SignalConfirmation; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'partly', label: 'Partly' },
  { id: 'no', label: 'No' },
  { id: 'rewrite', label: 'Let me rewrite it' },
];

// Only "yes" treats Nova's phrasing as the keeper; "partly" and "rewrite"
// both hand control back to the user's own words, "no" discards it.
export const shouldKeepNovaPhrasing = (answer: SignalConfirmation): boolean => answer === 'yes';

// ---- Static Sweep: grouping ---------------------------------------------

export type SweepCategory = 'needs_now' | 'can_wait' | 'not_actionable' | 'noise';

export const SWEEP_CATEGORY_ORDER: SweepCategory[] = ['needs_now', 'can_wait', 'not_actionable', 'noise'];

export const SWEEP_CATEGORY_LABELS: Record<SweepCategory, string> = {
  needs_now: 'Needs attention now',
  can_wait: 'Can wait',
  not_actionable: 'Not actionable',
  noise: 'Just noise',
};

export interface SweepItem {
  id: string;
  text: string;
  category: SweepCategory | null;
}

// Cognitive unloading, not productivity optimisation - every new item
// starts unsorted; nothing here guesses a category from keywords, since
// a wrong guess would be worse than just asking the user to tap it once.
export const createSweepItem = (id: string, text: string): SweepItem => ({ id, text, category: null });

// ---- Flooded: Make It Smaller --------------------------------------------

export type SmallerAction = 'now' | 'later' | 'not_mine' | 'drop';

export const SMALLER_ACTION_ORDER: SmallerAction[] = ['now', 'later', 'not_mine', 'drop'];

export const SMALLER_ACTION_LABELS: Record<SmallerAction, string> = {
  now: 'Now',
  later: 'Later',
  not_mine: 'Not Mine',
  drop: 'Drop',
};

// "Now" items are the ones that stay real today - nothing is reduced
// about them. "Later"/"Not Mine"/"Drop" all genuinely come off today's
// load, mirroring One Less Thing's resolves/reduction-level reasoning
// exactly rather than inventing a second model (CONNECTION TO ENERGY DELTA).
export const SMALLER_ACTION_RESOLVES: Record<SmallerAction, boolean> = {
  now: false, later: false, not_mine: true, drop: true,
};

export const SMALLER_ACTION_REDUCES_TODAY: Record<SmallerAction, boolean> = {
  now: false, later: true, not_mine: true, drop: true,
};

// ---- Flat: Spark Check ----------------------------------------------------

export type SparkAnswer =
  | 'need_quiet' | 'need_break_from_people' | 'need_movement'
  | 'need_food_or_water' | 'need_sleep' | 'miss_interest' | 'dont_know';

export const SPARK_ANSWER_ORDER: SparkAnswer[] = [
  'need_quiet', 'need_break_from_people', 'need_movement',
  'need_food_or_water', 'need_sleep', 'miss_interest', 'dont_know',
];

export const SPARK_ANSWER_LABELS: Record<SparkAnswer, string> = {
  need_quiet: 'I need quiet',
  need_break_from_people: 'I need a break from people',
  need_movement: 'I need some movement',
  need_food_or_water: 'I probably need food or water',
  need_sleep: 'I need sleep',
  miss_interest: "I miss feeling interested in anything",
  dont_know: "I genuinely don't know",
};

// One very small action per answer - never a long improvement plan
// (FLAT — THE SPARK CHECK).
export const SPARK_SUGGESTIONS: Record<SparkAnswer, string> = {
  need_quiet: 'Sit somewhere quiet for five minutes.',
  need_break_from_people: 'Step away from people for a few minutes, even just to another room.',
  need_movement: 'Step outside briefly.',
  need_food_or_water: 'Get something to drink.',
  need_sleep: 'Make the next hour smaller - let something wait so you can rest sooner.',
  miss_interest: 'Talk to Nova.',
  dont_know: 'Talk to Nova.',
};

// FLAT: "If persistent low mood or other concerning context emerges,
// route appropriately through the existing support experience" - a
// simple repeat-pattern gate, never a mood score or diagnostic claim.
// Flags only once the same low-energy answer keeps recurring.
const CONCERNING_SPARK_ANSWERS: SparkAnswer[] = ['miss_interest', 'dont_know'];
export const MIN_SPARK_REPEATS_FOR_SUPPORT_OFFER = 3;

export const shouldOfferQuickSupportForSpark = (recentAnswers: SparkAnswer[]): boolean => {
  if (recentAnswers.length < MIN_SPARK_REPEATS_FOR_SUPPORT_OFFER) return false;
  const lastN = recentAnswers.slice(-MIN_SPARK_REPEATS_FOR_SUPPORT_OFFER);
  return lastN.every((a) => CONCERNING_SPARK_ANSWERS.includes(a));
};

// ---- Stuck: Untangle With Nova quick starters ----------------------------

export type UntangleStarter =
  | 'something_happened' | 'someone_getting_to_me' | 'worried_about_something'
  | 'tired_of_everything' | 'dont_know_what_feeling' | 'let_me_type';

export const UNTANGLE_STARTER_ORDER: UntangleStarter[] = [
  'something_happened', 'someone_getting_to_me', 'worried_about_something',
  'tired_of_everything', 'dont_know_what_feeling', 'let_me_type',
];

export const UNTANGLE_STARTER_LABELS: Record<UntangleStarter, string> = {
  something_happened: 'Something happened',
  someone_getting_to_me: 'Someone is getting to me',
  worried_about_something: "I'm worried about something",
  tired_of_everything: "I'm tired of everything",
  dont_know_what_feeling: "I don't know what I'm feeling",
  let_me_type: 'Let me type it',
};

// ---- Connection to Rediscovery -------------------------------------------
// Reset Studio's clues are written through rediscovery-service.ts's
// recordRediscoveryClue using the 'rumination_furnace' / 'pressure_valve' /
// 'make_it_smaller' RediscoveryClueSource values already defined in
// rediscovery-engine.ts - one clue model, not a second competing one.

// REDISCOVERY: a pattern is noticed only at a later, calmer point - never
// while the user is actively using a Reset Studio tool. A minimum sample
// before even hypothesising, same reasoning as every other pattern
// detector this app uses.
export const MIN_ENTRIES_FOR_RESET_STUDIO_PATTERN = 3;

export const hasEnoughForResetStudioPattern = (entryCount: number): boolean =>
  entryCount >= MIN_ENTRIES_FOR_RESET_STUDIO_PATTERN;
