// Pure, deterministic logic behind the breathing / guided reset
// experience: Need -> Nova recommendation -> guided practice -> response
// check -> adaptation -> next sensible step (CORE PRODUCT MODEL). Nothing
// here claims access to a signal the app doesn't actually have, never
// fabricates an effectiveness percentage, and never implies causation
// from a handful of sessions.

export type BreathingPracticeId = 'sigh' | 'extended' | 'coherent' | 'box' | '478' | 'rectangle' | 'calm';

// BREATHWORK LIBRARY: organised by what the user needs, not a flat
// technical list - each category's own supporting copy, written in
// experiential rather than clinical language (REMOVE OVERCLAIMS: no
// "offloads carbon dioxide", "aligns heart rate", "triggers
// parasympathetic response", "balances the nervous system").
export interface BreathingPractice {
  id: BreathingPracticeId;
  category: string;
  name: string;
  description: string;
  supportingCopy?: string;
  durationLabel: string;
  badge?: string;
}

export const BREATHING_LIBRARY: Record<BreathingPracticeId, BreathingPractice> = {
  sigh: {
    id: 'sigh', category: 'Quick Reset', name: 'Physiological Sigh',
    description: 'A short breathing pattern for when you want something quick and simple.',
    durationLabel: '30 seconds',
  },
  extended: {
    id: 'extended', category: 'Slow Things Down', name: 'Extended Exhale',
    description: 'Breathe comfortably in, then give yourself a little more time on the way out.',
    durationLabel: '2-5 minutes',
  },
  coherent: {
    id: 'coherent', category: 'Find Your Rhythm', name: 'Coherent Breathing',
    description: 'A steady, even breathing rhythm with minimal counting.',
    durationLabel: '5 minutes',
  },
  box: {
    id: 'box', category: 'Steady & Focus', name: 'Box Breathing',
    description: 'A structured breathing rhythm for when you want something more deliberate.',
    durationLabel: '2-5 minutes',
  },
  '478': {
    id: '478', category: 'Wind Down', name: '4-7-8 Breathing',
    description: 'A slower guided practice for settling into the evening.',
    supportingCopy: 'Use gently. No need to force the breath or hold longer than feels comfortable.',
    durationLabel: '2-5 minutes',
  },
  rectangle: {
    id: 'rectangle', category: 'Visual Grounding', name: 'Rectangle Breathing',
    description: 'Follow the shape while your breathing follows the pace.',
    durationLabel: '2-5 minutes', badge: 'Eyes-open friendly',
  },
  calm: {
    id: 'calm', category: 'Keep It Simple', name: 'Calm Count',
    description: 'No complicated timings. Just an easy guided rhythm.',
    durationLabel: '2-3 minutes', badge: 'Beginner friendly',
  },
};

export const BREATHING_LIBRARY_ORDER: BreathingPracticeId[] = ['sigh', 'extended', 'coherent', 'box', '478', 'rectangle', 'calm'];

// ---- Need -> recommendation --------------------------------------------

export type BreathingNeed = 'calm' | 'steady' | 'clarity' | 'focus' | 'release' | 'sleep';

export const BREATHING_NEED_ORDER: BreathingNeed[] = ['calm', 'steady', 'clarity', 'focus', 'release', 'sleep'];

export const BREATHING_NEED_LABELS: Record<BreathingNeed, string> = {
  calm: 'Calm', steady: 'Steady', clarity: 'Clarity', focus: 'Focus', release: 'Release', sleep: 'Sleep',
};

// Each need maps to the practice whose own library category fits it best
// (Steady and Focus both land on Box Breathing - the "Steady & Focus"
// category is named for both).
const NEED_TO_PRACTICE: Record<BreathingNeed, BreathingPracticeId> = {
  calm: 'extended', steady: 'box', clarity: 'coherent', focus: 'box', release: 'sigh', sleep: '478',
};

// FEELING HIGHLY OVERWHELMED's own worked example - Extended Exhale is
// also the default recommendation before any need is chosen.
export const DEFAULT_OVERWHELM_PRACTICE: BreathingPracticeId = 'extended';

export interface RecommendationContext {
  isEveningWindDown: boolean;
  preferredPractice: BreathingPracticeId | null;
}

// "Nova may recommend a practice based on... previous breathing feedback"
// - once a real preference exists it's honoured over the generic mapping,
// but only ever one practice is ever returned - never three or four
// equal options (NOVA RECOMMENDATION: "one practice, not three or four").
export const recommendPractice = (need: BreathingNeed | null, ctx: RecommendationContext): BreathingPracticeId => {
  if (ctx.preferredPractice) return ctx.preferredPractice;
  if (!need) return ctx.isEveningWindDown ? '478' : DEFAULT_OVERWHELM_PRACTICE;
  if (need === 'sleep') return '478'; // CONNECTION TO SLEEP & WIND-DOWN: always gentle, regardless of preference override above for other needs
  if (ctx.isEveningWindDown && need !== 'focus' && need !== 'clarity') return '478';
  return NEED_TO_PRACTICE[need];
};

// ---- Post-session checkpoint --------------------------------------------

export type CheckpointResponse = 'calmer' | 'about_same' | 'more_unsettled' | 'not_sure';

export const CHECKPOINT_RESPONSE_ORDER: CheckpointResponse[] = ['calmer', 'about_same', 'more_unsettled', 'not_sure'];

export const CHECKPOINT_RESPONSE_LABELS: Record<CheckpointResponse, string> = {
  calmer: 'A little calmer', about_same: 'About the same', more_unsettled: 'More unsettled', not_sure: 'Not sure yet',
};

export type CheckpointOptionId =
  | 'good_for_now' | 'one_more_minute' | 'smaller_next_step' | 'remove_one_thing'
  | 'grounding' | 'make_it_smaller' | 'talk_to_nova' | 'quick_support'
  | 'use_grounding' | 'sit_30_seconds' | 'try_grounding' | 'finish_now';

export const CHECKPOINT_OPTION_LABELS: Record<CheckpointOptionId, string> = {
  good_for_now: "I'm good for now",
  one_more_minute: 'Take one more minute',
  smaller_next_step: 'Make my next step smaller',
  remove_one_thing: 'Help me remove one thing',
  grounding: 'Grounding',
  make_it_smaller: 'Make It Smaller',
  talk_to_nova: 'Talk to Nova',
  quick_support: 'Quick Support',
  use_grounding: 'Use Grounding Instead',
  sit_30_seconds: 'Sit here for 30 seconds',
  try_grounding: 'Try grounding',
  finish_now: 'Finish for now',
};

export interface CheckpointBranch {
  novaLine: string;
  supportingLine?: string;
  followUpQuestion?: string;
  options: CheckpointOptionId[];
}

export const CHECKPOINT_BRANCHES: Record<CheckpointResponse, CheckpointBranch> = {
  calmer: {
    novaLine: "Good. Don't turn that into another task.",
    followUpQuestion: 'What would help next?',
    options: ['good_for_now', 'one_more_minute', 'smaller_next_step', 'remove_one_thing'],
  },
  about_same: {
    novaLine: "That one may not have been what you needed. We don't have to keep breathing at the problem.",
    options: ['grounding', 'make_it_smaller', 'talk_to_nova', 'quick_support'],
  },
  more_unsettled: {
    novaLine: "Stop the breathing practice. Let's switch approaches.",
    supportingLine: "You don't need to push through something that isn't helping.",
    options: ['use_grounding', 'talk_to_nova', 'quick_support'],
  },
  not_sure: {
    novaLine: "That's fine. You don't need to decide immediately.",
    options: ['sit_30_seconds', 'try_grounding', 'finish_now'],
  },
};

// Never suggest another breathing session right after this response -
// "do not encourage the user to force additional breathwork."
export const shouldDiscourageMoreBreathing = (response: CheckpointResponse): boolean => response === 'more_unsettled';

// ---- "Did it help?" feedback --------------------------------------------

export type BreathingHelpfulness = 'yes' | 'a_little' | 'not_really';

const HELPFULNESS_VALUES: Record<BreathingHelpfulness, number> = { yes: 2, a_little: 1, not_really: 0 };

export const DID_IT_HELP_ASK_INTERVAL = 3;

// "Occasionally... Do not ask after every session" - gated by a simple
// completion counter, and never asked right after a session the
// checkpoint already flagged as unhelpful (that answer is itself the
// feedback).
export const shouldAskDidItHelp = (totalSessionsBeforeThisOne: number, checkpointResponse: CheckpointResponse): boolean => {
  if (checkpointResponse === 'more_unsettled') return false;
  return (totalSessionsBeforeThisOne + 1) % DID_IT_HELP_ASK_INTERVAL === 0;
};

// ---- Personalisation ------------------------------------------------------

export interface PracticeFeedbackEntry {
  practiceId: BreathingPracticeId;
  helpful: BreathingHelpfulness;
}

const MIN_SESSIONS_FOR_PRACTICE_PREFERENCE = 3;
const MEANINGFULLY_POSITIVE_THRESHOLD = 1;

// Mirrors computeMostHelpfulFuelAction's precedent exactly: a minimum
// sample, never a fabricated percentage, null below threshold or when
// nothing clears the positive bar.
export const computeMostHelpfulPractice = (entries: PracticeFeedbackEntry[]): BreathingPracticeId | null => {
  const byPractice = new Map<BreathingPracticeId, BreathingHelpfulness[]>();
  for (const e of entries) {
    const list = byPractice.get(e.practiceId) || [];
    list.push(e.helpful);
    byPractice.set(e.practiceId, list);
  }
  let best: { practiceId: BreathingPracticeId; avg: number } | null = null;
  for (const [practiceId, helpfuls] of byPractice.entries()) {
    if (helpfuls.length < MIN_SESSIONS_FOR_PRACTICE_PREFERENCE) continue;
    const avg = helpfuls.reduce((sum, h) => sum + HELPFULNESS_VALUES[h], 0) / helpfuls.length;
    if (avg <= MEANINGFULLY_POSITIVE_THRESHOLD) continue;
    if (!best || avg > best.avg) best = { practiceId, avg };
  }
  return best ? best.practiceId : null;
};

const MIN_CHECKPOINTS_FOR_EFFECTIVENESS_SIGNAL = 3;
const INCONSISTENT_THRESHOLD = 2;

// "Breathing hasn't been especially useful for you lately" - a plain
// recent-pattern read, never a percentage and never implied causation
// from a couple of sessions.
export const computeBreathingEffectivenessSignal = (
  recentResponses: CheckpointResponse[]
): 'reliable' | 'inconsistent' | null => {
  if (recentResponses.length < MIN_CHECKPOINTS_FOR_EFFECTIVENESS_SIGNAL) return null;
  const window = recentResponses.slice(-MIN_CHECKPOINTS_FOR_EFFECTIVENESS_SIGNAL);
  const unhelpfulCount = window.filter((r) => r === 'more_unsettled' || r === 'about_same').length;
  return unhelpfulCount >= INCONSISTENT_THRESHOLD ? 'inconsistent' : 'reliable';
};

// ---- Connection to Energy Delta ------------------------------------------

// "You've used a few resets today, but your load is still running above
// your capacity." A real repeat-use count plus a real capacity/load
// mismatch - never a guess.
export const MIN_RESETS_FOR_LOAD_CALLOUT = 2;

export const shouldSuggestLoadIsRealProblem = (
  resetsToday: number,
  energyDeltaNegative: boolean | null
): boolean => resetsToday >= MIN_RESETS_FOR_LOAD_CALLOUT && energyDeltaNegative === true;

// ---- Guided Reset Mode ----------------------------------------------------

export type OverwhelmIntensity = 'a_bit' | 'quite' | 'very';

export const OVERWHELM_INTENSITY_ORDER: OverwhelmIntensity[] = ['a_bit', 'quite', 'very'];

export const OVERWHELM_INTENSITY_LABELS: Record<OverwhelmIntensity, string> = {
  a_bit: 'A bit activated', quite: 'Quite overwhelmed', very: 'Very overwhelmed',
};

// "The more overwhelmed the user appears, the fewer decisions the
// experience should require." A plain, testable cap on how many choices
// any guided-reset step may present.
export const maxChoicesForIntensity = (intensity: OverwhelmIntensity): number => {
  if (intensity === 'very') return 1;
  if (intensity === 'quite') return 2;
  return 3;
};

export type GuidedResetStepId = 'slow_body' | 'reduce_noise' | 'next_step';
export const GUIDED_RESET_STEP_ORDER: GuidedResetStepId[] = ['slow_body', 'reduce_noise', 'next_step'];
