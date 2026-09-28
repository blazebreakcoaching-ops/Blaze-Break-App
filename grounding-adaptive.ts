// Phase 3's adaptive grounding engine - pure data/logic, no React/DOM/
// Firestore, shared between server.ts (context building) and the
// frontend (session-depth picker, adaptive question selection). Sits
// alongside grounding-patterns-taxonomy.ts (which owns WHAT themes exist)
// and owns HOW the experience adapts to capacity, history and feedback.
//
// Deliberately deterministic, not AI-generated: session-depth
// recommendations and prompt selection are both plain scoring functions
// over data already in the client's hands, so this costs no extra tokens
// and stays predictable/testable (same reasoning as Phase 2's
// rankIslamicThemesByRelevance/compareThemeShift).

import { PatternDimensionId } from './grounding-patterns-taxonomy';

// ---------- Session depth & capacity ----------

export type SessionDepth = 'reset' | 'ground' | 'deep';

export const SESSION_DEPTH_LABELS: Record<SessionDepth, { label: string; description: string }> = {
  reset: { label: 'Reset', description: 'A couple of minutes to settle.' },
  ground: { label: 'Ground', description: "Work through what's weighing on you." },
  deep: { label: 'Reflect deeply', description: "Make space to understand what's underneath." },
};

export type CapacityState = 'running_on_empty' | 'low_capacity' | 'some_space' | 'ready_to_reflect';

export const CAPACITY_LABELS: Record<CapacityState, string> = {
  running_on_empty: 'Running on empty',
  low_capacity: 'Low capacity',
  some_space: 'I have some space',
  ready_to_reflect: 'Ready to reflect',
};

// ---------- Session-depth recommendation ("Let Nova choose") ----------
// Deliberately conservative: only fires a recommendation when there's a
// real signal (very low capacity, or a repeated recent theme). Otherwise
// returns null so the UI falls back to its own default rather than
// fabricating a confident-sounding suggestion out of thin air. Never
// recommends 'deep' automatically - section 1's "Do not automatically
// force a deep session" - the user always has to choose that themselves.

export interface SessionDepthRecommendationInput {
  capacity: CapacityState | null;
  // The pattern dimension most present in what the user is carrying right
  // now, if any is known (e.g. from the current burden selection).
  recentPatternKey: PatternDimensionId | null;
  // How many sessions in roughly the last two weeks have touched that
  // same theme.
  recentSameThemeSessionCount: number;
}

export interface SessionDepthRecommendation {
  depth: SessionDepth;
  reason: string;
}

export const RECOMMEND_RESET_MIN_REPEAT_COUNT = 2;

export const getSessionDepthRecommendation = (
  input: SessionDepthRecommendationInput
): SessionDepthRecommendation | null => {
  if (input.capacity === 'running_on_empty') {
    return {
      depth: 'reset',
      reason: "You're running on empty right now - a short reset may be more useful than a longer session.",
    };
  }
  if (
    input.recentPatternKey &&
    input.recentSameThemeSessionCount >= RECOMMEND_RESET_MIN_REPEAT_COUNT &&
    (input.capacity === 'low_capacity' || input.capacity === null)
  ) {
    return {
      depth: 'reset',
      reason: "This looks similar to something you've been carrying recently. A short grounding may be enough today.",
    };
  }
  return null;
};

// ---------- Closing styles ----------

export type ClosingStyle = 'practical' | 'compassionate' | 'values' | 'faith_friendly' | 'islamic';

export const CLOSING_STYLES: Record<ClosingStyle, string> = {
  practical: 'You know your next step. Leave the rest until it becomes actionable.',
  compassionate: 'You do not have to resolve everything in one sitting.',
  values: 'Let the next action reflect what matters, not what fear demands.',
  faith_friendly: 'You have done what you can for now. Allow space for what is beyond you.',
  islamic: 'Take the means available to you, then allow the outcome to rest with Allah.',
};

// ---------- Adaptive question engine ----------

export interface AdaptivePrompt {
  promptKey: string;
  text: string;
}

// Four prompts per taxonomy dimension, in the same tentative, second-
// person voice as PATTERN_DIMENSIONS' descriptions - never a diagnosis,
// always a genuine, open question. promptKey is stable (dimension id +
// index) so prompt-history tracking survives content edits to `text`.
export const PROMPT_FAMILIES: Record<PatternDimensionId, AdaptivePrompt[]> = {
  control: [
    { promptKey: 'control_1', text: 'What part genuinely belongs to you?' },
    { promptKey: 'control_2', text: 'What outcome are you trying to guarantee?' },
    { promptKey: 'control_3', text: 'What would enough effort look like?' },
    { promptKey: 'control_4', text: 'What changes if you stop demanding certainty?' },
  ],
  uncertainty: [
    { promptKey: 'uncertainty_1', text: 'What can you actually know right now?' },
    { promptKey: 'uncertainty_2', text: "What would it look like to act without knowing how this ends?" },
    { promptKey: 'uncertainty_3', text: "What are you rehearsing that hasn't happened yet?" },
    { promptKey: 'uncertainty_4', text: 'What would waiting well look like here?' },
  ],
  over_responsibility: [
    { promptKey: 'over_responsibility_1', text: 'Who else has responsibility here?' },
    { promptKey: 'over_responsibility_2', text: 'What have you taken on that was never formally yours?' },
    { promptKey: 'over_responsibility_3', text: 'What would shared responsibility look like?' },
    { promptKey: 'over_responsibility_4', text: 'What happens if you do only your part?' },
  ],
  perfectionism: [
    { promptKey: 'perfectionism_1', text: 'What would "good enough" look like here?' },
    { promptKey: 'perfectionism_2', text: 'What is the actual consequence of leaving this unfinished today?' },
    { promptKey: 'perfectionism_3', text: 'Are you improving the outcome or trying to reduce discomfort?' },
    { promptKey: 'perfectionism_4', text: 'What standard are you holding yourself to?' },
  ],
  guilt_about_rest: [
    { promptKey: 'guilt_about_rest_1', text: 'What are you afraid rest might say about you?' },
    { promptKey: 'guilt_about_rest_2', text: 'Would you expect this pace from someone you care about?' },
    { promptKey: 'guilt_about_rest_3', text: 'What would responsible recovery look like today?' },
    { promptKey: 'guilt_about_rest_4', text: 'What are you protecting by refusing to stop?' },
  ],
  boundary_difficulty: [
    { promptKey: 'boundary_difficulty_1', text: 'What is the boundary you keep not setting?' },
    { promptKey: 'boundary_difficulty_2', text: 'What do you expect to happen if you hold it?' },
    { promptKey: 'boundary_difficulty_3', text: "What is it costing you to keep not holding it?" },
    { promptKey: 'boundary_difficulty_4', text: 'What would a boundary that is kind but firm sound like?' },
  ],
  fear_of_disappointing: [
    { promptKey: 'fear_of_disappointing_1', text: "Whose disappointment are you trying to avoid?" },
    { promptKey: 'fear_of_disappointing_2', text: 'What would happen if they were disappointed, briefly?' },
    { promptKey: 'fear_of_disappointing_3', text: 'Is this decision actually yours to make?' },
    { promptKey: 'fear_of_disappointing_4', text: "What matters more here - their comfort or what's sustainable for you?" },
  ],
  people_pleasing: [
    { promptKey: 'people_pleasing_1', text: "Whose comfort are you managing right now?" },
    { promptKey: 'people_pleasing_2', text: "What would you choose if no one's reaction mattered?" },
    { promptKey: 'people_pleasing_3', text: 'What is it costing you to keep everyone steady?' },
    { promptKey: 'people_pleasing_4', text: 'What would it look like to let someone else feel what they feel?' },
  ],
  isolation: [
    { promptKey: 'isolation_1', text: 'Who actually knows the full weight of this?' },
    { promptKey: 'isolation_2', text: "What's kept you from saying it out loud?" },
    { promptKey: 'isolation_3', text: 'What would change if one person knew?' },
    { promptKey: 'isolation_4', text: 'What are you protecting by carrying this alone?' },
  ],
  reluctance_to_ask_for_support: [
    { promptKey: 'reluctance_to_ask_for_support_1', text: "What's stopping you from asking?" },
    { promptKey: 'reluctance_to_ask_for_support_2', text: 'What would you tell someone else in your position to do?' },
    { promptKey: 'reluctance_to_ask_for_support_3', text: "What's the actual risk in asking?" },
    { promptKey: 'reluctance_to_ask_for_support_4', text: 'What would it mean about you if you asked?' },
  ],
  excessive_self_expectation: [
    { promptKey: 'excessive_self_expectation_1', text: 'What does the situation actually require of you?' },
    { promptKey: 'excessive_self_expectation_2', text: 'Where did this standard come from?' },
    { promptKey: 'excessive_self_expectation_3', text: 'What would you expect from someone else here?' },
    { promptKey: 'excessive_self_expectation_4', text: "What's the gap between what's needed and what you're demanding of yourself?" },
  ],
  work_identity: [
    { promptKey: 'work_identity_1', text: 'What are you worth on a day you produce nothing?' },
    { promptKey: 'work_identity_2', text: 'What would you still be, if the output stopped?' },
    { promptKey: 'work_identity_3', text: "Who are you when no one's measuring you?" },
    { promptKey: 'work_identity_4', text: 'What does "enough" look like separate from output?' },
  ],
  financial_pressure: [
    { promptKey: 'financial_pressure_1', text: "What part of this is actually within your control right now?" },
    { promptKey: 'financial_pressure_2', text: "What's one responsible next step, not the whole solution?" },
    { promptKey: 'financial_pressure_3', text: 'What are you carrying that belongs to a later date?' },
    { promptKey: 'financial_pressure_4', text: '"Enough for today" - what would that look like here?' },
  ],
  family_responsibility: [
    { promptKey: 'family_responsibility_1', text: 'What part of this is genuinely yours to carry?' },
    { promptKey: 'family_responsibility_2', text: 'What has been assumed rather than agreed?' },
    { promptKey: 'family_responsibility_3', text: 'What would asking for help here actually look like?' },
    { promptKey: 'family_responsibility_4', text: 'What are you doing out of love, and what out of guilt?' },
  ],
  conflict_avoidance: [
    { promptKey: 'conflict_avoidance_1', text: 'What conversation are you postponing?' },
    { promptKey: 'conflict_avoidance_2', text: 'What do you think will happen once that conversation actually happens?' },
    { promptKey: 'conflict_avoidance_3', text: 'What is avoiding it costing you?' },
    { promptKey: 'conflict_avoidance_4', text: 'What would saying it plainly, kindly, sound like?' },
  ],
  overcommitment: [
    { promptKey: 'overcommitment_1', text: "What did you say yes to that you didn't have room for?" },
    { promptKey: 'overcommitment_2', text: 'What would "no" have protected?' },
    { promptKey: 'overcommitment_3', text: 'What is one thing you could put down?' },
    { promptKey: 'overcommitment_4', text: 'What would enough commitments look like?' },
  ],
  comparison: [
    { promptKey: 'comparison_1', text: "Whose pace are you measuring yourself against?" },
    { promptKey: 'comparison_2', text: "What don't you know about what they're actually carrying?" },
    { promptKey: 'comparison_3', text: '"Enough" measured against your own life, not theirs - what would that look like?' },
    { promptKey: 'comparison_4', text: "What are you not seeing in your own progress?" },
  ],
  self_criticism: [
    { promptKey: 'self_criticism_1', text: 'Would you say that to someone you cared about?' },
    { promptKey: 'self_criticism_2', text: 'What is the kinder, equally honest version of that thought?' },
    { promptKey: 'self_criticism_3', text: 'What is this harshness trying to protect you from?' },
    { promptKey: 'self_criticism_4', text: 'What would it look like to hold yourself accountable without contempt?' },
  ],
  difficulty_accepting_unfinished_work: [
    { promptKey: 'difficulty_accepting_unfinished_work_1', text: 'What does "unfinished" actually cost, today?' },
    { promptKey: 'difficulty_accepting_unfinished_work_2', text: 'What would it mean to stop here, deliberately?' },
    { promptKey: 'difficulty_accepting_unfinished_work_3', text: 'What is the difference between abandoning something and pausing it?' },
    { promptKey: 'difficulty_accepting_unfinished_work_4', text: 'What can genuinely wait until tomorrow?' },
  ],
  difficulty_accepting_outcomes: [
    { promptKey: 'difficulty_accepting_outcomes_1', text: 'What part of how this turned out was actually within your control?' },
    { promptKey: 'difficulty_accepting_outcomes_2', text: 'What would it look like to let this be what it is?' },
    { promptKey: 'difficulty_accepting_outcomes_3', text: "What are you still trying to change that's already settled?" },
    { promptKey: 'difficulty_accepting_outcomes_4', text: 'What can you take from this without needing it to have gone differently?' },
  ],
  gratitude: [
    { promptKey: 'gratitude_1', text: "What's still steady, even now?" },
    { promptKey: 'gratitude_2', text: 'What would you miss if it were gone?' },
    { promptKey: 'gratitude_3', text: 'What is easy to take for granted here?' },
    { promptKey: 'gratitude_4', text: 'What is one thing, however small, worth naming?' },
  ],
  patience: [
    { promptKey: 'patience_1', text: 'What are you rushing that might need more time?' },
    { promptKey: 'patience_2', text: 'What would it look like to let this take as long as it takes?' },
    { promptKey: 'patience_3', text: 'What is the cost of forcing this faster than it can go?' },
    { promptKey: 'patience_4', text: 'What can you do today, and what has to wait?' },
  ],
  trust: [
    { promptKey: 'trust_1', text: 'What would it mean to trust the process here, even without seeing the outcome?' },
    { promptKey: 'trust_2', text: 'What have you done that was genuinely within your control?' },
    { promptKey: 'trust_3', text: "What are you still trying to control that you can't?" },
    { promptKey: 'trust_4', text: 'What would it take to let this rest, for now?' },
  ],
  compassion: [
    { promptKey: 'compassion_1', text: 'What would compassion for yourself look like right now?' },
    { promptKey: 'compassion_2', text: 'How would you treat someone else going through this?' },
    { promptKey: 'compassion_3', text: "What are you being hard on yourself for that doesn't deserve it?" },
    { promptKey: 'compassion_4', text: 'What would it look like to extend the same grace inward?' },
  ],
  connection: [
    { promptKey: 'connection_1', text: 'Who could you let in on this?' },
    { promptKey: 'connection_2', text: 'What would it look like to not do this entirely alone?' },
    { promptKey: 'connection_3', text: "What's kept you at a distance from people who'd want to help?" },
    { promptKey: 'connection_4', text: 'What would reaching out cost you, really?' },
  ],
  purpose: [
    { promptKey: 'purpose_1', text: 'Why does this actually matter to you?' },
    { promptKey: 'purpose_2', text: 'What would you be doing this for, if not for approval or fear?' },
    { promptKey: 'purpose_3', text: 'What is the version of this that still feels worth it?' },
    { promptKey: 'purpose_4', text: "What matters here beyond how it's received?" },
  ],
  values_conflict: [
    { promptKey: 'values_conflict_1', text: 'What two things do you care about that are pulling against each other here?' },
    { promptKey: 'values_conflict_2', text: 'If you had to choose, even temporarily, which matters more right now?' },
    { promptKey: 'values_conflict_3', text: 'What would honouring one look like without abandoning the other completely?' },
    { promptKey: 'values_conflict_4', text: 'What is the cost of trying to fully satisfy both at once?' },
  ],
};

// ---------- Question-fatigue prevention ----------

export interface PromptHistoryEntry {
  promptKey: string;
  lastShownAt: string; // ISO
  timesShown: number;
  userEngaged: number;
  userSkipped: number;
  helpfulRating?: 'helpful' | 'not_helpful' | null;
}

// A prompt shown within this window is treated as "recently seen" and
// heavily deprioritised, even if it was previously rated helpful - the
// brief's "avoid asking effectively the same question repeatedly" is
// about pacing, not permanently retiring a prompt that genuinely helps.
export const PROMPT_COOLDOWN_DAYS = 7;

// Deterministic scoring, not random selection, so the same inputs always
// produce the same choice (testable, and avoids the person noticing an
// arbitrary-feeling jump between sessions). Highest score wins:
//  - never shown before: strongly preferred (surfaces the full family
//    over time rather than converging on one or two prompts)
//  - previously marked helpful and off cooldown: preferred
//  - previously marked not helpful, or currently on cooldown: avoided
//  - otherwise: prefers the least-recently-shown, least-repeated prompt
export const selectAdaptivePrompt = (
  patternKey: PatternDimensionId,
  history: PromptHistoryEntry[]
): AdaptivePrompt => {
  const family = PROMPT_FAMILIES[patternKey];
  const now = Date.now();
  const historyByKey = new Map(history.map((h) => [h.promptKey, h]));

  const scored = family.map((prompt) => {
    const h = historyByKey.get(prompt.promptKey);
    if (!h) return { prompt, score: 1000 };
    const daysSinceShown = (now - new Date(h.lastShownAt).getTime()) / (24 * 60 * 60 * 1000);
    const onCooldown = daysSinceShown < PROMPT_COOLDOWN_DAYS;
    let score = 0;
    if (h.helpfulRating === 'helpful') score += 500;
    if (h.helpfulRating === 'not_helpful') score -= 1000;
    if (onCooldown) score -= 800;
    score += Math.min(daysSinceShown, 60);
    score -= h.timesShown * 2;
    return { prompt, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.prompt;
};

// ---------- Personal grounding profile (Firestore: users/{uid}/groundingProfile/main) ----------

export interface GroundingProfile {
  personalisationEnabled?: boolean;
  useHistoryForPersonalisation?: boolean;
  followUpOnPreviousActions?: boolean;
  usePreferredLens?: boolean;
  voiceGuidanceEnabled?: boolean;
  preferredSessionDepth?: SessionDepth;
  commonCapacityState?: CapacityState;
  helpfulPromptFamilies?: PatternDimensionId[];
  unhelpfulPromptFamilies?: PatternDimensionId[];
  helpfulGroundingThemes?: string[];
  preferredLens?: string;
  preferredClosingStyle?: ClosingStyle;
  frequentlySkippedElements?: string[];
  updatedAt: string;
}

// ---------- Adaptive session context ----------
// Built once per session start, from data already in the client/server's
// hands - never a raw dump of reflection history (section 32's "do not
// repeatedly send large raw archives").

export interface AdaptiveGroundingContext {
  sessionDepth: SessionDepth;
  capacity: CapacityState | null;
  lens: string;
  currentTheme: PatternDimensionId | null;
  secondaryThemes: PatternDimensionId[];
  recentPromptKeys: string[];
  helpfulPromptFamilies: PatternDimensionId[];
  previousAlignedAction: { chosenValue: string; nextAlignedAction: string } | null;
  preferredClosingStyle: ClosingStyle | null;
}
