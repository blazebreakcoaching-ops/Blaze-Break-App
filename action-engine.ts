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
