// ACTION ENGINE - pure, deterministic logic for turning a confirmed
// insight into something real. Sits downstream of the Rediscovery Layer
// (rediscovery-engine.ts): Nova notices something, the user confirms or
// rejects it there, and only once an insight is confirmed does the
// Action Engine ask "what are we going to try differently in real life?"
//
// Core discipline carried over from every other engine in this codebase:
// never force every insight into an action, never claim an AI inference
// is established truth, never use failure/streak/habit language, and
// never fabricate a value when there isn't enough real data to support it.

import {
  RediscoveryInsight, InsightState, RediscoveryClue,
  WorkloadCheckSnapshot, detectRecurringMustDo,
} from './rediscovery-engine';

// ---- Candidate insight surfacing ("Nova notices something") ---------------
// Two real, already-available signal sources - a genuine recurring pattern
// (Level 2) takes priority over a single raw remark (Level 1), and if
// neither exists there is nothing to surface. Never invents a pattern from
// a thin or absent history.

export type CandidateConfidenceLevel = 1 | 2;

export interface CandidateInsight {
  text: string;
  source: 'workload_recurring_must_do' | 'raw_clue';
  confidenceLevel: CandidateConfidenceLevel;
  clueId: string | null;
}

export const pickCandidateInsight = (
  workloadHistory: WorkloadCheckSnapshot[],
  recentClues: RediscoveryClue[]
): CandidateInsight | null => {
  const recurringMustDo = detectRecurringMustDo(workloadHistory);
  if (recurringMustDo) {
    return {
      text: `"${recurringMustDo}" keeps showing up as a must-do in your recent workload check-ins.`,
      source: 'workload_recurring_must_do',
      confidenceLevel: 2,
      clueId: null,
    };
  }
  const latestClue = recentClues[0];
  if (latestClue) {
    return { text: latestClue.answer, source: 'raw_clue', confidenceLevel: 1, clueId: latestClue.id };
  }
  return null;
};

// ---- Insight Card: is this worth acting on? --------------------------------
// Deliberately a different question from Rediscovery's "does this feel
// true?" confirmation - this one asks whether a true observation is worth
// turning into change, which is a separate decision the user gets to make.

export type ActionWorthinessAnswer = 'yes_change_it' | 'understand_first' | 'not_really' | 'not_now';

export const ACTION_WORTHINESS_ORDER: ActionWorthinessAnswer[] = [
  'yes_change_it', 'understand_first', 'not_really', 'not_now',
];

export const ACTION_WORTHINESS_LABELS: Record<ActionWorthinessAnswer, string> = {
  yes_change_it: "Yes — let's change it",
  understand_first: 'I want to understand it first',
  not_really: 'Not really',
  not_now: 'Not now',
};

export const ACTION_WORTHINESS_QUESTION = 'Does that feel worth working on?';

// Only a clear "yes" moves into the Controllability Gate. Everything else
// either stays exploratory or lands on the required "Nothing Needs Fixing"
// outcome - never silently promoted into an action.
export const shouldEnterControllabilityGate = (answer: ActionWorthinessAnswer): boolean => answer === 'yes_change_it';

export const leadsToNothingNeedsFixing = (answer: ActionWorthinessAnswer): boolean =>
  answer === 'not_really' || answer === 'not_now';

// ---- Controllability Gate ---------------------------------------------------

export type Controllability = 'mine_to_change' | 'can_influence' | 'depends_on_someone_else' | 'mostly_outside_control' | 'not_sure';

export const CONTROLLABILITY_ORDER: Controllability[] = [
  'mine_to_change', 'can_influence', 'depends_on_someone_else', 'mostly_outside_control', 'not_sure',
];

export const CONTROLLABILITY_LABELS: Record<Controllability, string> = {
  mine_to_change: 'Mine to change',
  can_influence: 'I can influence it',
  depends_on_someone_else: 'Depends on someone else',
  mostly_outside_control: 'Mostly outside my control',
  not_sure: "I'm not sure",
};

export const CONTROLLABILITY_QUESTION = 'How much of this is actually in your control?';

export const CONTROLLABILITY_GUIDANCE: Record<Controllability, string> = {
  mine_to_change: 'Focus on a behaviour you can directly perform.',
  can_influence: "Focus on communication, a request, negotiation, a boundary, your environment, or a choice — without assuming the other person will cooperate.",
  depends_on_someone_else: "Let's separate this into your part, their part, and what you'll do if they say no.",
  mostly_outside_control: 'This may not be something you can solve by trying harder.',
  not_sure: "That's alright — some things take a while to see clearly.",
};

// "Depends on someone else": never an experiment whose success depends
// entirely on the other person's behaviour - structured into three parts.
export interface SharedResponsibilityPlan {
  myPart: string;
  theirPart: string;
  ifTheySayNo: string;
}

export const SHARED_RESPONSIBILITY_PROMPTS: Record<keyof SharedResponsibilityPlan, string> = {
  myPart: "What's your part in this?",
  theirPart: "What's theirs?",
  ifTheySayNo: "What will you do if they say no?",
};

// "Mostly outside my control": never turned into a self-improvement task.
export type OutsideControlResponse =
  | 'reduce_impact' | 'protect_capacity' | 'ask_for_help' | 'accept_uncertainty' | 'change_what_can_change' | 'understand_it';

export const OUTSIDE_CONTROL_RESPONSE_ORDER: OutsideControlResponse[] = [
  'reduce_impact', 'protect_capacity', 'ask_for_help', 'accept_uncertainty', 'change_what_can_change', 'understand_it',
];

export const OUTSIDE_CONTROL_RESPONSE_LABELS: Record<OutsideControlResponse, string> = {
  reduce_impact: 'Reduce the impact',
  protect_capacity: 'Protect my capacity',
  ask_for_help: 'Ask for help',
  accept_uncertainty: 'Accept the uncertainty',
  change_what_can_change: "Change what I actually can",
  understand_it: 'Simply understand it',
};

export const OUTSIDE_CONTROL_LINE = 'This may not be something you can solve by trying harder.';

// Only two of the six responses have a real tool to hand off to; the rest
// are legitimate terminal outcomes that don't need a destination.
export const OUTSIDE_CONTROL_HANDOFF_TAB: Partial<Record<OutsideControlResponse, string>> = {
  protect_capacity: 'communicate',
  ask_for_help: 'communicate',
};

// ---- Nothing Needs Fixing (a required outcome, not a dead end) ------------

export const NOTHING_NEEDS_FIXING_LINE = 'This may be something worth understanding, not something you need to turn into a project.';

export type NothingNeedsFixingChoice = 'leave_it_here' | 'journal_about_it' | 'keep_noticing' | 'talk_to_nova';

export const NOTHING_NEEDS_FIXING_ORDER: NothingNeedsFixingChoice[] = [
  'leave_it_here', 'journal_about_it', 'keep_noticing', 'talk_to_nova',
];

export const NOTHING_NEEDS_FIXING_LABELS: Record<NothingNeedsFixingChoice, string> = {
  leave_it_here: 'Leave it here',
  journal_about_it: 'Journal about it',
  keep_noticing: 'Keep noticing',
  talk_to_nova: 'Talk to Nova',
};

// ---- Action Ladder ----------------------------------------------------------
// Every insight progresses only as far as useful - never pushed upward
// automatically.

export type ActionLadderLevel = 'notice' | 'try_once' | 'experiment' | 'protect' | 'default';

export const ACTION_LADDER_ORDER: ActionLadderLevel[] = ['notice', 'try_once', 'experiment', 'protect', 'default'];

export const ACTION_LADDER_LABELS: Record<ActionLadderLevel, string> = {
  notice: 'Notice',
  try_once: 'Try Once',
  experiment: 'Experiment',
  protect: 'Protect',
  default: 'Default',
};

export const ACTION_LADDER_DESCRIPTIONS: Record<ActionLadderLevel, string> = {
  notice: 'I keep doing this.',
  try_once: "Let's do something differently one time.",
  experiment: 'Try this for a few relevant situations.',
  protect: 'This seems useful. Want Blaze Break to help protect it?',
  default: 'This is becoming one of the ways you choose to live.',
};

// ---- Confidence / Evidence model --------------------------------------------
// Never jump directly from one observation to a confident personal
// conclusion - reused across the Action Engine as the shared vocabulary
// for how much real evidence actually backs a statement.

export type EvidenceLevel = 'one_time_observation' | 'possible_pattern' | 'user_confirmed_pattern' | 'behaviourally_supported';

export const EVIDENCE_LEVEL_ORDER: EvidenceLevel[] = [
  'one_time_observation', 'possible_pattern', 'user_confirmed_pattern', 'behaviourally_supported',
];

export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  one_time_observation: 'Something came up today',
  possible_pattern: "I've noticed this a few times",
  user_confirmed_pattern: 'You’ve said this feels true',
  behaviourally_supported: 'Your recent experiments have repeatedly shown this',
};

export const evidenceLevelForInsightState = (state: InsightState, confirmedExperimentCount: number): EvidenceLevel => {
  if (confirmedExperimentCount >= 3) return 'behaviourally_supported';
  if (state === 'user_confirmed') return 'user_confirmed_pattern';
  if (state === 'still_exploring') return 'possible_pattern';
  return 'one_time_observation';
};

// One active experiment at a time - this file only expresses the rule;
// the actual experiment record lives in a later batch.
export const ONE_ACTIVE_EXPERIMENT_LINE = "You already have something you're testing. Let's not turn recovery into another workload.";

export type ActiveExperimentConflictChoice = 'keep_current' | 'replace_it' | 'save_for_later';

export const ACTIVE_EXPERIMENT_CONFLICT_ORDER: ActiveExperimentConflictChoice[] = ['keep_current', 'replace_it', 'save_for_later'];

export const ACTIVE_EXPERIMENT_CONFLICT_LABELS: Record<ActiveExperimentConflictChoice, string> = {
  keep_current: 'Keep current experiment',
  replace_it: 'Replace it',
  save_for_later: 'Save this for later',
};

// ---- The confirmed-insight record, extended for the Action Engine --------
// Builds on Rediscovery's own RediscoveryInsight rather than duplicating
// it - the Action Engine only adds the resolution fields its own flow
// needs once an insight has been confirmed as worth acting on.

export interface ActionInsightRecord extends RediscoveryInsight {
  controllability: Controllability | null;
  sharedResponsibilityPlan: SharedResponsibilityPlan | null;
  outsideControlChoice: OutsideControlResponse | null;
  nothingNeedsFixingChoice: NothingNeedsFixingChoice | null;
}

// ---- Experiments ------------------------------------------------------------
// Experiments, not habits: default language throughout is "try", "test",
// "see what happens" - never "habit", "routine", "discipline" or "streak".
// An experiment means "we don't know yet whether this works for you."

export const TRY_ONCE_CTA = 'Try This Once';
export const EXPERIMENT_CTA = 'Start Experimenting';

export type ExperimentDuration = 'next_time' | 'this_week' | 'next_three_situations' | 'until_friday' | 'two_weeks';

export const EXPERIMENT_DURATION_ORDER: ExperimentDuration[] = [
  'next_time', 'this_week', 'next_three_situations', 'until_friday', 'two_weeks',
];

export const EXPERIMENT_DURATION_LABELS: Record<ExperimentDuration, string> = {
  next_time: 'Next time',
  this_week: 'This week',
  next_three_situations: 'Next three relevant situations',
  until_friday: 'Until Friday',
  two_weeks: 'Two weeks',
};

export const ENOUGH_DATA_EARLY_END_LABEL = "That's enough data";

// ---- Moment-of-Truth Plan -----------------------------------------------------
// Translates a vague intention into a specific cue and response - natural
// language, never robotic.

export const MOMENT_OF_TRUTH_PROMPT = "When X happens, I'll try Y.";
export const MOMENT_OF_TRUTH_CUE_PROMPT = "When does this usually come up?";
export const MOMENT_OF_TRUTH_RESPONSE_PROMPT = 'What will you actually say or do?';

export interface MomentOfTruthPlan {
  cue: string;
  response: string;
}

// ---- Friction Forecast ---------------------------------------------------------

export const FRICTION_FORECAST_QUESTION = "What's most likely to get in the way?";

export type FrictionType =
  | 'forget' | 'too_tired' | 'guilt' | 'pushback' | 'no_time'
  | 'environment' | 'dont_want_it' | 'overthink' | 'dont_know' | 'something_else';

export const FRICTION_TYPE_ORDER: FrictionType[] = [
  'forget', 'too_tired', 'guilt', 'pushback', 'no_time',
  'environment', 'dont_want_it', 'overthink', 'dont_know', 'something_else',
];

export const FRICTION_TYPE_LABELS: Record<FrictionType, string> = {
  forget: "I'll forget",
  too_tired: "I'll be too tired",
  guilt: "I'll feel guilty",
  pushback: 'Someone will push back',
  no_time: "I won't have time",
  environment: 'The environment makes it difficult',
  dont_want_it: "I'm not sure I actually want to do it",
  overthink: "I'll overthink it",
  dont_know: "I don't know",
  something_else: 'Something else',
};

// How the selected friction adapts the experiment - every friction type
// maps to exactly one real adjustment, never left to float unaddressed.
export type FrictionAdaptation =
  | 'lightweight_nudge' | 'prepare_aftercare' | 'communication_lab_rehearsal'
  | 'reduce_experiment_size' | 'context_change' | 'reconsider_experiment';

export const FRICTION_ADAPTATION_LABELS: Record<FrictionAdaptation, string> = {
  lightweight_nudge: 'A lightweight reminder',
  prepare_aftercare: 'Prepare aftercare for afterwards',
  communication_lab_rehearsal: 'Rehearse it in Communication Lab first',
  reduce_experiment_size: "Let's make this smaller",
  context_change: 'Change the environment first',
  reconsider_experiment: "Let's reconsider whether this is the right experiment",
};

export const FRICTION_ADAPTATION_FOR_TYPE: Record<FrictionType, FrictionAdaptation> = {
  forget: 'lightweight_nudge',
  too_tired: 'reduce_experiment_size',
  guilt: 'prepare_aftercare',
  pushback: 'communication_lab_rehearsal',
  no_time: 'reduce_experiment_size',
  environment: 'context_change',
  dont_want_it: 'reconsider_experiment',
  overthink: 'lightweight_nudge',
  dont_know: 'reconsider_experiment',
  something_else: 'reconsider_experiment',
};

export const FRICTION_ADAPTATION_HANDOFF_TAB: Partial<Record<FrictionAdaptation, string>> = {
  communication_lab_rehearsal: 'communicate',
  context_change: 'communicate',
};

// ---- Minimum Viable Change ------------------------------------------------------
// Every experiment should have a smaller fallback version - never marked
// as failed when capacity drops and the smaller version is used instead.

export const MINIMUM_VIABLE_CHANGE_PROMPT = 'What would the smaller, easier version of this look like?';
export const WANT_SMALLER_VERSION_TODAY_LINE = 'Want the smaller version today?';

// ---- The experiment record -----------------------------------------------------

export type ExperimentStatus = 'active' | 'completed' | 'abandoned';

export interface ExperimentRecord {
  id: string;
  insightId: string;
  text: string;
  ladderLevel: ActionLadderLevel;
  duration: ExperimentDuration | null;
  momentOfTruth: MomentOfTruthPlan | null;
  friction: FrictionType | null;
  minimumViableChange: string | null;
  status: ExperimentStatus;
  lastMomentChoice: MomentChoice | null;
  prediction: string | null;
  reality: string | null;
  reviewChoice: ReviewChoice | null;
  changeReason: ChangeReason | null;
  autopsyReason: AutopsyReason | null;
  createdAt: string;
  updatedAt: string;
}

export const ladderLevelForExperiment = (duration: ExperimentDuration | null): ActionLadderLevel =>
  duration === null ? 'try_once' : 'experiment';

export const hasActiveExperiment = (experiments: ExperimentRecord[]): boolean =>
  experiments.some((e) => e.status === 'active');

// ---- Moment of Choice --------------------------------------------------------
// A signature interaction: when a known recurring situation appears, the
// usual response is never punished - choosing it is always a legitimate
// answer, just one that's allowed to be noticed rather than hidden.

export const MOMENT_OF_CHOICE_LINE = 'This is one of those moments.';

export type MomentChoice = 'usual_response' | 'try_something_different';

export const MOMENT_CHOICE_ORDER: MomentChoice[] = ['usual_response', 'try_something_different'];

export const MOMENT_CHOICE_LABELS: Record<MomentChoice, string> = {
  usual_response: 'Usual response',
  try_something_different: 'Try something different',
};

// ---- Prediction vs Reality ----------------------------------------------------
// Compared carefully, never treated as universal proof from one event.

export const PREDICTION_QUESTION = 'What do you think will happen?';
export const REALITY_QUESTION = 'What actually happened?';

// ---- Review: Keep / Change / Drop / Not sure yet ------------------------------

export const REVIEW_QUESTION = 'What did you learn?';

export type ReviewChoice = 'keep' | 'change' | 'drop' | 'not_sure_yet';

export const REVIEW_CHOICE_ORDER: ReviewChoice[] = ['keep', 'change', 'drop', 'not_sure_yet'];

export const REVIEW_CHOICE_LABELS: Record<ReviewChoice, string> = {
  keep: 'Keep it',
  change: 'Change it',
  drop: 'Drop it',
  not_sure_yet: 'Not sure yet',
};

export type KeepFollowUp = 'try_longer' | 'protect_it' | 'make_default';

export const KEEP_FOLLOW_UP_ORDER: KeepFollowUp[] = ['try_longer', 'protect_it', 'make_default'];

export const KEEP_FOLLOW_UP_LABELS: Record<KeepFollowUp, string> = {
  try_longer: 'Try it a little longer',
  protect_it: 'Protect it',
  make_default: 'Make it one of my defaults',
};

export const CHANGE_REASON_QUESTION = "What needs changing?";

export type ChangeReason =
  | 'too_difficult' | 'wrong_timing' | 'too_much_effort' | 'too_vague'
  | 'someone_else_affected_it' | 'need_smaller_version' | 'didnt_feel_like_me';

export const CHANGE_REASON_ORDER: ChangeReason[] = [
  'too_difficult', 'wrong_timing', 'too_much_effort', 'too_vague',
  'someone_else_affected_it', 'need_smaller_version', 'didnt_feel_like_me',
];

export const CHANGE_REASON_LABELS: Record<ChangeReason, string> = {
  too_difficult: 'Too difficult',
  wrong_timing: 'Wrong timing',
  too_much_effort: 'Too much effort',
  too_vague: 'Too vague',
  someone_else_affected_it: 'Someone else affected it',
  need_smaller_version: 'I need a smaller version',
  didnt_feel_like_me: "It didn't feel like me",
};

// Never failure language - a dropped experiment is real, useful information.
export const DROP_LINE = 'Good to know. Not everything needs to become part of your life.';

export type NotSureYetFollowUp = 'try_once_more' | 'leave_it_open' | 'finish_for_now';

export const NOT_SURE_YET_FOLLOW_UP_ORDER: NotSureYetFollowUp[] = ['try_once_more', 'leave_it_open', 'finish_for_now'];

export const NOT_SURE_YET_FOLLOW_UP_LABELS: Record<NotSureYetFollowUp, string> = {
  try_once_more: 'Try once more',
  leave_it_open: 'Leave it open',
  finish_for_now: 'Finish for now',
};

// What happens to the experiment's status once reviewed - "change" and
// "not sure yet" are resolved by the caller alongside their own follow-up
// choice (e.g. "try longer" keeps it active; "protect it" completes it).
export const statusForReviewChoice = (choice: ReviewChoice): ExperimentStatus | null => {
  if (choice === 'drop') return 'abandoned';
  if (choice === 'keep') return 'completed';
  return null;
};

// ---- Change Autopsy: the experiment didn't happen -----------------------------
// Treated as useful information, never "you failed to complete your
// experiment."

export const CHANGE_AUTOPSY_QUESTION = "What got in the way?";

export type AutopsyReason =
  | 'forgot' | 'situation_didnt_happen' | 'no_capacity' | 'someone_else_changed_things'
  | 'felt_uncomfortable' | 'too_ambitious' | 'didnt_feel_useful' | 'changed_my_mind' | 'not_sure';

export const AUTOPSY_REASON_ORDER: AutopsyReason[] = [
  'forgot', 'situation_didnt_happen', 'no_capacity', 'someone_else_changed_things',
  'felt_uncomfortable', 'too_ambitious', 'didnt_feel_useful', 'changed_my_mind', 'not_sure',
];

export const AUTOPSY_REASON_LABELS: Record<AutopsyReason, string> = {
  forgot: 'I forgot',
  situation_didnt_happen: "The situation didn't happen",
  no_capacity: 'I had no capacity',
  someone_else_changed_things: 'Someone else changed things',
  felt_uncomfortable: 'I felt uncomfortable',
  too_ambitious: 'It was too ambitious',
  didnt_feel_useful: "It didn't feel useful",
  changed_my_mind: 'I changed my mind',
  not_sure: "I'm not sure",
};

// Every autopsy reason maps to exactly one real system response - never
// just another reminder.
export type AutopsyResponse =
  | 'reduce_demand' | 'offer_minimum_viable_change' | 'separate_action_from_response'
  | 'allow_experiment_to_end' | 'acknowledge';

export const AUTOPSY_RESPONSE_FOR_REASON: Record<AutopsyReason, AutopsyResponse> = {
  forgot: 'acknowledge',
  situation_didnt_happen: 'acknowledge',
  no_capacity: 'reduce_demand',
  someone_else_changed_things: 'separate_action_from_response',
  felt_uncomfortable: 'acknowledge',
  too_ambitious: 'offer_minimum_viable_change',
  didnt_feel_useful: 'allow_experiment_to_end',
  changed_my_mind: 'allow_experiment_to_end',
  not_sure: 'acknowledge',
};

export const AUTOPSY_RESPONSE_LABELS: Record<AutopsyResponse, string> = {
  reduce_demand: "Let's reduce what's being asked of you here, not just add a reminder.",
  offer_minimum_viable_change: 'Want to try the smaller version instead?',
  separate_action_from_response: "That's on them, not on what you did.",
  allow_experiment_to_end: "That's alright — we can end this one here.",
  acknowledge: "Thanks for the honesty — that's useful to know.",
};
