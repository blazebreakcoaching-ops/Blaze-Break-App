// Pure, deterministic logic behind Anxiety Reset: a GUIDED fast lane for
// moments of real, present anxiety/panic/overwhelm - distinct from Reset
// Studio's exploratory "what's happening, and what might help?" model.
// The user names what feels strongest; Nova picks ONE starting point and
// walks them through it. Nothing here claims to diagnose, treat, or
// measurably regulate anyone's nervous system.

import { BreathingHelpfulness, BreathingNeed } from './breathing-reset-engine';

export type { BreathingHelpfulness as AnxietyHelpfulness };

// ---- NOTICE ----------------------------------------------------------------
// "What feels strongest right now?" - large tap targets, no forced
// trigger identification, "I don't know" always a valid, equal answer.

export type NoticeAnswer =
  | 'racing_thoughts' | 'body_tense' | 'panicky' | 'worried_specific'
  | 'dreading' | 'stuck_decision' | 'cant_switch_off' | 'dont_know';

export const NOTICE_ANSWER_ORDER: NoticeAnswer[] = [
  'racing_thoughts', 'body_tense', 'panicky', 'worried_specific',
  'dreading', 'stuck_decision', 'cant_switch_off', 'dont_know',
];

export const NOTICE_ANSWER_LABELS: Record<NoticeAnswer, string> = {
  racing_thoughts: "My thoughts won't stop",
  body_tense: 'My body feels tense',
  panicky: 'I feel panicky',
  worried_specific: "I'm worried about something specific",
  dreading: "I'm dreading something",
  stuck_decision: "I'm stuck on a decision",
  cant_switch_off: "I can't switch off",
  dont_know: "I don't know — it's just too much",
};

// ---- Intensity ---------------------------------------------------------------
// Plain language only in front of the user; a numeric scale (if ever
// useful for trend analysis) stays entirely internal.

export type IntensityLevel = 'manageable' | 'hard_to_focus' | 'overwhelming';

export const INTENSITY_ORDER: IntensityLevel[] = ['manageable', 'hard_to_focus', 'overwhelming'];

export const INTENSITY_LABELS: Record<IntensityLevel, string> = {
  manageable: 'Manageable',
  hard_to_focus: 'Hard to focus',
  overwhelming: 'Overwhelming',
};

const INTERNAL_INTENSITY_SCALE: Record<IntensityLevel, number> = {
  manageable: 3, hard_to_focus: 6, overwhelming: 9,
};

// Internal-only - never rendered as a number to the user.
export const mapIntensityToInternalScale = (level: IntensityLevel): number => INTERNAL_INTENSITY_SCALE[level];

// ---- Category + intervention matching ----------------------------------------

export type ResetCategory = 'cognitive' | 'physical' | 'general';

const COGNITIVE_NOTICE_ANSWERS: NoticeAnswer[] = [
  'racing_thoughts', 'worried_specific', 'dreading', 'stuck_decision', 'cant_switch_off',
];

export const categorizeNotice = (answer: NoticeAnswer): ResetCategory => {
  if (COGNITIVE_NOTICE_ANSWERS.includes(answer)) return 'cognitive';
  if (answer === 'body_tense') return 'physical';
  return 'general'; // panicky, dont_know - too much to categorise further
};

export type AnxietyIntervention = 'worry_offload' | 'breathing' | 'grounding' | 'tension_release';

export const ANXIETY_INTERVENTION_LABELS: Record<AnxietyIntervention, string> = {
  worry_offload: 'Worry Offload',
  breathing: 'Breathing',
  grounding: 'Grounding',
  tension_release: 'Release Some Tension',
};

export interface InterventionContext {
  category: ResetCategory;
  breathingPreviouslyUncomfortable: boolean;
  preferredIntervention: AnxietyIntervention | null;
}

// NOVA MATCHING: quietly chooses ONE starting point. A real learned
// preference overrides the generic mapping, same precedent as
// recommendPractice - except breathing is never recommended once it has
// genuinely made this user more unsettled before, preference or not.
export const recommendIntervention = (ctx: InterventionContext): AnxietyIntervention => {
  const preferredIsSafe = ctx.preferredIntervention
    && !(ctx.preferredIntervention === 'breathing' && ctx.breathingPreviouslyUncomfortable);
  if (preferredIsSafe) return ctx.preferredIntervention as AnxietyIntervention;

  if (ctx.category === 'cognitive') return 'worry_offload';
  if (ctx.category === 'physical') return ctx.breathingPreviouslyUncomfortable ? 'grounding' : 'breathing';
  return 'grounding';
};

// BREATHING: hands off to the real Master Breathing & Guided Reset
// system rather than a second breathing engine - always the same, most
// universally-appropriate need for an anxious moment.
export const ANXIETY_BREATHING_NEED: BreathingNeed = 'calm';

// ---- Worry Offload -----------------------------------------------------------

export type WorryOffloadOutcome = 'park_it' | 'find_the_fact' | 'find_one_next_step' | 'let_it_go';

export const WORRY_OFFLOAD_OUTCOME_ORDER: WorryOffloadOutcome[] = [
  'park_it', 'find_the_fact', 'find_one_next_step', 'let_it_go',
];

export const WORRY_OFFLOAD_OUTCOME_LABELS: Record<WorryOffloadOutcome, string> = {
  park_it: 'Park It',
  find_the_fact: 'Find the Fact',
  find_one_next_step: 'Find One Next Step',
  let_it_go: 'Let It Go',
};

// ---- Grounding -----------------------------------------------------------------
// A shorter version is enough - never forcing the full 5-4-3-2-1
// sequence. The user can stop once they feel sufficiently settled.

export type GroundingSenseStep = 'see' | 'feel' | 'hear';

export const GROUNDING_SENSE_ORDER: GroundingSenseStep[] = ['see', 'feel', 'hear'];

export const GROUNDING_SENSE_PROMPTS: Record<GroundingSenseStep, string> = {
  see: 'Something you can see',
  feel: 'Something you can feel',
  hear: 'Something you can hear',
};

// ---- Body release (tension) ------------------------------------------------------
// One area at a time, notice then release - never instructing users to
// tense muscles aggressively first.

export type BodyReleaseArea = 'shoulders' | 'jaw' | 'hands' | 'legs';

export const BODY_RELEASE_ORDER: BodyReleaseArea[] = ['shoulders', 'jaw', 'hands', 'legs'];

export interface BodyReleaseStep {
  notice: string;
  release: string;
}

export const BODY_RELEASE_PROMPTS: Record<BodyReleaseArea, BodyReleaseStep> = {
  shoulders: { notice: 'Notice your shoulders.', release: 'Let them drop if they want to.' },
  jaw: { notice: 'Notice your jaw.', release: 'Let it soften, just slightly.' },
  hands: { notice: 'Notice your hands.', release: 'Let them rest, open.' },
  legs: { notice: 'Notice your legs.', release: 'Let the weight of them settle.' },
};

// ---- Post-reset checkpoint ---------------------------------------------------
// "Where are you now?" - every Anxiety Reset closes the loop, never
// asking whether the nervous system was "successfully regulated."

export type AnxietyCheckResponse = 'steadier' | 'about_same' | 'more_unsettled' | 'not_sure';

export const ANXIETY_CHECK_ORDER: AnxietyCheckResponse[] = ['steadier', 'about_same', 'more_unsettled', 'not_sure'];

export const ANXIETY_CHECK_LABELS: Record<AnxietyCheckResponse, string> = {
  steadier: 'A little steadier',
  about_same: 'About the same',
  more_unsettled: 'More unsettled',
  not_sure: 'Not sure',
};

export type AnxietyCheckOptionId =
  | 'i_am_okay_now' | 'another_minute' | 'make_next_step_smaller' | 'talk_to_nova'
  | 'grounding' | 'breathing' | 'worry_offload' | 'make_it_smaller' | 'quick_support'
  | 'guardian_ping' | 'stay_here' | 'finish_for_now' | 'try_simpler';

export const ANXIETY_CHECK_OPTION_LABELS: Record<AnxietyCheckOptionId, string> = {
  i_am_okay_now: "I'm okay now",
  another_minute: 'Give me another minute',
  make_next_step_smaller: 'Help me make the next step smaller',
  talk_to_nova: 'Talk to Nova',
  grounding: 'Grounding',
  breathing: 'Breathing',
  worry_offload: 'Worry Offload',
  make_it_smaller: 'Make It Smaller',
  quick_support: 'Quick Support',
  guardian_ping: 'Guardian Ping',
  stay_here: 'Stay here for a moment',
  finish_for_now: 'Finish for now',
  try_simpler: 'Try something simpler',
};

export interface AnxietyCheckBranch {
  novaLine: string;
  supportingLine?: string;
  options: AnxietyCheckOptionId[];
}

export const ANXIETY_CHECK_BRANCHES: Record<AnxietyCheckResponse, AnxietyCheckBranch> = {
  steadier: {
    novaLine: "Good. You don't need to do anything else just because you can.",
    options: ['i_am_okay_now', 'another_minute', 'make_next_step_smaller', 'talk_to_nova'],
  },
  about_same: {
    novaLine: 'That approach may not have been what you needed.',
    options: ['grounding', 'breathing', 'worry_offload', 'make_it_smaller', 'quick_support'],
  },
  more_unsettled: {
    novaLine: "Let's stop that approach.",
    supportingLine: "You don't need to push through something that is making you feel worse.",
    options: ['grounding', 'quick_support', 'guardian_ping', 'talk_to_nova'],
  },
  not_sure: {
    novaLine: "That's okay. You don't need to analyse it.",
    options: ['stay_here', 'finish_for_now', 'try_simpler'],
  },
};

// ABOUT THE SAME / MORE UNSETTLED: offer a different category rather
// than automatically repeating the same exercise.
export const shouldOfferDifferentCategory = (response: AnxietyCheckResponse): boolean =>
  response === 'about_same' || response === 'more_unsettled';

// ---- Outcome learning ---------------------------------------------------------
// "Did that feel useful?" reuses breathing's own Yes/A little/Not really
// model exactly (BreathingHelpfulness) rather than a third near-duplicate
// helpfulness type for the same question asked a different way.

export const ANXIETY_HELPFUL_ASK_INTERVAL = 3;

export const shouldAskDidThatFeelUseful = (totalSessionsBeforeThisOne: number): boolean =>
  (totalSessionsBeforeThisOne + 1) % ANXIETY_HELPFUL_ASK_INTERVAL === 0;

export interface InterventionFeedbackEntry {
  intervention: AnxietyIntervention;
  helpful: BreathingHelpfulness;
}

const MIN_SESSIONS_FOR_INTERVENTION_PREFERENCE = 3;
const MEANINGFULLY_POSITIVE_THRESHOLD = 1;
const HELPFULNESS_VALUES: Record<BreathingHelpfulness, number> = { yes: 2, a_little: 1, not_really: 0 };

// Mirrors computeMostHelpfulPractice's precedent exactly: a minimum
// sample, never a fabricated percentage, null below threshold or when
// nothing clears the positive bar. "Grounding seems to work better for
// you than counted breathing" is this, in words.
export const computeMostHelpfulIntervention = (entries: InterventionFeedbackEntry[]): AnxietyIntervention | null => {
  const byIntervention = new Map<AnxietyIntervention, BreathingHelpfulness[]>();
  for (const e of entries) {
    const list = byIntervention.get(e.intervention) || [];
    list.push(e.helpful);
    byIntervention.set(e.intervention, list);
  }
  let best: { intervention: AnxietyIntervention; avg: number } | null = null;
  for (const [intervention, helpfuls] of byIntervention.entries()) {
    if (helpfuls.length < MIN_SESSIONS_FOR_INTERVENTION_PREFERENCE) continue;
    const avg = helpfuls.reduce((sum, h) => sum + HELPFULNESS_VALUES[h], 0) / helpfuls.length;
    if (avg <= MEANINGFULLY_POSITIVE_THRESHOLD) continue;
    if (!best || avg > best.avg) best = { intervention, avg };
  }
  return best ? best.intervention : null;
};

// "If breathing previously made the user more uncomfortable, prioritise
// grounding" - a real negative signal (an actual more_unsettled result
// right after a breathing session), never invented.
export const wasBreathingPreviouslyUncomfortable = (
  entries: { intervention: AnxietyIntervention; checkResponse: AnxietyCheckResponse | null }[]
): boolean => entries.some((e) => e.intervention === 'breathing' && e.checkResponse === 'more_unsettled');

// ---- Connections ----------------------------------------------------------------
// Both gated to NEXT STEP only - never during the most intense part of
// the reset.

// "You're a little steadier, but the load hasn't changed." Takes the
// real load/capacity comparison as a boolean rather than recomputing
// Energy Delta's own logic here.
export const shouldOfferRemoveOneThing = (
  checkResponse: AnxietyCheckResponse,
  loadExceedsCapacity: boolean
): boolean => checkResponse === 'steadier' && loadExceedsCapacity;

export const MIN_SESSIONS_FOR_WORKLOAD_SUGGESTION = 3;

const URGENCY_NOTICE_ANSWERS: NoticeAnswer[] = ['cant_switch_off', 'dreading', 'stuck_decision', 'racing_thoughts'];

// "A lot of what's hitting you seems to be competing demands" - only
// once urgency-flavoured NOTICE answers have genuinely recurred.
export const shouldSuggestWorkloadRealityCheck = (recentNoticeAnswers: NoticeAnswer[]): boolean => {
  if (recentNoticeAnswers.length < MIN_SESSIONS_FOR_WORKLOAD_SUGGESTION) return false;
  const urgencyCount = recentNoticeAnswers.filter((a) => URGENCY_NOTICE_ANSWERS.includes(a)).length;
  return urgencyCount >= MIN_SESSIONS_FOR_WORKLOAD_SUGGESTION;
};

// ---- Visual stage -----------------------------------------------------------------
// COMPRESSION -> EXPANSION: contained/quiet at NOTICE, soft slow motion
// at SETTLE, larger/more open at NEXT STEP.

export type ResetStage = 'notice' | 'settle' | 'next_step';

export const RESET_STAGE_ORDER: ResetStage[] = ['notice', 'settle', 'next_step'];

// ---- Companion-voice guardrail -----------------------------------------------------
// Keeps Nova a companion walking alongside the user, never a clinical
// device or a compliance engine measuring their nervous system.

export const ANXIETY_RESET_BANNED_PHRASES: string[] = [
  'somatic handrail', 'nervous system de-escalation', 'acute mental fatigue', 'physiological regulation',
  'disarm the amygdala', 'physiological trigger', 'vaporise chaos', 'execute hard incineration',
  'volatile memory buffer', 'grounded in clinical anxiety-support techniques', 'all logs are encrypted',
  'completely confidential', 'never shared with b2b organisations', 'total crisis', 'treats anxiety',
  'treats panic disorder', 'diagnoses gad', 'stops panic attacks', 'resets the nervous system',
  'measurable autonomic work', 'secure baseline restored', 'de-escalation stabilised',
];

export const containsBannedPhrase = (text: string): boolean => {
  const lower = text.toLowerCase();
  return ANXIETY_RESET_BANNED_PHRASES.some((p) => lower.includes(p));
};

// ---- Safety / positioning copy -----------------------------------------------------

export const ANXIETY_RESET_SAFETY_BOUNDARY =
  'Anxiety Reset provides self-guided wellbeing support. It does not diagnose or treat medical or mental health conditions.';

export const ANXIETY_RESET_METHOD_DESCRIPTION =
  'Uses simple grounding, breathing and cognitive offloading techniques commonly used to help people settle during anxious moments.';
