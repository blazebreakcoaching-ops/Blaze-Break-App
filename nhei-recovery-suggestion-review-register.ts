// NHEI PHASE 4B - RECOVERY SUGGESTION TEXT: INDEPENDENT REVIEW REGISTER
//
// Directive §7: "Prepare the actual recovery suggestion text for later
// substantive human review. Identify every user-visible explanation and
// its governing rule. Flag uncertain, diagnostic-sounding, causal,
// culturally narrow or age-inappropriate language. Do not mark the
// content approved through automated tests."
//
// This file is exactly that preparation - a static, inspectable list of
// every user-visible string nhei-recovery-bridge.ts's six rules can
// produce, each tagged with the rule that governs it and an HONEST,
// non-approving set of flags a human reviewer should look at first. The
// flags here are this phase's own best-effort read of the text, not a
// clinical, cultural, or developmental judgement - they exist to save a
// real reviewer time, not to substitute for one. NOTHING in this file or
// its test marks any entry "approved," "reviewed," or "safe" - there is
// no such field anywhere in NheiRecoverySuggestionReviewEntry.
//
// DRIFT GUARD: nhei-recovery-suggestion-review-register.test.ts actually
// runs buildNheiRecoverySuggestions against a fixture engineered to
// trigger each rule and asserts the live reason/explanationForUser match
// this file's own recorded text exactly - so this register cannot
// silently go stale against the real rule text the way a free-standing
// document could.
//
// OFFLINE AT THIS PHASE: data only, imported by nothing but its own test.

export type NheiRecoverySuggestionReviewFlag =
  | 'uncertain_phrasing'
  | 'potentially_diagnostic_sounding'
  | 'causal_sounding'
  | 'culturally_narrow'
  | 'age_appropriateness_unverified';

export interface NheiRecoverySuggestionReviewEntry {
  governingRule: string; // the exact function name in nhei-recovery-bridge.ts
  targetModule: string;
  reason: string;
  explanationForUser: string;
  flags: NheiRecoverySuggestionReviewFlag[];
  // This phase's own one-line note on WHY each flag was raised - for the
  // reviewer's convenience, never a substitute for their own judgement.
  reviewerNote: string;
}

export const NHEI_RECOVERY_SUGGESTION_REVIEW_REGISTER: NheiRecoverySuggestionReviewEntry[] = [
  {
    governingRule: 'ruleBoundaryRelated',
    targetModule: 'boundary_architect',
    reason: 'A repeated pattern involving how you respond to other people has come up in what you’ve described.',
    explanationForUser:
      'You’ve described something similar happening more than once in situations with other people. ' +
      'This is Nova noticing a pattern across what you’ve shared, not a fact about you or about anyone else - ' +
      'Boundary Architect is a tool for practising how you respond when this comes up again, if that would help.',
    flags: ['culturally_narrow', 'age_appropriateness_unverified'],
    reviewerNote:
      '"Boundary" framing is itself a culturally situated coaching concept (individualistic/Western); the ' +
      'phrase may not translate cleanly for every background. Youth-appropriateness of this text has not been ' +
      'separately assessed.',
  },
  {
    governingRule: 'ruleDifficultySettling',
    targetModule: 'reset_studio',
    reason: 'You’ve confirmed an emotional experience that’s made it harder to settle.',
    explanationForUser:
      'You told Nova this affected how you felt, and that’s confirmed, not a guess. What it means for what ' +
      'might help is still Nova’s own suggestion, not something you’ve confirmed - Reset Studio offers a few ' +
      'short ways to settle, matched to how this actually feels for you.',
    flags: ['causal_sounding', 'age_appropriateness_unverified'],
    reviewerNote:
      'The REASON sentence ("that’s made it harder to settle") reads as asserting the emotional experience ' +
      'caused the settling difficulty, even though the fuller explanationForUser immediately clarifies that the ' +
      'tagging, not the causal story, is what’s confirmed. Worth a reviewer’s eye on whether the short ' +
      '"reason" string alone (e.g. if ever shown without the fuller explanation) could overstate certainty.',
  },
  {
    governingRule: 'ruleShortGroundingRequest',
    targetModule: 'anxiety_reset',
    reason: 'You asked for something quick, and an emotional-dimension signal is present.',
    explanationForUser:
      'You said you wanted something short right now, so Nova is only offering something that fits that - ' +
      'a brief grounding step, not a longer programme.',
    flags: ['age_appropriateness_unverified'],
    reviewerNote: 'Plain, low-risk phrasing. Youth-appropriateness not separately assessed.',
  },
  {
    governingRule: 'ruleActionWithStatedGoal',
    targetModule: 'action_engine',
    reason: 'You said you want to work on this, and a repeated pattern is already visible.',
    explanationForUser:
      'You’ve told Nova you want to actually change something here, and you’ve described this happening more ' +
      'than once. Action Engine is for turning an understood pattern into one small, testable change - entirely ' +
      'on your terms.',
    flags: ['age_appropriateness_unverified'],
    reviewerNote: 'Plain, low-risk phrasing. Youth-appropriateness not separately assessed.',
  },
  {
    governingRule: 'ruleRecoveryFoundationLow',
    targetModule: 'energy_delta',
    reason: 'A physical-dimension signal (e.g. fatigue) is present in what you’ve described.',
    explanationForUser:
      'You’ve described something in this physical territory - tiredness, depleted energy, that kind of thing. ' +
      'Nova doesn’t know what’s causing it, and isn’t claiming to - Energy & Capacity is a place to look at your ' +
      'current load against what you actually have available, which sometimes helps regardless of the underlying cause.',
    flags: ['age_appropriateness_unverified'],
    reviewerNote:
      'Explicitly disclaims causation ("Nova doesn’t know what’s causing it"); this is the strongest-worded ' +
      'uncertainty disclaimer of the six. Youth-appropriateness not separately assessed.',
  },
  {
    governingRule: 'ruleGeneralRepeatedPattern',
    targetModule: 'my_patterns',
    reason: 'A recurring pattern is visible across what you’ve shared.',
    explanationForUser:
      'This has come up more than once in what you’ve told Nova. That’s worth noticing, not necessarily acting ' +
      'on right now - My Patterns is a place to look at it more closely if and when you want to.',
    flags: ['age_appropriateness_unverified'],
    reviewerNote: 'Plain, low-risk phrasing. Youth-appropriateness not separately assessed.',
  },
];
