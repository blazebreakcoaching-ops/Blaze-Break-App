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

export type IslamicThemeId = 'tawakkul' | 'sabr' | 'shukr' | 'qadr' | 'rahmah' | 'salah' | 'dua' | 'ummah';

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
};

export const ISLAMIC_THEME_ORDER: IslamicThemeId[] = ['tawakkul', 'sabr', 'shukr', 'qadr', 'rahmah', 'salah', 'dua', 'ummah'];

// ---------- Stage 5 - RECONNECT ----------

// "Join a relevant Community conversation" from the original brief is
// deliberately not included here: this app has no peer community/social
// feature to route it to (confirmed by search - only an org-facing "wins
// wall" exists, which is a different, B2B-only thing). Inventing one would
// be a much larger, separate feature. The remaining four options are all
// real, existing surfaces.
export type NextActionId = 'nova' | 'trusted_person' | 'practical_action' | 'rest';

export const NEXT_ACTION_OPTIONS: { id: NextActionId; label: string; description: string }[] = [
  { id: 'nova', label: 'Talk privately with Nova', description: 'Open a private conversation.' },
  { id: 'trusted_person', label: 'Speak to someone I trust', description: 'Open your Recovery Ally / Guardian circle.' },
  { id: 'practical_action', label: 'Take one small practical action', description: "Pick up where you've been working." },
  { id: 'rest', label: 'Rest for now', description: 'No further action needed.' },
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
  nextAction?: NextActionId;
  createdAt: string;
  updatedAt: string;
}

// ---------- Pattern detection (Your Grounding Journey) ----------
// Structured-fields-only, same "genuine repetition" bar as
// recovery-fuel-patterns.ts: a pattern only qualifies once it shows up on
// strictly more than half of a person's recent sessions, with a minimum
// number of sessions before anything is surfaced at all.

export type GroundingPatternId = 'releasing_control' | 'rest_without_guilt' | 'asking_for_support';

export interface GroundingPattern {
  id: GroundingPatternId;
  label: string;
  sessionsAffected: number;
  totalSessions: number;
}

const MIN_SESSIONS_FOR_PATTERN = 3;

const qualifies = (count: number, total: number) => count > total / 2;

export const GROUNDING_PATTERN_LABELS: Record<GroundingPatternId, string> = {
  releasing_control: 'Releasing control',
  rest_without_guilt: 'Rest without guilt',
  asking_for_support: 'Asking for support',
};

export const detectGroundingPatterns = (
  sessions: Pick<GroundingSessionRecord, 'burdenIds' | 'controllableItems' | 'uncontrollableItems' | 'nextAction'>[]
): GroundingPattern[] => {
  const total = sessions.length;
  if (total < MIN_SESSIONS_FOR_PATTERN) return [];

  const patterns: GroundingPattern[] = [];

  const releasingControl = sessions.filter((s) =>
    s.uncontrollableItems.some((item) =>
      ['The final outcome', "Other people's reactions", 'Timing'].includes(item)
    )
  ).length;
  if (qualifies(releasingControl, total)) {
    patterns.push({ id: 'releasing_control', label: GROUNDING_PATTERN_LABELS.releasing_control, sessionsAffected: releasingControl, totalSessions: total });
  }

  const restWithoutGuilt = sessions.filter((s) => s.burdenIds.includes('guilt') && s.nextAction === 'rest').length;
  if (qualifies(restWithoutGuilt, total)) {
    patterns.push({ id: 'rest_without_guilt', label: GROUNDING_PATTERN_LABELS.rest_without_guilt, sessionsAffected: restWithoutGuilt, totalSessions: total });
  }

  const askingForSupport = sessions.filter((s) =>
    s.controllableItems.includes('Asking for help') || s.nextAction === 'trusted_person'
  ).length;
  if (qualifies(askingForSupport, total)) {
    patterns.push({ id: 'asking_for_support', label: GROUNDING_PATTERN_LABELS.asking_for_support, sessionsAffected: askingForSupport, totalSessions: total });
  }

  return patterns;
};
