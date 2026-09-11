// GAD-7 (Generalized Anxiety Disorder 7-item scale) - pure scoring logic,
// kept I/O-free and unit-tested. Same pattern as the other logic modules.
//
// IMPORTANT framing, enforced by how this is worded and used:
// - GAD-7 is a validated SELF-REPORT SCREENING tool, not a diagnosis. It is
//   the user rating themselves against 7 standard questions over the last two
//   weeks - never Nova or the app inferring anyone's state. That's what keeps
//   it compatible with this app's no-inference principle.
// - A person's GAD-7 result is strictly PRIVATE to them. It must never be fed
//   into any org/aggregate view. There is deliberately no org path for it.
// - The scale and cut-points here are the standard published ones (Spitzer et
//   al., 2006). GAD-7 is free to use without permission.

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

// The standard (unscored) functional-impairment follow-up. Stored for context
// but never added to the score, exactly as the instrument specifies.
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

// Validates that answers are exactly 7 integers in 0..3.
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

const SEVERITY_LABEL: Record<Gad7Severity, string> = {
  minimal: 'Minimal anxiety',
  mild: 'Mild anxiety',
  moderate: 'Moderate anxiety',
  severe: 'Severe anxiety',
};

const SEVERITY_SUMMARY: Record<Gad7Severity, string> = {
  minimal: 'Your answers point to minimal anxiety symptoms over the last two weeks.',
  mild: 'Your answers point to mild anxiety symptoms over the last two weeks. Worth keeping an eye on how this trends.',
  moderate: 'Your answers point to a moderate level of anxiety symptoms over the last two weeks. This is a common point at which talking to a professional can genuinely help.',
  severe: 'Your answers point to a high level of anxiety symptoms over the last two weeks. Please consider reaching out to a professional or someone you trust - you do not have to manage this alone.',
};

export function interpretGad7(score: number): Gad7Result {
  const severity = severityForScore(score);
  return {
    score,
    severity,
    severityLabel: SEVERITY_LABEL[severity],
    summary: SEVERITY_SUMMARY[severity],
    suggestsSupport: score >= 10,
  };
}

export interface Gad7ScoreRecord { score: number; createdAt: string }

export type Gad7TrendDirection = 'improving' | 'worsening' | 'stable' | 'unknown';

export interface Gad7Trend {
  direction: Gad7TrendDirection;
  delta: number | null; // current minus previous; negative = improving (fewer symptoms)
  note: string;
}

// Compares the most recent two scores to describe change over time. Lower is
// better for GAD-7, so a drop is "improving". A change of fewer than 2 points
// is treated as "stable" rather than over-reading normal fluctuation.
export function computeGad7Trend(history: Gad7ScoreRecord[]): Gad7Trend {
  const valid = history.filter((h) => h && Number.isFinite(h.score) && typeof h.createdAt === 'string');
  if (valid.length < 2) return { direction: 'unknown', delta: null, note: 'Take this a couple of times to start seeing a trend.' };
  const sorted = valid.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const current = sorted[0].score;
  const previous = sorted[1].score;
  const delta = current - previous;
  if (Math.abs(delta) < 2) return { direction: 'stable', delta, note: 'About the same as last time.' };
  if (delta < 0) return { direction: 'improving', delta, note: `Down ${Math.abs(delta)} points since last time - fewer symptoms.` };
  return { direction: 'worsening', delta, note: `Up ${delta} points since last time. If this keeps climbing, consider reaching out for support.` };
}
