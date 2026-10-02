// Pure, deterministic logic behind the Rediscovery Layer. This is a
// coaching layer, never a personality test, questionnaire or diagnostic
// tool (REDISCOVERY LAYER). Every helper here either asks a question or
// raises a hypothesis for the user to confirm - nothing in this file ever
// produces a conclusion, a label or a diagnosis on its own (PATTERN TO
// QUESTION RULE, NOVA AS A MIRROR).

// ---- Insight states ---------------------------------------------------
// INSIGHT STATES: tentative interpretation is never presented as fact.

export type InsightState = 'nova_noticed' | 'user_confirmed' | 'still_exploring' | 'rejected' | 'archived';

export const INSIGHT_STATE_LABELS: Record<InsightState, string> = {
  nova_noticed: 'Nova noticed',
  user_confirmed: 'Confirmed',
  still_exploring: 'Still exploring',
  rejected: 'Not a fit',
  archived: 'Archived',
};

export type RediscoverySection =
  | 'what_matters'
  | 'what_drains'
  | 'what_restores'
  | 'what_carrying'
  | 'what_relearning'
  | 'what_want_back'
  | 'what_leave_behind'
  | 'experiments';

export const REDISCOVERY_SECTION_ORDER: RediscoverySection[] = [
  'what_matters', 'what_drains', 'what_restores', 'what_carrying',
  'what_relearning', 'what_want_back', 'what_leave_behind', 'experiments',
];

export const REDISCOVERY_SECTION_LABELS: Record<RediscoverySection, string> = {
  what_matters: 'What Matters to Me',
  what_drains: 'What Drains Me',
  what_restores: 'What Restores Me',
  what_carrying: "What I'm Carrying",
  what_relearning: "What I'm Relearning",
  what_want_back: 'What I Want Back',
  what_leave_behind: "What I'm Ready to Leave Behind",
  experiments: "Experiments I'm Trying",
};

export interface RediscoveryInsight {
  id: string;
  section: RediscoverySection;
  text: string;
  state: InsightState;
  source: string; // which tool/pattern produced it, or 'user' for self-authored
  createdAt: string;
  updatedAt: string;
}

// ---- User confirmation of a noticed pattern ---------------------------
// USER CONFIRMATION: "Does this feel true?" - only a clear "yes" (or the
// user's own words) is ever allowed to become established information.

export type ConfirmationAnswer = 'yes' | 'partly' | 'no' | 'explore';

export const CONFIRMATION_OPTIONS: { id: ConfirmationAnswer; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'partly', label: 'Partly' },
  { id: 'no', label: 'No' },
  { id: 'explore', label: 'Explore this' },
];

export const nextStateForConfirmation = (answer: ConfirmationAnswer): InsightState => {
  if (answer === 'yes') return 'user_confirmed';
  if (answer === 'no') return 'rejected';
  return 'still_exploring'; // 'partly' and 'explore' both stay tentative
};

// ---- Quiet Questions ---------------------------------------------------
// QUIET QUESTIONS: sparing, one at a time, never surfaced randomly.

export interface QuietQuestion {
  id: string;
  text: string;
}

export const QUIET_QUESTIONS: QuietQuestion[] = [
  { id: 'qq_dependable', text: 'When did being dependable start meaning being permanently available?' },
  { id: 'qq_stopped', text: 'What have you stopped doing because there was always something more important?' },
  { id: 'qq_choose_vs_expected', text: 'What are you carrying because you genuinely choose it — and what are you carrying because it feels expected?' },
  { id: 'qq_nobody_disappointed', text: 'If nobody was disappointed with you, what would you stop doing?' },
  { id: 'qq_miss_yourself', text: 'What do you miss about yourself?' },
  { id: 'qq_feel_yourself', text: 'Where do you feel most like yourself lately?' },
  { id: 'qq_postponed', text: 'What keeps getting postponed whenever everybody else needs something?' },
  { id: 'qq_choose_again', text: 'Which part of your current life would you actively choose again today?' },
  { id: 'qq_protecting', text: 'What are you protecting that actually deserves protecting?' },
  { id: 'qq_outgrown', text: 'What have you outgrown but not yet given yourself permission to leave?' },
];

// Deterministic rotation through the whole bank rather than a hidden
// Math.random() - still never repeats back-to-back, and every question
// eventually surfaces instead of a few dominating by chance.
export const pickNextQuietQuestion = (lastShownId: string | null): QuietQuestion => {
  if (!lastShownId) return QUIET_QUESTIONS[0];
  const idx = QUIET_QUESTIONS.findIndex((q) => q.id === lastShownId);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % QUIET_QUESTIONS.length;
  return QUIET_QUESTIONS[nextIdx];
};

// NOVA SHOULD KNOW WHEN NOT TO GO DEEPER: stabilise first. A Quiet
// Question (or any deeper reflective prompt) should never be offered
// while the user is highly overloaded or has asked for immediate
// practical help - only once things are stable enough to look further.
export interface ReflectionReadiness {
  capacityLow: boolean | null;
  energyDeltaNegative: boolean | null;
  requestedPracticalHelp: boolean;
}

export const isReadyForDeeperReflection = (ctx: ReflectionReadiness): boolean => {
  if (ctx.requestedPracticalHelp) return false;
  if (ctx.capacityLow === true && ctx.energyDeltaNegative === true) return false;
  return true;
};

// ---- One Less Thing: "Why was this on your plate?" --------------------
// ONE LESS THING - DEEPER QUESTIONING: occasional, never every time.

export type PlateReasonId =
  | 'i_chose_it' | 'someone_asked' | 'assumed_mine' | 'always_done_it'
  | 'dont_trust_others' | 'felt_guilty' | 'not_sure' | 'something_else';

export const PLATE_REASON_ORDER: PlateReasonId[] = [
  'i_chose_it', 'someone_asked', 'assumed_mine', 'always_done_it',
  'dont_trust_others', 'felt_guilty', 'not_sure', 'something_else',
];

export const PLATE_REASON_LABELS: Record<PlateReasonId, string> = {
  i_chose_it: 'I chose it',
  someone_asked: 'Someone asked me',
  assumed_mine: 'I assumed it was mine',
  always_done_it: "I've always done it",
  dont_trust_others: "I don't trust anyone else with it",
  felt_guilty: 'I felt guilty saying no',
  not_sure: "I'm not sure",
  something_else: 'Something else',
};

// Ask every third completion - frequent enough to build real signal,
// never so often that a one-button relief tool turns into a standing
// interrogation.
export const WHY_ON_PLATE_ASK_INTERVAL = 3;

export const shouldAskWhyOnPlate = (totalCompletionsBeforeThisOne: number): boolean =>
  (totalCompletionsBeforeThisOne + 1) % WHY_ON_PLATE_ASK_INTERVAL === 0;

// ---- Raw pattern clues --------------------------------------------------
// Clues are raw observations feeding a future reflective question -
// never themselves a diagnosis, and never auto-promoted into an insight
// without the user confirming it (REDISCOVERY CLUES).

export type RediscoveryClueSource =
  | 'one_less_thing_why'
  | 'workload_recurring_must_do'
  | 'one_less_thing_category_imbalance'
  | 'energy_delta_mismatch'
  | 'recovery_fuel_pattern'
  | 'quiet_question';

export interface RediscoveryClue {
  id: string;
  source: RediscoveryClueSource;
  prompt: string;
  answer: string;
  createdAt: string;
}

// ---- Cross-tool pattern detection (hypotheses, not conclusions) -------

export interface OneLessThingReductionRecord {
  category: 'professional' | 'social' | 'emotional' | 'logistical';
}

export const MIN_REDUCTIONS_FOR_CATEGORY_PATTERN = 5;
export const CATEGORY_DOMINANCE_RATIO = 0.7;

// ONE LESS THING AND REDISCOVERY: "You often choose to remove optional
// work tasks, but rarely personal commitments." Returns the dominant
// category only once there's a real sample and a genuine imbalance -
// null otherwise, so a thin history never implies a pattern.
export const detectOneLessThingCategoryImbalance = (
  records: OneLessThingReductionRecord[]
): OneLessThingReductionRecord['category'] | null => {
  if (records.length < MIN_REDUCTIONS_FOR_CATEGORY_PATTERN) return null;
  const counts: Record<string, number> = {};
  for (const r of records) counts[r.category] = (counts[r.category] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topCategory, topCount] = sorted[0];
  return topCount / records.length >= CATEGORY_DOMINANCE_RATIO
    ? (topCategory as OneLessThingReductionRecord['category'])
    : null;
};

export interface WorkloadCheckSnapshot {
  mustDoTitles: string[];
}

export const MIN_CHECKS_FOR_RECURRENCE_PATTERN = 3;
export const RECURRENCE_MATCH_THRESHOLD = 3;

// WORKLOAD REALITY CHECK — PATTERN LEARNING: "These keep returning as
// non-negotiables." Loose (trimmed, case-insensitive) title matching is a
// deliberate simplification - good enough to notice real recurrence
// without building a text-similarity engine for a reflective nudge.
export const detectRecurringMustDo = (snapshots: WorkloadCheckSnapshot[]): string | null => {
  if (snapshots.length < MIN_CHECKS_FOR_RECURRENCE_PATTERN) return null;
  const counts: Record<string, number> = {};
  for (const snap of snapshots) {
    const seenThisSnapshot = new Set<string>();
    for (const raw of snap.mustDoTitles) {
      const key = raw.trim().toLowerCase();
      if (!key || seenThisSnapshot.has(key)) continue;
      seenThisSnapshot.add(key);
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  const [title, count] = sorted[0];
  return count >= RECURRENCE_MATCH_THRESHOLD ? title : null;
};

// REDISCOVERY AND ENERGY DELTA: "Your load has exceeded your reported
// capacity several times this week, but you've only removed one
// commitment." A real mismatch count compared against a real reduction
// count - never an invented percentage.
export const detectCapacityMismatchWithoutReduction = (
  mismatchCount: number,
  reductionCount: number
): boolean => mismatchCount >= 3 && reductionCount <= 1;

// ---- Rediscovery experiments --------------------------------------------
// REDISCOVERY EXPERIMENTS: small, optional, specific, reversible - never
// gamified (NO REDISCOVERY GAMIFICATION).

export interface ExperimentTemplate {
  id: string;
  insightKeyword: string;
  text: string;
}

export const EXPERIMENT_TEMPLATES: ExperimentTemplate[] = [
  { id: 'protect_time', insightKeyword: 'protect time for myself', text: 'Protect 30 minutes this week for something you choose simply because you want it.' },
  { id: 'check_before_yes', insightKeyword: 'say yes before checking capacity', text: 'For one week, answer non-urgent requests with: "Let me check and come back to you."' },
  { id: 'creativity', insightKeyword: 'miss creativity', text: 'Spend 15 minutes doing something creative with no productivity objective.' },
];

export const GENERIC_EXPERIMENT_PROMPT =
  'What is one small, optional, specific, reversible experiment you could try this week, based on this?';

// Simple keyword match against the fixed template library - deliberately
// not a generative suggestion engine; falls back to the generic prompt
// when nothing matches rather than inventing something off-topic.
export const suggestExperimentForInsight = (insightText: string): string => {
  const lower = insightText.toLowerCase();
  const match = EXPERIMENT_TEMPLATES.find((t) => lower.includes(t.insightKeyword));
  return match ? match.text : GENERIC_EXPERIMENT_PROMPT;
};
