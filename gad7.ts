// GAD-7 (Generalized Anxiety Disorder 7-item scale) - pure scoring logic,
// kept I/O-free and unit-tested. Same pattern as the other logic modules.
//
// CORE DISTINCTION: Anxiety Check-in answers "what have the last two weeks
// actually looked like?" - a stable, versioned snapshot instrument. It is
// NOT Anxiety Reset ("what do I need right now?") and it does not try to
// explain cause or predict the future. Blaze Break intelligence (trend
// language, context, Nova) belongs AROUND this instrument, never inside it.
//
// IMPORTANT framing, enforced by how this is worded and used:
// - GAD-7 is a validated SELF-REPORT SCREENING tool, not a diagnosis. It is
//   the user rating themselves against 7 standard questions over the last two
//   weeks - never Nova or the app inferring anyone's state.
// - The seven items, response options, two-week timeframe and scoring rules
//   are LOCKED, versioned, deterministic content - never dynamically
//   rewritten by Nova or an LLM, and never scored by LLM interpretation.
// - A person's GAD-7 result is strictly PRIVATE to them. It must never be fed
//   into any org/aggregate view. There is deliberately no org path for it.
// - The scale and cut-points here are the standard published ones (Spitzer et
//   al., 2006). GAD-7 is free to use without permission.

export const GAD7_ASSESSMENT_NAME = 'GAD-7';

// Version-controlled: question wording, response options, timeframe and
// scoring rules below must not change without bumping this and going
// through the clinical/content governance review the spec calls for -
// never an ordinary UI copy edit.
export const GAD7_ASSESSMENT_VERSION = '1.0.0';

export const GAD7_QUESTIONS: string[] = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  "Being so restless that it's hard to sit still",
  'Becoming easily annoyed or irritable',
  'Feeling afraid, as if something awful might happen',
];

// The four standard response options, scored 0-3.
export const GAD7_OPTIONS: { label: string; value: number }[] = [
  { label: 'Not at all', value: 0 },
  { label: 'Several days', value: 1 },
  { label: 'More than half the days', value: 2 },
  { label: 'Nearly every day', value: 3 },
];

export const GAD7_TIMEFRAME = 'Over the last 2 weeks';

// The standard (unscored) functional-impairment follow-up. Stored and
// compared separately - never added to the 0-21 total, exactly as the
// instrument specifies.
export const GAD7_IMPAIRMENT_QUESTION =
  "If you checked off any problems, how difficult have they made it to do your work, take care of things at home, or get along with other people?";
export const GAD7_IMPAIRMENT_OPTIONS = ['Not difficult at all', 'Somewhat difficult', 'Very difficult', 'Extremely difficult'];

export type Gad7Severity = 'minimal' | 'mild' | 'moderate' | 'severe';

export interface Gad7Result {
  score: number; // 0-21
  severity: Gad7Severity;
  severityLabel: string;
  // Descriptive, non-diagnostic summary the UI can show.
  summary: string;
  // True when the score reaches the standard threshold (>=10) where the
  // instrument's guidance is that further evaluation by a professional is
  // warranted. Drives a supportive nudge, never an alarm or a diagnosis.
  suggestsSupport: boolean;
}

// Validates a COMPLETE submission: exactly 7 integers in 0..3. A draft/
// in-progress check-in never reaches this - see isGad7Complete below.
export function isValidGad7Answers(answers: unknown): answers is number[] {
  return (
    Array.isArray(answers) &&
    answers.length === 7 &&
    answers.every((a) => Number.isInteger(a) && a >= 0 && a <= 3)
  );
}

export function scoreGad7(answers: number[]): number {
  if (!isValidGad7Answers(answers)) throw new Error('GAD-7 needs exactly 7 answers, each 0-3.');
  return answers.reduce((sum, a) => sum + a, 0);
}

export function severityForScore(score: number): Gad7Severity {
  if (score <= 4) return 'minimal';
  if (score <= 9) return 'mild';
  if (score <= 14) return 'moderate';
  return 'severe';
}

// Framed as descriptive GAD-7 symptom-score bands, not diagnostic labels -
// "High symptom level" rather than "Severe anxiety", so the band itself
// never reads as a clinical verdict.
const SEVERITY_LABEL: Record<Gad7Severity, string> = {
  minimal: 'Minimal symptoms',
  mild: 'Mild symptoms',
  moderate: 'Moderate symptoms',
  severe: 'High symptom level',
};

const SEVERITY_SUMMARY: Record<Gad7Severity, string> = {
  minimal: 'Your answers point to minimal anxiety symptoms over the last two weeks.',
  mild: 'Your answers point to mild anxiety symptoms over the last two weeks. Worth keeping an eye on how this trends.',
  moderate: 'Your answers point to a moderate level of anxiety symptoms over the last two weeks. This is a common point at which talking to a professional can genuinely help.',
  severe: 'Your answers point to a high level of anxiety symptoms over the last two weeks. Please consider reaching out to a professional or someone you trust - you do not have to manage this alone.',
};

// YOUTH EXPERIENCE: the arithmetic score and bands stay the same validated
// instrument, but under-18 interpretation copy must not apply adult
// severity-label framing or unsupported medical language. This is
// deliberately plainer and names a trusted adult rather than "a
// professional" at the top band.
const YOUTH_SEVERITY_SUMMARY: Record<Gad7Severity, string> = {
  minimal: "Your answers show anxiety symptoms haven't been coming up much over the last two weeks.",
  mild: 'Your answers show anxiety symptoms have been coming up sometimes over the last two weeks.',
  moderate: 'Your answers show anxiety symptoms have been coming up regularly over the last two weeks.',
  severe: 'Your answers show anxiety symptoms have been coming up often over the last two weeks. It could help to talk to a trusted adult or an appropriate professional about this.',
};

export type Gad7Audience = 'adult' | 'youth';

// Before launch, youth interpretation language and thresholds should
// receive separate professional/content governance review, per the spec -
// this function is where that reviewed copy would live.
export const interpretGad7ForAudience = (score: number, audience: Gad7Audience): Gad7Result => {
  const severity = severityForScore(score);
  return {
    score,
    severity,
    severityLabel: SEVERITY_LABEL[severity],
    summary: audience === 'youth' ? YOUTH_SEVERITY_SUMMARY[severity] : SEVERITY_SUMMARY[severity],
    suggestsSupport: score >= 10,
  };
};

export function interpretGad7(score: number): Gad7Result {
  return interpretGad7ForAudience(score, 'adult');
}

// GAD-7 does not capture every anxiety experience (panic, social anxiety,
// specific fears, avoidance, trauma-related symptoms, etc.) - a low score
// is not "no anxiety problem exists."
export const GAD7_SCOPE_LIMITATION =
  "This check-in looks at one common pattern of anxiety symptoms. It doesn't tell the whole story.";

export const GAD7_NOT_A_DIAGNOSIS_LINE = 'This is information, not a diagnosis.';

export const GAD7_WHAT_THIS_MEANS =
  'This reflects how often these seven anxiety symptoms were reported over the previous two weeks.';

export const GAD7_WHAT_THIS_DOESNT_TELL_US =
  'This check-in does not diagnose an anxiety disorder or explain why you have been feeling this way. It also does not capture every possible anxiety experience.';

// ---- Completion status --------------------------------------------------
// Do not calculate a score, and do not create a trend entry, until all
// seven required items are answered. Missing answers are never treated as
// zero.

export type Gad7CompletionStatus = 'incomplete' | 'completed';

// A draft in progress uses -1 as "not yet answered" (consistent with the
// existing UI convention), never null-as-zero.
export const countGad7Answered = (draftAnswers: number[]): number => draftAnswers.filter((a) => a >= 0).length;

export const isGad7Complete = (draftAnswers: number[]): boolean =>
  draftAnswers.length === 7 && draftAnswers.every((a) => a >= 0);

// ---- Comparison with the previous check-in -------------------------------
// Cautious, non-arithmetic-percentage language. A small movement reads as
// "similar" rather than over-reading normal fluctuation; only a real,
// larger movement is described as higher/lower.

export type Gad7ComparisonDirection = 'higher' | 'lower' | 'similar' | 'unknown';

export interface Gad7Comparison {
  direction: Gad7ComparisonDirection;
  previousScore: number | null;
  currentScore: number;
  note: string;
}

// Do not overinterpret one-point or small short-term movements.
const SMALL_CHANGE_THRESHOLD = 2;

export const compareWithPreviousGad7 = (currentScore: number, previousScore: number | null): Gad7Comparison => {
  if (previousScore === null) {
    return {
      direction: 'unknown', previousScore: null, currentScore,
      note: 'This is your first check-in, so there is nothing to compare it with yet.',
    };
  }
  const delta = currentScore - previousScore;
  if (Math.abs(delta) < SMALL_CHANGE_THRESHOLD) {
    return { direction: 'similar', previousScore, currentScore, note: 'Your recent scores have been fairly similar.' };
  }
  if (delta > 0) {
    return { direction: 'higher', previousScore, currentScore, note: 'Your latest score is higher than your previous check-in.' };
  }
  return { direction: 'lower', previousScore, currentScore, note: 'Your latest score is lower than your previous check-in.' };
};

// ---- Functional impact comparison ----------------------------------------
// Compared separately from the score - never merged into it numerically.
// A similar score alongside rising everyday impact can matter even when
// the number alone looks unchanged.

export type Gad7ImpairmentChange = 'more' | 'less' | 'same' | 'unknown';

export const compareGad7Impairment = (current: number | null, previous: number | null): Gad7ImpairmentChange => {
  if (current === null || previous === null) return 'unknown';
  if (current > previous) return 'more';
  if (current < previous) return 'less';
  return 'same';
};

// Only speaks up when the score alone wouldn't tell the full story - a
// similar score with impact moving in either direction.
export const buildScoreAndImpairmentNote = (
  scoreDirection: Gad7ComparisonDirection,
  impairmentChange: Gad7ImpairmentChange
): string | null => {
  if (scoreDirection !== 'similar') return null;
  if (impairmentChange === 'more') {
    return "Your symptom score is similar to last time, but you're reporting more impact on everyday life.";
  }
  if (impairmentChange === 'less') {
    return "Your symptom score is similar to last time, and you're reporting less impact on everyday life.";
  }
  return null;
};

// ---- History trend (3+ completed check-ins) ------------------------------
// Stronger pattern language is only used once several completed check-ins
// show a real, CONSISTENT direction - never from one or two data points.

export interface Gad7ScoreRecord {
  score: number;
  createdAt: string;
}

export type Gad7HistoryTrendDirection = 'steady' | 'trending_lower' | 'trending_higher' | 'not_enough_data';

export interface Gad7HistoryTrend {
  direction: Gad7HistoryTrendDirection;
  note: string;
}

export const MIN_COMPLETED_FOR_HISTORY_TREND = 3;

export const GAD7_SNAPSHOT_REMINDER =
  'One score is a snapshot. The pattern - and how life is actually feeling - matters more.';

export const computeGad7HistoryTrend = (history: Gad7ScoreRecord[]): Gad7HistoryTrend => {
  const sorted = history.slice().sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (sorted.length < MIN_COMPLETED_FOR_HISTORY_TREND) {
    return { direction: 'not_enough_data', note: 'A few more check-ins will make a trend easier to see.' };
  }
  const recent = sorted.slice(-MIN_COMPLETED_FOR_HISTORY_TREND);
  const diffs: number[] = [];
  for (let i = 1; i < recent.length; i++) diffs.push(recent[i].score - recent[i - 1].score);
  const consistentlyDown = diffs.every((d) => d <= 0) && diffs.some((d) => d < 0);
  const consistentlyUp = diffs.every((d) => d >= 0) && diffs.some((d) => d > 0);
  if (consistentlyDown) return { direction: 'trending_lower', note: 'Your recent check-ins have been trending lower.' };
  if (consistentlyUp) return { direction: 'trending_higher', note: 'Your recent check-ins have been moving upward.' };
  return { direction: 'steady', note: 'Your recent check-ins have been fairly steady.' };
};

// PERSISTENCE/WORSENING + RECOVERY/IMPROVEMENT: only shown alongside a real
// 'trending_higher'/'trending_lower' result from computeGad7HistoryTrend
// above - never from a single score.
export const GAD7_PERSISTENT_WORSENING_LINE = 'Things seem to have been harder across several recent check-ins.';
export const GAD7_RECOVERY_LINE = 'Your recent check-ins have been lower.';
export const GAD7_RECOVERY_FOLLOWUP_QUESTION = "Anything you've been doing differently that feels worth keeping?";

// ---- "Why now?" context tags ----------------------------------------------
// Asked only AFTER the result, never part of GAD-7 scoring. Helps Blaze
// Break understand context without pretending the instrument identifies
// cause.

export type Gad7ContextTag =
  | 'work_pressure' | 'sleep' | 'relationships' | 'health_energy' | 'money_life_admin'
  | 'family_responsibilities' | 'major_change' | 'something_personal' | 'nothing_obvious' | 'prefer_not_to_say';

export const GAD7_CONTEXT_TAG_ORDER: Gad7ContextTag[] = [
  'work_pressure', 'sleep', 'relationships', 'health_energy', 'money_life_admin',
  'family_responsibilities', 'major_change', 'something_personal', 'nothing_obvious', 'prefer_not_to_say',
];

export const GAD7_CONTEXT_TAG_LABELS: Record<Gad7ContextTag, string> = {
  work_pressure: 'Work pressure',
  sleep: 'Sleep',
  relationships: 'Relationships',
  health_energy: 'Health / energy',
  money_life_admin: 'Money / life admin',
  family_responsibilities: 'Family responsibilities',
  major_change: 'Major change',
  something_personal: 'Something personal',
  nothing_obvious: 'Nothing obvious',
  prefer_not_to_say: "I'd rather not say",
};

export const GAD7_WHY_NOW_QUESTION = 'Anything been different over the last two weeks?';

// "Nothing obvious" and "I'd rather not say" are standalone answers -
// selecting either doesn't make sense alongside a specific factor.
export const EXCLUSIVE_GAD7_CONTEXT_TAGS: Gad7ContextTag[] = ['nothing_obvious', 'prefer_not_to_say'];

// ---- Fortnightly reminder cadence -----------------------------------------
// The instrument asks about the last two weeks, so fortnightly is the
// normal cadence - never a daily symptom-checking habit. All reminders are
// optional and pull-based (surfaced next time the user opens this tool),
// never a push promise this app doesn't keep.

export type Gad7ReminderChoice = 'two_weeks' | 'choose_other' | 'no_reminders';

export const GAD7_REMINDER_CHOICE_ORDER: Gad7ReminderChoice[] = ['two_weeks', 'choose_other', 'no_reminders'];

export const GAD7_REMINDER_CHOICE_LABELS: Record<Gad7ReminderChoice, string> = {
  two_weeks: 'Remind me in two weeks',
  choose_other: 'Choose another reminder',
  no_reminders: 'No reminders',
};

export const GAD7_FORTNIGHTLY_DAYS = 14;

export const shouldSuggestAnotherCheckIn = (nextSuggestedAt: string | null, now: Date = new Date()): boolean =>
  nextSuggestedAt !== null && now.getTime() >= Date.parse(nextSuggestedAt);

// ---- Acute anxiety gate ----------------------------------------------------
// Do not push the questionnaire while the user is clearly in an acute
// spike - a real, recent Anxiety Reset use is the signal, never a guess.

export const ACUTE_SIGNAL_WINDOW_MINUTES = 20;

export interface AcuteAnxietySignal {
  recentAnxietyResetSession: boolean;
}

export const shouldOfferAcuteAnxietyGate = (signal: AcuteAnxietySignal): boolean => signal.recentAnxietyResetSession;

// ---- "What would you like to do with this?" -------------------------------

export type Gad7NextAction = 'just_save' | 'understand_pattern' | 'talk_to_nova' | 'see_what_changed' | 'find_support' | 'done_for_now';

export const GAD7_NEXT_ACTION_ORDER: Gad7NextAction[] = [
  'just_save', 'understand_pattern', 'talk_to_nova', 'see_what_changed', 'find_support', 'done_for_now',
];

export const GAD7_NEXT_ACTION_LABELS: Record<Gad7NextAction, string> = {
  just_save: 'Just save it',
  understand_pattern: 'Understand the pattern',
  talk_to_nova: 'Talk it through with Nova',
  see_what_changed: 'See what may have changed',
  find_support: 'Find support',
  done_for_now: "I'm done for now",
};

// ---- Companion-voice / clinical-governance guardrail -----------------------
// Nova must never be the source of truth for scoring, and must never speak
// as though a number alone is a diagnosis.

export const GAD7_BANNED_PHRASES: string[] = [
  'you have generalised anxiety disorder', 'you have generalized anxiety disorder',
  'you are clinically anxious', 'you have severe anxiety', 'you have an anxiety disorder',
  'this diagnoses', 'diagnoses gad', 'completely confidential', 'never shared', 'fully encrypted',
  'your anxiety is worse by', 'improved by', "you've won", 'perfect consistency',
];

export const containsGad7BannedPhrase = (text: string): boolean => {
  const lower = text.toLowerCase();
  return GAD7_BANNED_PHRASES.some((p) => lower.includes(p));
};
