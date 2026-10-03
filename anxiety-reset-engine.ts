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
  manageable: 'Noticeable',
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

export type AnxietyIntervention = 'worry_offload' | 'breathing' | 'grounding' | 'tension_release' | 'discreet_reset' | 'stay_with_me';

export const ANXIETY_INTERVENTION_LABELS: Record<AnxietyIntervention, string> = {
  worry_offload: 'Worry Offload',
  breathing: 'Breathing',
  grounding: 'Grounding',
  tension_release: 'Release Some Tension',
  discreet_reset: 'Discreet Reset',
  stay_with_me: 'Stay With Me',
};

// ---- Situational context --------------------------------------------------
// "Where are you right now?" - asked only when it could genuinely change
// which intervention is appropriate (discreet in a meeting, nothing
// visually demanding while travelling, nothing stimulating in bed).

export type SettingContext = 'private' | 'around_others' | 'meeting_or_class' | 'travelling' | 'in_bed' | 'other';

export const SETTING_CONTEXT_ORDER: SettingContext[] = ['private', 'around_others', 'meeting_or_class', 'travelling', 'in_bed', 'other'];

export const SETTING_CONTEXT_LABELS: Record<SettingContext, string> = {
  private: 'Somewhere private',
  around_others: 'Around other people',
  meeting_or_class: 'In a meeting / class',
  travelling: 'Travelling',
  in_bed: 'In bed',
  other: 'Other',
};

type InterventionRestriction = 'discreet_only' | 'no_eyes_closed' | 'no_stimulating_focus';

const SETTING_RESTRICTIONS: Record<SettingContext, InterventionRestriction[]> = {
  private: [],
  around_others: ['discreet_only'],
  meeting_or_class: ['discreet_only'],
  travelling: ['no_eyes_closed'],
  in_bed: ['no_stimulating_focus'],
  other: [],
};

export const getSettingRestrictions = (context: SettingContext | null): InterventionRestriction[] =>
  context ? SETTING_RESTRICTIONS[context] : [];

// ---- Durable breathing preference -----------------------------------------
// A real, user-set preference - distinct from (and respected alongside)
// the per-session "breathing made this worse before" signal.

export type BreathingPreference = 'usually_helps' | 'sometimes_helps' | 'prefer_grounding' | 'dont_suggest';

export const BREATHING_PREFERENCE_ORDER: BreathingPreference[] = ['usually_helps', 'sometimes_helps', 'prefer_grounding', 'dont_suggest'];

export const BREATHING_PREFERENCE_LABELS: Record<BreathingPreference, string> = {
  usually_helps: 'Breathing usually helps me',
  sometimes_helps: 'Breathing sometimes helps',
  prefer_grounding: 'Prefer grounding',
  dont_suggest: "Don't suggest breathing",
};

export interface InterventionContext {
  category: ResetCategory;
  breathingPreviouslyUncomfortable: boolean;
  preferredIntervention: AnxietyIntervention | null;
  breathingPreference?: BreathingPreference | null;
  settingContext?: SettingContext | null;
}

// NOVA MATCHING: quietly chooses ONE starting point. Setting context
// comes first - discreetness overrides every other signal, since the
// user genuinely cannot do anything visible. A real learned preference
// overrides the generic mapping next, except breathing is never
// recommended once it has genuinely made this user more unsettled
// before, or once they've said not to suggest it, preference or not.
export const recommendIntervention = (ctx: InterventionContext): AnxietyIntervention => {
  const restrictions = getSettingRestrictions(ctx.settingContext ?? null);
  if (restrictions.includes('discreet_only')) return 'discreet_reset';

  const breathingBlocked = ctx.breathingPreviouslyUncomfortable || ctx.breathingPreference === 'dont_suggest';
  const preferGrounding = ctx.breathingPreference === 'prefer_grounding';

  const preferredIsSafe = ctx.preferredIntervention
    && !(ctx.preferredIntervention === 'breathing' && breathingBlocked);
  if (preferredIsSafe) return ctx.preferredIntervention as AnxietyIntervention;

  if (ctx.category === 'cognitive') return 'worry_offload';
  if (ctx.category === 'physical') return (breathingBlocked || preferGrounding) ? 'grounding' : 'breathing';
  return 'grounding';
};

// ---- Discreet Reset ---------------------------------------------------------
// No audio, no visible breathing animation, no countdown - suitable for
// meetings, classrooms, public transport, social environments.

export const DISCREET_RESET_STEPS: string[] = [
  'Feel your feet or the chair beneath you.',
  'Loosen your grip on anything you are holding.',
  'Notice one object in front of you.',
  'Let your shoulders soften if comfortable.',
  'Choose only the next thing you need to do.',
];

// ---- Stay With Me -------------------------------------------------------------
// For users who don't want another technique or decision - extremely
// low demand, companion-like, never analytical coaching.

export const STAY_WITH_ME_OPENING = "You don't need to do anything clever. I'll stay with you for a minute.";

export const STAY_WITH_ME_LINES: string[] = [
  "I'm here.",
  'Nothing to solve yet.',
  "Feel what's supporting your body.",
  'Notice one thing in front of you.',
  'Take the next breath however it comes.',
  "Tell me when you're ready for the next step.",
];

export type StayWithMeChoice = 'keep_staying' | 'ready' | 'different_approach' | 'finish_for_now';

export const STAY_WITH_ME_CHOICE_ORDER: StayWithMeChoice[] = ['keep_staying', 'ready', 'different_approach', 'finish_for_now'];

export const STAY_WITH_ME_CHOICE_LABELS: Record<StayWithMeChoice, string> = {
  keep_staying: 'Keep staying with me',
  ready: "I'm ready",
  different_approach: 'I want another approach',
  finish_for_now: 'Finish for now',
};

// ---- Safety gate for physical symptoms ---------------------------------------
// Anxiety Reset must not assume every physical symptom is anxiety.

export const PHYSICAL_SAFETY_GATE_QUESTION =
  'Does this feel physically severe, unfamiliar, or different from what you normally experience?';

export const PHYSICAL_SAFETY_GATE_MESSAGE =
  "If this feels physically severe, unfamiliar, or different from what you normally experience, it may be safer to get appropriate medical help rather than assume it's anxiety.";

export const shouldShowSafetyGate = (answer: NoticeAnswer): boolean => answer === 'body_tense' || answer === 'panicky';

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
  find_the_fact: 'What Do I Actually Know?',
  find_one_next_step: 'Find One Next Step',
  let_it_go: 'Let It Go',
};

// WHAT DO I ACTUALLY KNOW?: never argues with the user or tells them
// their fear is irrational - just organises uncertainty into what's
// actually known, what the mind is filling in, and what (if anything)
// still genuinely needs attention.
export const KNOW_VS_PREDICT_PROMPTS = {
  know: 'What do I actually know?',
  predicting: 'What am I predicting, imagining, or filling in?',
  stillNeedsAttention: 'What still genuinely needs attention?',
};

// ---- Park It: reminder + privacy choices -------------------------------------

export type WorryReminderChoice = 'later_today' | 'tomorrow' | 'no_reminder';

export const WORRY_REMINDER_ORDER: WorryReminderChoice[] = ['later_today', 'tomorrow', 'no_reminder'];

export const WORRY_REMINDER_LABELS: Record<WorryReminderChoice, string> = {
  later_today: 'Later today', tomorrow: 'Tomorrow', no_reminder: 'No reminder needed',
};

// PRIVACY CONTROLS: raw free-text worry content is never silently
// retained - the user decides each time whether it's kept at all, kept
// just for them, or made available for pattern learning.
export type WorryPrivacyChoice = 'dont_save' | 'save_privately' | 'let_nova_use_for_patterns';

export const WORRY_PRIVACY_ORDER: WorryPrivacyChoice[] = ['dont_save', 'save_privately', 'let_nova_use_for_patterns'];

export const WORRY_PRIVACY_LABELS: Record<WorryPrivacyChoice, string> = {
  dont_save: "Don't Save This",
  save_privately: 'Save Privately',
  let_nova_use_for_patterns: 'Let Nova Use This to Notice Patterns',
};

// ---- Grounding -----------------------------------------------------------------
// A shorter version is enough - never forcing the full 5-4-3-2-1
// sequence. The user can stop once they feel sufficiently settled.

export type GroundingSenseStep = 'see' | 'support' | 'sound' | 'neutral_sensation';

export const GROUNDING_SENSE_ORDER: GroundingSenseStep[] = ['see', 'support', 'sound', 'neutral_sensation'];

export const GROUNDING_SENSE_PROMPTS: Record<GroundingSenseStep, string> = {
  see: 'Notice one thing you can see.',
  support: 'Notice something supporting your body.',
  sound: 'Notice one sound.',
  neutral_sensation: 'Notice one physical sensation that feels neutral.',
};

// ---- Body release (tension) ------------------------------------------------------
// One area at a time, notice then release - never instructing users to
// tense muscles aggressively first.

export type BodyReleaseArea = 'shoulders' | 'jaw' | 'hands' | 'face' | 'legs';

export const BODY_RELEASE_ORDER: BodyReleaseArea[] = ['shoulders', 'jaw', 'hands', 'face', 'legs'];

export interface BodyReleaseStep {
  notice: string;
  release: string;
}

export const BODY_RELEASE_PROMPTS: Record<BodyReleaseArea, BodyReleaseStep> = {
  shoulders: { notice: 'Notice your shoulders.', release: 'Let them drop if they want to.' },
  jaw: { notice: 'Notice your jaw.', release: 'Let it soften, just slightly.' },
  hands: { notice: 'Notice your hands.', release: 'Let them rest, open.' },
  face: { notice: 'Notice your face.', release: 'Let it soften, if that feels okay.' },
  legs: { notice: 'Notice your legs.', release: 'Let the weight of them settle.' },
};

// ---- Post-reset checkpoint ---------------------------------------------------
// "Where are you now?" - every Anxiety Reset closes the loop, never
// asking whether the nervous system was "successfully regulated."

// "Still anxious, but I can continue" matters as much as the calmer
// options - the user does not need to reach calm before progressing.
export type AnxietyCheckResponse = 'steadier' | 'still_anxious_continuing' | 'about_same' | 'more_unsettled' | 'not_sure';

export const ANXIETY_CHECK_ORDER: AnxietyCheckResponse[] = ['steadier', 'still_anxious_continuing', 'about_same', 'more_unsettled', 'not_sure'];

export const ANXIETY_CHECK_LABELS: Record<AnxietyCheckResponse, string> = {
  steadier: 'A little steadier',
  still_anxious_continuing: 'Still anxious, but I can continue',
  about_same: 'About the same',
  more_unsettled: 'More unsettled',
  not_sure: 'Not sure yet',
};

export type AnxietyCheckOptionId =
  | 'i_am_okay_now' | 'another_minute' | 'help_with_anxious_about' | 'make_next_step_smaller'
  | 'go_back_to_what_i_was_doing' | 'deal_with_anxious_about' | 'talk_to_nova'
  | 'grounding' | 'worry_offload' | 'stay_with_me' | 'make_it_smaller' | 'quick_support'
  | 'guardian_ping' | 'stay_here' | 'try_simpler' | 'finish_for_now';

export const ANXIETY_CHECK_OPTION_LABELS: Record<AnxietyCheckOptionId, string> = {
  i_am_okay_now: "I'm okay now",
  another_minute: 'Give me another minute',
  help_with_anxious_about: "Help me with what I'm anxious about",
  make_next_step_smaller: 'Make my next step smaller',
  go_back_to_what_i_was_doing: 'Go back to what I was doing',
  deal_with_anxious_about: "Deal with what I'm anxious about",
  talk_to_nova: 'Talk to Nova',
  grounding: 'Grounding',
  worry_offload: 'Worry Offload',
  stay_with_me: 'Stay With Me',
  make_it_smaller: 'Make It Smaller',
  quick_support: 'Quick Support',
  guardian_ping: 'Guardian Ping',
  stay_here: 'Stay here for a moment',
  try_simpler: 'Try something simpler',
  finish_for_now: 'Finish for now',
};

export interface AnxietyCheckBranch {
  novaLine: string;
  supportingLine?: string;
  options: AnxietyCheckOptionId[];
}

export const ANXIETY_CHECK_BRANCHES: Record<AnxietyCheckResponse, AnxietyCheckBranch> = {
  steadier: {
    novaLine: "Good. You don't need to do anything else just because you can.",
    options: ['i_am_okay_now', 'another_minute', 'help_with_anxious_about', 'make_next_step_smaller'],
  },
  still_anxious_continuing: {
    novaLine: "That's enough. You don't have to feel completely calm to choose what happens next.",
    options: ['go_back_to_what_i_was_doing', 'deal_with_anxious_about', 'make_next_step_smaller', 'talk_to_nova'],
  },
  about_same: {
    novaLine: 'That approach may not have been what you needed.',
    options: ['grounding', 'worry_offload', 'stay_with_me', 'make_it_smaller', 'quick_support'],
  },
  more_unsettled: {
    novaLine: "Let's stop that approach.",
    supportingLine: "You don't need to push through something that isn't helping.",
    options: ['grounding', 'stay_with_me', 'quick_support', 'guardian_ping', 'talk_to_nova'],
  },
  not_sure: {
    novaLine: "That's okay. You don't need to analyse it.",
    options: ['stay_here', 'stay_with_me', 'try_simpler', 'finish_for_now'],
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

// "This keeps following you out of work. Want help leaving it there
// tonight?" - a real repeated "I can't switch off" signal, reusing the
// same minimum sample as the Workload Reality Check connection.
export const DOORWAY_CONNECTION_LINE = "This keeps following you out of work. Want help leaving it there tonight?";

export const shouldOfferDecompressionDoorway = (recentNoticeAnswers: NoticeAnswer[]): boolean => {
  if (recentNoticeAnswers.length < MIN_SESSIONS_FOR_WORKLOAD_SUGGESTION) return false;
  const count = recentNoticeAnswers.filter((a) => a === 'cant_switch_off').length;
  return count >= MIN_SESSIONS_FOR_WORKLOAD_SUGGESTION;
};

// ---- Settle or Solve ----------------------------------------------------------
// Prevents Anxiety Reset from becoming an endless regulation loop - once
// enough steadiness has returned, Nova names the real distinction.

export type SettleOrSolveChoice = 'steadier' | 'anxious_about_something' | 'okay_for_now';

export const SETTLE_OR_SOLVE_ORDER: SettleOrSolveChoice[] = ['steadier', 'anxious_about_something', 'okay_for_now'];

export const SETTLE_OR_SOLVE_LABELS: Record<SettleOrSolveChoice, string> = {
  steadier: 'Help me feel a little steadier',
  anxious_about_something: "Help me with what I'm anxious about",
  okay_for_now: "I'm okay for now",
};

export type SolveRoute = 'what_i_know' | 'one_controllable_step' | 'one_less_thing' | 'workload_reality_check' | 'decompression_doorway' | 'talk_to_nova';

export const SOLVE_ROUTE_LABELS: Record<SolveRoute, string> = {
  what_i_know: 'What I Know / What I’m Predicting',
  one_controllable_step: 'One Controllable Step',
  one_less_thing: 'One Less Thing',
  workload_reality_check: 'Workload Reality Check',
  decompression_doorway: 'Decompression Doorway',
  talk_to_nova: 'Talk to Nova',
};

export interface SolveRouteContext {
  category: ResetCategory;
  loadExceedsCapacity: boolean;
  recentUrgencyPattern: boolean;
  roleCarriedOver: boolean;
}

// "Help me with what I'm anxious about" routes to ONE sensible place,
// never all six at once - a real carried-over-role signal wins first,
// then a real repeated-urgency pattern, then genuine overload, then the
// NOTICE category itself.
export const recommendSolveRoute = (ctx: SolveRouteContext): SolveRoute => {
  if (ctx.roleCarriedOver) return 'decompression_doorway';
  if (ctx.recentUrgencyPattern) return 'workload_reality_check';
  if (ctx.loadExceedsCapacity) return 'one_less_thing';
  if (ctx.category === 'cognitive') return 'what_i_know';
  return 'one_controllable_step';
};

// ---- Later follow-up -------------------------------------------------------------
// "How did the rest of that moment go?" - used selectively, never after
// every reset.

export type LaterFollowUpResponse = 'settled_enough' | 'came_back' | 'got_harder' | 'moved_on';

export const LATER_FOLLOW_UP_ORDER: LaterFollowUpResponse[] = ['settled_enough', 'came_back', 'got_harder', 'moved_on'];

export const LATER_FOLLOW_UP_LABELS: Record<LaterFollowUpResponse, string> = {
  settled_enough: 'Settled enough',
  came_back: 'The anxiety came back',
  got_harder: 'It got harder',
  moved_on: 'I moved on',
};

export const LATER_FOLLOW_UP_QUESTION = 'How did the rest of that moment go?';

export const LATER_FOLLOW_UP_ASK_INTERVAL = 4;

export const shouldAskLaterFollowUp = (totalSessionsBeforeThisOne: number): boolean =>
  (totalSessionsBeforeThisOne + 1) % LATER_FOLLOW_UP_ASK_INTERVAL === 0;

// ---- Dependency prevention -------------------------------------------------------
// Independence is offered, never imposed - guided support is never
// withdrawn just because the user "should know better" by now.

export const INDEPENDENCE_PROMPT = 'You know this one now. Want to try the first 30 seconds yourself before I guide you?';

export type IndependenceChoice = 'ill_try' | 'guide_me_anyway' | 'different_approach';

export const INDEPENDENCE_CHOICE_ORDER: IndependenceChoice[] = ['ill_try', 'guide_me_anyway', 'different_approach'];

export const INDEPENDENCE_CHOICE_LABELS: Record<IndependenceChoice, string> = {
  ill_try: "I'll try",
  guide_me_anyway: 'Guide me anyway',
  different_approach: 'Different approach',
};

export interface InterventionUseRecord {
  intervention: AnxietyIntervention;
  helpful: BreathingHelpfulness | null;
}

const MIN_SUCCESSFUL_USES_FOR_INDEPENDENCE_OFFER = 4;

// Only offered once the SAME simple reset has genuinely helped several
// times - never a generic nudge after one good session.
export const shouldOfferIndependence = (entries: InterventionUseRecord[], intervention: AnxietyIntervention): boolean => {
  const sameIntervention = entries.filter((e) => e.intervention === intervention);
  if (sameIntervention.length < MIN_SUCCESSFUL_USES_FOR_INDEPENDENCE_OFFER) return false;
  const positiveCount = sameIntervention.filter((e) => e.helpful === 'yes').length;
  return positiveCount >= MIN_SUCCESSFUL_USES_FOR_INDEPENDENCE_OFFER;
};

// ---- Repeated use without improvement --------------------------------------------
// Stops assuming more self-guided resets are the answer once a real
// pattern of low benefit shows up - never shaming, never calling it
// a failure to use the techniques "properly".

export const REPEATED_USE_NO_IMPROVEMENT_LINE = "These resets don't seem to be giving you much relief lately.";

const MIN_SESSIONS_FOR_NO_IMPROVEMENT_SIGNAL = 4;
const LOW_BENEFIT_THRESHOLD = 0.5;
const REPEATED_USE_HELPFULNESS_VALUES: Record<BreathingHelpfulness, number> = { yes: 2, a_little: 1, not_really: 0 };

export const shouldFlagRepeatedUseWithoutImprovement = (recentHelpfulness: BreathingHelpfulness[]): boolean => {
  if (recentHelpfulness.length < MIN_SESSIONS_FOR_NO_IMPROVEMENT_SIGNAL) return false;
  const avg = recentHelpfulness.reduce((s, h) => s + REPEATED_USE_HELPFULNESS_VALUES[h], 0) / recentHelpfulness.length;
  return avg <= LOW_BENEFIT_THRESHOLD;
};

// ---- Pattern escalation (surfaced only when calmer) --------------------------------
// "This has shown up around Monday mornings several times." - a real
// day-of-week recurrence, never a fabricated trend from a couple of logs.
// Never introduced during the acute spike itself.

export interface SessionTimeEntry {
  dayOfWeek: number; // 0 = Sunday, per Date#getDay()
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const MIN_SESSIONS_FOR_PATTERN_ESCALATION = 3;

export const detectRecurringDayPattern = (entries: SessionTimeEntry[]): string | null => {
  if (entries.length < MIN_SESSIONS_FOR_PATTERN_ESCALATION) return null;
  const counts = new Map<number, number>();
  entries.forEach((e) => counts.set(e.dayOfWeek, (counts.get(e.dayOfWeek) || 0) + 1));
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [day, count] = sorted[0];
  if (count >= MIN_SESSIONS_FOR_PATTERN_ESCALATION && count / entries.length >= 0.5) {
    return DAY_LABELS[day];
  }
  return null;
};

export type PatternEscalationRoute = 'energy_delta' | 'workload_reality_check' | 'decompression_doorway' | 'one_less_thing' | 'rediscovery' | 'talk_to_nova';

export const PATTERN_ESCALATION_ROUTE_LABELS: Record<PatternEscalationRoute, string> = {
  energy_delta: 'Energy Delta',
  workload_reality_check: 'Workload Reality Check',
  decompression_doorway: 'Decompression Doorway',
  one_less_thing: 'One Less Thing',
  rediscovery: 'Rediscovery',
  talk_to_nova: 'Talk to Nova',
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
  'disarm the amygdala', 'amygdala shutdown', 'executive control restoration', 'physiological trigger',
  'vaporise chaos', 'execute hard incineration', 'volatile memory buffer',
  'grounded in clinical anxiety-support techniques', 'all logs are encrypted', 'completely confidential',
  'never shared with b2b organisations', 'never shared', 'fully encrypted', 'total crisis', 'treats anxiety',
  'treats panic disorder', 'diagnoses gad', 'stops panic attacks', 'resets the nervous system',
  'measurable autonomic work', 'secure baseline restored', 'de-escalation stabilised',
  "that's irrational", "that's just anxiety", "that won't happen",
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
