// Pure data/logic for the Faith & Values Grounding journey - no React/DOM,
// mirrors the shared-module convention (ship-stages.ts,
// recovery-fuel-patterns.ts) so server.ts (AI reflection route, pattern
// derivation) and the frontend components read from one source of truth
// and can never drift apart on lens labels, theme copy, or pattern rules.
//
// A note on the Islamic Reflection lens specifically: every Qur'an
// reference below is a short, well-known, widely-cited verse, given with
// its exact Surah:Ayah reference and translator attribution so it can be
// independently checked. Every entry is marked `scholarReviewed: false` -
// this content has NOT yet been reviewed by a qualified Islamic scholar,
// and the UI must always surface that. No Hadith text is included at all;
// Hadith authentication is more specialised and higher-risk to get wrong
// than well-established Qur'an translation, so those slots stay empty
// until a scholar can select and verify them. The AI reflection route
// (server.ts) is instructed to draw ONLY from this curated pool and is
// never permitted to generate its own Qur'an or Hadith text - see
// buildIslamicReflectionPrompt's caller for the exact constraint.

import { SessionDepth, CapacityState } from './grounding-adaptive';

export type GroundingLens = 'secular' | 'values' | 'faith' | 'islamic';

export const GROUNDING_LENSES: Record<GroundingLens, { label: string; description: string }> = {
  secular: { label: 'Secular / Biological', description: 'Focus on physiology, neuroscience, and psychology.' },
  values: { label: 'Values-Driven', description: 'Focus on ethics, core principles, and personal integrity.' },
  faith: { label: 'Faith-Friendly', description: 'General spiritual grounding, gratitude, and trust.' },
  islamic: { label: 'Islamic Reflection', description: 'Tawakkul, Sabr, and prayer integration.' },
};

export const GROUNDING_LENS_ORDER: GroundingLens[] = ['secular', 'values', 'faith', 'islamic'];

// ---------- Stage 1 - ARRIVE ----------

export type BurdenId =
  | 'work' | 'money' | 'family' | 'relationships' | 'expectations'
  | 'uncertainty' | 'guilt' | 'responsibility' | 'cannot_change' | 'other';

export const BURDEN_OPTIONS: { id: BurdenId; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'money', label: 'Money' },
  { id: 'family', label: 'Family' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'expectations', label: 'Expectations' },
  { id: 'uncertainty', label: 'Uncertainty' },
  { id: 'guilt', label: 'Guilt' },
  { id: 'responsibility', label: 'Responsibility' },
  { id: 'cannot_change', label: 'Something I cannot change' },
  { id: 'other', label: 'Something else' },
];

export const BURDEN_LABELS: Record<BurdenId, string> = BURDEN_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.id]: o.label }),
  {} as Record<BurdenId, string>
);

// ---------- Stage 2 - SEPARATE ----------

export const CONTROLLABLE_EXAMPLES = [
  'My actions', 'My words', 'My preparation', 'My boundaries', 'Asking for help', 'How I respond',
];

export const UNCONTROLLABLE_EXAMPLES = [
  "Other people's reactions", 'The final outcome', 'Timing', 'The past', 'Unexpected events', 'What others choose',
];

// ---------- Stage 3 - REFLECT: Islamic curated themes ----------

export type IslamicThemeId = 'tawakkul' | 'sabr' | 'shukr' | 'qadr' | 'rahmah' | 'salah' | 'dua' | 'ummah' | 'niyyah' | 'ihsan';

export interface CuratedVerse {
  reference: string;
  translation: string;
  translator: string;
  scholarReviewed: boolean;
}

export interface IslamicTheme {
  id: IslamicThemeId;
  label: string;
  // Short, coaching-style framing written for this app - not scripture,
  // not a translation, safe for this codebase to author directly (same
  // bar as every other piece of reflection copy in this app).
  framing: string;
  verses: CuratedVerse[];
  // The AI reflection route stays anchored near these two questions
  // rather than inventing its own, so the flow matches the product's own
  // worked example (see the Tawakkul interaction in the feature brief).
  prompt: string;
  followUp: string;
}

export const ISLAMIC_THEMES: Record<IslamicThemeId, IslamicTheme> = {
  tawakkul: {
    id: 'tawakkul',
    label: 'Tawakkul (Trust & Effort)',
    framing: 'Tawakkul means taking appropriate action without demanding ownership of the outcome.',
    verses: [{
      reference: "Qur'an 65:3",
      translation: '"...And whoever relies upon Allah - then He is sufficient for him. Indeed, Allah will accomplish His purpose..."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'What have you genuinely done that was within your responsibility today?',
    followUp: 'What outcome are you still trying to control?',
  },
  sabr: {
    id: 'sabr',
    label: 'Sabr (Patience & Perseverance)',
    framing: 'Sabr is not passive suffering - it is maintaining steadiness while navigating real difficulty.',
    verses: [{
      reference: "Qur'an 2:153",
      translation: '"O you who have believed, seek help through patience and prayer. Indeed, Allah is with the patient."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'Where has patience felt hardest to hold onto right now?',
    followUp: 'What would it look like to stay steady here, without needing it to be easy?',
  },
  shukr: {
    id: 'shukr',
    label: 'Shukr (Gratitude)',
    framing: 'Shukr is noticing and naming what is still steady, even in the middle of difficulty.',
    verses: [{
      reference: "Qur'an 14:7",
      translation: '"...If you are grateful, I will surely increase you [in favor]..."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'What is one thing, however small, that is still steady for you right now?',
    followUp: 'How does naming that change how the rest of today feels?',
  },
  qadr: {
    id: 'qadr',
    label: 'Qadr (Divine Decree)',
    framing: 'Qadr holds both genuine effort and the honest limits of what any one person can control.',
    verses: [{
      reference: "Qur'an 57:22",
      translation: '"No disaster strikes upon the earth or among yourselves except that it is in a register before We bring it into being..."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'What real effort have you already put into this?',
    followUp: 'What part of the outcome was never going to be yours to decide?',
  },
  rahmah: {
    id: 'rahmah',
    label: 'Rahmah (Mercy)',
    framing: 'Rahmah is extending the same mercy inward that would be offered to someone else.',
    verses: [{
      reference: "Qur'an 39:53",
      translation: '"...Indeed, Allah forgives all sins. Indeed, it is He who is the Forgiving, the Merciful."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'If a close friend were carrying exactly what you are carrying, what would you say to them?',
    followUp: 'What would it take to offer yourself that same mercy?',
  },
  salah: {
    id: 'salah',
    label: 'Salah (Prayer)',
    framing: 'Salah is a structured, protected pause away from the demands of the material world.',
    verses: [{
      reference: "Qur'an 29:45",
      translation: '"...Indeed, prayer prohibits immorality and wrongdoing, and the remembrance of Allah is greater..."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'When did you last take a real pause today, away from screens and demands?',
    followUp: 'What would it look like to protect that pause as non-negotiable?',
  },
  dua: {
    id: 'dua',
    label: "Du'a (Supplication)",
    framing: "Du'a is speaking honestly, without needing to find the \"right\" words first.",
    verses: [{
      reference: "Qur'an 2:186",
      translation: '"...I am near. I respond to the invocation of the supplicant when he calls upon Me..."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: "If you spoke honestly right now, without needing the \"right\" words, what would you actually say?",
    followUp: 'What would it feel like to actually say that, even briefly, before moving on?',
  },
  ummah: {
    id: 'ummah',
    label: 'Community / Ummah',
    framing: 'Carrying difficulty was never meant to happen entirely alone.',
    verses: [{
      reference: "Qur'an 49:10",
      translation: '"The believers are but brothers, so make settlement between your brothers..."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'Who could genuinely share part of this weight with you, if you let them?',
    followUp: 'What is stopping you from reaching out to them today?',
  },
  niyyah: {
    id: 'niyyah',
    label: 'Niyyah (Intention)',
    framing: 'Niyyah is returning attention to intention, rather than measuring your worth solely through outcomes.',
    verses: [{
      reference: "Qur'an 98:5",
      translation: '"And they were not commanded except to worship Allah, [being] sincere to Him in religion..."',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'What was your intention when you started this, before the outcome became uncertain?',
    followUp: 'Does that intention still hold, regardless of how this turns out?',
  },
  ihsan: {
    id: 'ihsan',
    label: 'Ihsan (Excellence)',
    framing: 'Ihsan is choosing excellence of action without demanding perfection of outcome.',
    verses: [{
      reference: "Qur'an 55:60",
      translation: '"Is the reward for good [ihsan] anything but good [ihsan]?"',
      translator: 'Saheeh International',
      scholarReviewed: false,
    }],
    prompt: 'Where did you genuinely bring your best effort, even if the result wasn\'t perfect?',
    followUp: 'What would it look like to let that effort be enough?',
  },
};

export const ISLAMIC_THEME_ORDER: IslamicThemeId[] = ['tawakkul', 'sabr', 'shukr', 'qadr', 'rahmah', 'salah', 'dua', 'ummah', 'niyyah', 'ihsan'];

// Phase 2's "intelligent theme selection" (section 6): a light, purely
// deterministic relevance map from pattern-taxonomy dimensions to the
// Islamic themes most likely to speak to them - no AI involved, just a
// lookup, so the Stage 3 theme picker can put the most relevant themes
// first instead of a fixed order. Falls back to ISLAMIC_THEME_ORDER
// untouched when no pattern context is available (e.g. a first session).
export const DIMENSION_TO_ISLAMIC_THEMES: Partial<Record<string, IslamicThemeId[]>> = {
  control: ['tawakkul', 'qadr'],
  over_responsibility: ['tawakkul', 'niyyah'],
  uncertainty: ['tawakkul', 'qadr'],
  guilt_about_rest: ['sabr', 'rahmah'],
  isolation: ['ummah'],
  reluctance_to_ask_for_support: ['ummah', 'dua'],
  self_criticism: ['rahmah'],
  perfectionism: ['ihsan'],
  excessive_self_expectation: ['ihsan', 'niyyah'],
  difficulty_accepting_outcomes: ['qadr', 'tawakkul'],
  difficulty_accepting_unfinished_work: ['ihsan'],
  work_identity: ['niyyah', 'ihsan'],
  boundary_difficulty: ['sabr'],
  connection: ['ummah'],
  gratitude: ['shukr'],
  patience: ['sabr'],
  trust: ['tawakkul'],
  compassion: ['rahmah'],
};

export const rankIslamicThemesByRelevance = (recentPatternKeys: string[]): IslamicThemeId[] => {
  if (recentPatternKeys.length === 0) return ISLAMIC_THEME_ORDER;
  const scores = new Map<IslamicThemeId, number>();
  ISLAMIC_THEME_ORDER.forEach((id) => scores.set(id, 0));
  recentPatternKeys.forEach((key) => {
    const themes = DIMENSION_TO_ISLAMIC_THEMES[key];
    if (!themes) return;
    themes.forEach((id, idx) => scores.set(id, (scores.get(id) || 0) + (themes.length - idx)));
  });
  return [...ISLAMIC_THEME_ORDER].sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0));
};

// ---------- Stage 5 - RECONNECT ----------

// Phase 2's upgraded Reconnect option set (brief section 17), replacing
// Phase 1's simpler 4-option list. 'nova'/'practical_action'/'rest' are
// kept as valid VALUES (not offered in the UI any more) purely so
// already-written Phase 1 session docs remain readable/re-saveable - see
// firestore.rules' grounding_sessions.nextAction enum, which accepts
// both sets for the same reason.
export type NextActionId =
  | 'sit_with_this' | 'next_step' | 'continue_with_nova' | 'trusted_person' | 'community' | 'return_to_blaze_break'
  | 'nova' | 'practical_action' | 'rest';

export const NEXT_ACTION_OPTIONS: { id: NextActionId; label: string; description: string }[] = [
  { id: 'sit_with_this', label: 'Sit with this', description: 'Nothing more right now.' },
  { id: 'next_step', label: 'Take my next step', description: 'Open the aligned action I just chose.' },
  { id: 'continue_with_nova', label: 'Continue privately with Nova', description: 'Explore the reflection further.' },
  { id: 'trusted_person', label: 'Reach out to someone I trust', description: 'Open your Recovery Ally / Guardian circle.' },
  { id: 'community', label: 'Connect with the community', description: 'Open relevant community discussion or resources.' },
  { id: 'return_to_blaze_break', label: 'Return to Blaze Break', description: 'Continue your personal recovery journey.' },
];

// ---------- Grounding session record shape ----------

export interface ReflectionAnswer {
  question: string;
  answer: string;
}

export interface GroundingSessionRecord {
  id?: string;
  lens: GroundingLens;
  burdenIds: BurdenId[];
  customBurden?: string;
  intensity?: number;
  controllableItems: string[];
  uncontrollableItems: string[];
  islamicThemeId?: IslamicThemeId;
  reflectionAnswers?: ReflectionAnswer[];
  // Phase 2's Nova Pattern Engine: up to 3 taxonomy dimension ids
  // (grounding-patterns-taxonomy.ts) the reflect route detected this
  // session touches on, allowlist-validated server-side before ever
  // reaching here. Feeds computeDerivedPatterns, which is what "Your
  // Grounding Journey" actually reads - this field is the raw input to
  // that, not something rendered directly.
  detectedThemes?: string[];
  nextAction?: NextActionId;
  // Phase 3: which of the 3 session depths this was, and the person's
  // self-reported capacity at the time, if they gave one. Absent means a
  // pre-Phase-3 session - the client treats that as 'ground'.
  sessionDepth?: SessionDepth;
  capacityState?: CapacityState;
  createdAt: string;
  updatedAt: string;
}

// Phase 1 shipped a small 3-pattern client-side detector here
// (detectGroundingPatterns). Phase 2 supersedes it entirely with the
// taxonomy-driven engine in grounding-patterns-taxonomy.ts
// (computeDerivedPatterns + PATTERN_DIMENSIONS), which covers the same
// ground plus the other 24 taxonomy dimensions - keeping both would have
// meant two parallel "what pattern is this" systems on one feature.
