// BOUNDARY RESILIENCE - pure content/logic behind "Practise the Pushback",
// one of the Capacity Firewall's flagship experiences. The goal is skill-
// building, never scoring: there is no numeric assertiveness grade
// anywhere in this module, and nothing here labels the other person as
// manipulative - these are named PATTERNS a request might arrive wrapped
// in, not accusations about a real person's character.

export type PushbackPattern =
  | 'urgency' | 'guilt' | 'authority' | 'minimisation' | 'quick_favour'
  | 'comparison' | 'repeated_asking' | 'silence' | 'disappointment' | 'unexpected_compromise';

export const PUSHBACK_PATTERN_ORDER: PushbackPattern[] = [
  'urgency', 'guilt', 'authority', 'minimisation', 'quick_favour',
  'comparison', 'repeated_asking', 'silence', 'disappointment', 'unexpected_compromise',
];

export const PUSHBACK_PATTERN_LABELS: Record<PushbackPattern, string> = {
  urgency: 'Urgency',
  guilt: 'Guilt',
  authority: 'Authority',
  minimisation: 'Minimisation',
  quick_favour: "\"It'll only take five minutes\"",
  comparison: 'Comparison with colleagues',
  repeated_asking: 'Repeated asking',
  silence: 'Silence',
  disappointment: 'Disappointment',
  unexpected_compromise: 'Unexpected compromise',
};

// A short line describing how Nova should ROLEPLAY that pattern - practice
// material for the rehearsal, never a claim about a real person's actual
// psychology or intent.
export const PUSHBACK_PATTERN_ROLEPLAY_HINT: Record<PushbackPattern, string> = {
  urgency: 'Push with real-sounding time pressure - "I need this right now."',
  guilt: 'Imply the user is letting someone down - "I thought I could count on you."',
  authority: 'Lean on hierarchy or seniority - "This comes from the top."',
  minimisation: 'Downplay the size of the ask - "This is such a small thing to ask."',
  quick_favour: "Frame the ask as trivial - \"It will only take five minutes.\"",
  comparison: 'Compare to how a colleague handles it - "Everyone else manages this fine."',
  repeated_asking: "Ask again, slightly reworded, as if the first answer didn't land.",
  silence: 'Go quiet for a beat, as if waiting the user out.',
  disappointment: 'Sound let down rather than angry.',
  unexpected_compromise: "Suddenly offer an unprompted compromise, to see if the user's actual ask quietly drops.",
};

// ---- "What might make you back down?" --------------------------------------
// Replaces "Guilt Triggers" - behavioural self-knowledge, never a
// personality diagnosis.

export type BackDownReason =
  | 'they_sound_disappointed' | 'they_push_again' | 'they_question_commitment' | 'i_feel_guilty'
  | 'i_over_explain' | 'i_worry_about_consequences' | 'authority_discomfort' | 'not_sure';

export const BACK_DOWN_REASON_ORDER: BackDownReason[] = [
  'they_sound_disappointed', 'they_push_again', 'they_question_commitment', 'i_feel_guilty',
  'i_over_explain', 'i_worry_about_consequences', 'authority_discomfort', 'not_sure',
];

export const BACK_DOWN_REASON_LABELS: Record<BackDownReason, string> = {
  they_sound_disappointed: 'They sound disappointed',
  they_push_again: 'They push again',
  they_question_commitment: 'They question my commitment',
  i_feel_guilty: 'I feel guilty',
  i_over_explain: 'I start over-explaining',
  i_worry_about_consequences: 'I worry about consequences',
  authority_discomfort: 'Authority makes me uncomfortable',
  not_sure: "I'm not sure",
};

export const WHAT_MIGHT_MAKE_YOU_BACK_DOWN_QUESTION = 'What might make you back down?';

// Tailors which pattern the rehearsal leans into, based on the user's own
// answer - never a diagnosis, just a practical starting point. "Not sure"
// defaults to the single most common pattern (urgency) rather than
// skipping tailoring altogether.
const BACK_DOWN_REASON_TO_PATTERN: Record<BackDownReason, PushbackPattern> = {
  they_sound_disappointed: 'disappointment',
  they_push_again: 'repeated_asking',
  they_question_commitment: 'guilt',
  i_feel_guilty: 'guilt',
  i_over_explain: 'silence',
  i_worry_about_consequences: 'authority',
  authority_discomfort: 'authority',
  not_sure: 'urgency',
};

export const recommendPushbackPattern = (reason: BackDownReason): PushbackPattern => BACK_DOWN_REASON_TO_PATTERN[reason];

// ---- Moment of cave + no-score closing --------------------------------------
// If the user gives up the boundary, Nova names the moment rather than
// scoring the attempt - no numeric assertiveness grade exists anywhere in
// this flow.

export const MOMENT_OF_CAVE_LINE = 'That was the moment the original trade-off disappeared.';

export type PushbackEndChoice = 'try_again' | 'show_options' | 'end_practice';

export const PUSHBACK_END_CHOICE_ORDER: PushbackEndChoice[] = ['try_again', 'show_options', 'end_practice'];

export const PUSHBACK_END_CHOICE_LABELS: Record<PushbackEndChoice, string> = {
  try_again: 'Try That Moment Again',
  show_options: 'Show My Options',
  end_practice: 'End Practice',
};

// ---- Companion-voice guardrail ------------------------------------------------
// Never calls the other person manipulative, never diagnoses the user's
// personality, never produces a numeric score.

export const PUSHBACK_BANNED_PHRASES: string[] = [
  'they are manipulative', 'manipulative person', 'toxic person', 'narcissist',
  'assertiveness score', 'you scored', 'out of 10', 'out of 100', 'percent assertive',
  'you failed', 'you are weak', 'personality disorder',
];

export const containsPushbackBannedPhrase = (text: string): boolean => {
  const lower = text.toLowerCase();
  return PUSHBACK_BANNED_PHRASES.some((p) => lower.includes(p));
};
