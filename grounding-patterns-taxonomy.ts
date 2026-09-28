// Phase 2's pattern taxonomy - a maintainable, single source of truth for
// every reflection theme Nova can notice across a person's grounding
// sessions, instead of scattering theme strings through UI components and
// prompts. Pure data/logic, no React/DOM, shared between server.ts (theme
// detection + context building) and the frontend (insight cards, the
// Explore This flow, community topic links).
//
// These are reflection themes, not diagnoses - the copy throughout this
// file is deliberately tentative ("often", "may", "has appeared"), never
// declarative ("you have...", "you suffer from...").

export type PatternDimensionId =
  | 'control' | 'uncertainty' | 'over_responsibility' | 'perfectionism'
  | 'guilt_about_rest' | 'boundary_difficulty' | 'fear_of_disappointing'
  | 'people_pleasing' | 'isolation' | 'reluctance_to_ask_for_support'
  | 'excessive_self_expectation' | 'work_identity' | 'financial_pressure'
  | 'family_responsibility' | 'conflict_avoidance' | 'overcommitment'
  | 'comparison' | 'self_criticism' | 'difficulty_accepting_unfinished_work'
  | 'difficulty_accepting_outcomes' | 'gratitude' | 'patience' | 'trust'
  | 'compassion' | 'connection' | 'purpose' | 'values_conflict';

export type PatternCategoryId =
  | 'control_responsibility' | 'self_expectation' | 'boundaries_people'
  | 'connection_support' | 'rest_guilt' | 'practical_pressures'
  | 'uncertainty_acceptance' | 'values_meaning';

export interface PatternDimension {
  id: PatternDimensionId;
  label: string;
  category: PatternCategoryId;
  // A single, reusable, pattern-specific sentence in the exploratory voice
  // the confidence-tier prefixes (below) are layered in front of. Written
  // once per dimension rather than once per confidence tier, since the
  // brief's own worked examples show the TIER language is generic and the
  // pattern description is the only part that's dimension-specific.
  description: string;
  // Where this theme can sensibly route to in the external community,
  // when community suggestions are enabled and a base URL is configured.
  // Left undefined for dimensions with no clear community-topic fit
  // (e.g. gratitude, purpose) - those fall back to a generic landing page.
  communityTopicSlug?: string;
}

export const PATTERN_CATEGORIES: Record<PatternCategoryId, { label: string }> = {
  control_responsibility: { label: 'Control & Responsibility' },
  self_expectation: { label: 'Self-Expectation' },
  boundaries_people: { label: 'Boundaries & People-Pleasing' },
  connection_support: { label: 'Connection & Support' },
  rest_guilt: { label: 'Rest & Guilt' },
  practical_pressures: { label: 'Practical Pressures' },
  uncertainty_acceptance: { label: 'Uncertainty & Acceptance' },
  values_meaning: { label: 'Values & Meaning' },
};

export const PATTERN_DIMENSIONS: Record<PatternDimensionId, PatternDimension> = {
  control: {
    id: 'control', label: 'Trying to carry the outcome', category: 'control_responsibility',
    description: "You've repeatedly described taking responsibility not only for your actions, but for how everything turns out.",
    communityTopicSlug: 'boundaries',
  },
  over_responsibility: {
    id: 'over_responsibility', label: 'Carrying more than your share', category: 'control_responsibility',
    description: "Several reflections have shown you holding responsibility for things that were shared, or that belonged to someone else entirely.",
    communityTopicSlug: 'boundaries',
  },
  difficulty_accepting_outcomes: {
    id: 'difficulty_accepting_outcomes', label: 'Sitting with how things landed', category: 'control_responsibility',
    description: "Accepting how something actually turned out has come up as genuinely hard, even after the effort was real.",
  },
  difficulty_accepting_unfinished_work: {
    id: 'difficulty_accepting_unfinished_work', label: 'Leaving things unfinished', category: 'control_responsibility',
    description: "Stopping before something feels complete has shown up as a real source of discomfort.",
  },
  perfectionism: {
    id: 'perfectionism', label: 'Needing it to be exactly right', category: 'self_expectation',
    description: "A high bar for your own work has come up more than once, even when 'good enough' would genuinely be enough.",
  },
  self_criticism: {
    id: 'self_criticism', label: 'A hard inner voice', category: 'self_expectation',
    description: "The way you talk to yourself about your own effort has come up as noticeably harder than how you'd talk to someone else.",
  },
  excessive_self_expectation: {
    id: 'excessive_self_expectation', label: 'Expecting more of yourself than the moment asks', category: 'self_expectation',
    description: "What you expect of yourself has repeatedly looked steeper than what the situation itself required.",
  },
  comparison: {
    id: 'comparison', label: 'Measuring against others', category: 'self_expectation',
    description: "Comparison to other people's pace, output, or apparent ease has come up as part of the weight you're carrying.",
  },
  boundary_difficulty: {
    id: 'boundary_difficulty', label: 'Boundaries that are hard to hold', category: 'boundaries_people',
    description: "Setting or keeping a boundary has come up as something that costs you more than it should.",
    communityTopicSlug: 'boundaries',
  },
  people_pleasing: {
    id: 'people_pleasing', label: 'Keeping everyone else steady', category: 'boundaries_people',
    description: "Managing how other people feel has repeatedly taken priority over your own capacity.",
    communityTopicSlug: 'boundaries',
  },
  fear_of_disappointing: {
    id: 'fear_of_disappointing', label: 'Fear of letting someone down', category: 'boundaries_people',
    description: "The fear of disappointing someone has shown up as a real factor in decisions that were otherwise yours to make.",
  },
  conflict_avoidance: {
    id: 'conflict_avoidance', label: 'Avoiding the hard conversation', category: 'boundaries_people',
    description: "A conversation that needed to happen has come up more than once as something you've been putting off.",
  },
  overcommitment: {
    id: 'overcommitment', label: 'Saying yes past capacity', category: 'boundaries_people',
    description: "Taking on more than your actual capacity has come up as a repeating pattern, not a one-off.",
  },
  isolation: {
    id: 'isolation', label: 'Carrying it alone', category: 'connection_support',
    description: "Processing this mostly by yourself, without anyone else knowing the full weight of it, has come up more than once.",
    communityTopicSlug: 'connection',
  },
  reluctance_to_ask_for_support: {
    id: 'reluctance_to_ask_for_support', label: 'Hesitating to ask for help', category: 'connection_support',
    description: "Asking for support has come up as something you recognise would help, but keep hesitating to actually do.",
    communityTopicSlug: 'support-connection',
  },
  connection: {
    id: 'connection', label: 'Returning to connection', category: 'connection_support',
    description: "Real connection with other people has repeatedly come up as something that genuinely helps.",
    communityTopicSlug: 'connection',
  },
  guilt_about_rest: {
    id: 'guilt_about_rest', label: 'Guilt about resting', category: 'rest_guilt',
    description: "Choosing to rest has repeatedly come with guilt attached, even when the rest itself was genuinely needed.",
    communityTopicSlug: 'rest-recovery',
  },
  work_identity: {
    id: 'work_identity', label: 'Worth tied to output', category: 'practical_pressures',
    description: "How productive or useful you've been has repeatedly shown up as tied to how you feel about yourself.",
    communityTopicSlug: 'founders-leaders',
  },
  financial_pressure: {
    id: 'financial_pressure', label: 'Financial pressure', category: 'practical_pressures',
    description: "Money concerns have come up as a real, recurring weight across your reflections.",
  },
  family_responsibility: {
    id: 'family_responsibility', label: 'Family responsibility', category: 'practical_pressures',
    description: "Responsibility toward family has repeatedly shown up as part of what you're carrying.",
    communityTopicSlug: 'family-responsibility',
  },
  uncertainty: {
    id: 'uncertainty', label: 'Needing to resolve uncertainty', category: 'uncertainty_acceptance',
    description: "Not knowing how something will unfold has repeatedly come up as something you feel pressure to resolve immediately.",
  },
  patience: {
    id: 'patience', label: 'Returning to patience', category: 'uncertainty_acceptance',
    description: "Patience with a difficult stretch has repeatedly come up as something you're actively practising, not something that comes easily.",
  },
  trust: {
    id: 'trust', label: 'Returning to trust', category: 'uncertainty_acceptance',
    description: "Trusting a process or an outcome you can't fully see has come up as a recurring thread in your reflections.",
  },
  gratitude: {
    id: 'gratitude', label: 'Returning to gratitude', category: 'values_meaning',
    description: "Naming what's still steady, even in a hard stretch, has come up repeatedly in your reflections.",
  },
  compassion: {
    id: 'compassion', label: 'Compassion, inward and outward', category: 'values_meaning',
    description: "Compassion - toward yourself as much as toward others - has come up as something you keep returning to.",
  },
  purpose: {
    id: 'purpose', label: 'Returning to purpose', category: 'values_meaning',
    description: "A sense of why this matters has repeatedly surfaced as something you're actively trying to stay connected to.",
  },
  values_conflict: {
    id: 'values_conflict', label: 'Values pulling in different directions', category: 'values_meaning',
    description: "More than one thing you genuinely care about has come up as pulling you in different directions at once.",
  },
};

export const PATTERN_DIMENSION_ORDER: PatternDimensionId[] = Object.keys(PATTERN_DIMENSIONS) as PatternDimensionId[];

// ---------- Confidence model ----------
// Deliberately generic across every dimension (matches the brief's own
// worked examples, where the TIER language is the same regardless of
// which theme it's describing) - only the thresholds and the
// dimension-specific description (above) vary.

export type PatternConfidence = 'emerging' | 'recurring' | 'established';

export const CONFIDENCE_COPY: Record<PatternConfidence, string> = {
  emerging: 'Something may be beginning to show up in your reflections.',
  recurring: 'This has appeared in several of your recent reflections.',
  established: "This seems to be a recurring part of what you've been carrying.",
};

// occurrenceCount thresholds. "Established" additionally requires the
// pattern to span at least MIN_ESTABLISHED_SPAN_DAYS between first and
// last occurrence, so a burst of sessions in one afternoon can never read
// as a long-standing pattern.
export const EMERGING_MIN_COUNT = 2;
export const RECURRING_MIN_COUNT = 4;
export const ESTABLISHED_MIN_COUNT = 6;
export const ESTABLISHED_MIN_SPAN_DAYS = 21;

export const computeConfidence = (occurrenceCount: number, spanDays: number): PatternConfidence | null => {
  if (occurrenceCount >= ESTABLISHED_MIN_COUNT && spanDays >= ESTABLISHED_MIN_SPAN_DAYS) return 'established';
  if (occurrenceCount >= RECURRING_MIN_COUNT) return 'recurring';
  if (occurrenceCount >= EMERGING_MIN_COUNT) return 'emerging';
  return null;
};

// ---------- Deriving patterns from session history ----------
// reflection_patterns docs are a recomputed cache, not an incrementally-
// updated counter: every time this runs (after a session completes, or
// when the Journey view loads), it re-derives occurrenceCount/status/
// dates fresh from the session history itself. This means a pattern only
// ever gets a Firestore doc once it has genuinely reached "emerging" -
// there's no "count: 1, status: null" state to represent, which keeps
// the confidence model honest by construction rather than by convention.
// User-controlled fields (userFeedback, paused, suppressed) are never
// touched here - the caller merges this output with whatever's already
// stored for those fields.

export interface DerivedPattern {
  patternKey: PatternDimensionId;
  category: PatternCategoryId;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: PatternConfidence;
  lensAssociations: string[];
}

export interface SessionForPatternDerivation {
  detectedThemes?: string[];
  lens: string;
  createdAt: string;
}

export const computeDerivedPatterns = (sessions: SessionForPatternDerivation[]): DerivedPattern[] => {
  const byKey = new Map<PatternDimensionId, { dates: string[]; lenses: Set<string> }>();
  for (const session of sessions) {
    if (!session.detectedThemes) continue;
    for (const raw of session.detectedThemes) {
      if (!(raw in PATTERN_DIMENSIONS)) continue; // never trust an unrecognised theme string
      const key = raw as PatternDimensionId;
      if (!byKey.has(key)) byKey.set(key, { dates: [], lenses: new Set() });
      const entry = byKey.get(key)!;
      entry.dates.push(session.createdAt);
      entry.lenses.add(session.lens);
    }
  }

  const results: DerivedPattern[] = [];
  for (const [key, { dates, lenses }] of byKey.entries()) {
    const sorted = [...dates].sort();
    const firstSeenAt = sorted[0]!;
    const lastSeenAt = sorted[sorted.length - 1]!;
    const spanDays = (new Date(lastSeenAt).getTime() - new Date(firstSeenAt).getTime()) / (1000 * 60 * 60 * 24);
    const status = computeConfidence(dates.length, spanDays);
    if (!status) continue; // hasn't reached "emerging" yet - stays invisible, no doc, no card
    results.push({
      patternKey: key,
      category: PATTERN_DIMENSIONS[key].category,
      occurrenceCount: dates.length,
      firstSeenAt,
      lastSeenAt,
      status,
      lensAssociations: [...lenses],
    });
  }

  // Most-occurring first, so callers can slice to "1-3 cards maximum"
  // straight off this array without a separate sort step.
  return results.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
};

// ---------- Monthly Deep Reflection: "what changed" ----------
// Batch 5 deliberately has no dedicated AI route at all - every section
// of the monthly reflection (heaviest theme, recurring themes, what
// helped, what changed) is computed from data already loaded client-side
// (sessions, derived patterns), keeping this feature's token usage at
// zero rather than adding a seventh AI-generation surface for a
// once-a-month summary. This is the one comparison that needs real logic
// rather than a simple count: which theme shifted the most between the
// earlier and later half of the reflection window.

export const compareThemeShift = (
  earlierSessions: SessionForPatternDerivation[],
  laterSessions: SessionForPatternDerivation[]
): { patternKey: PatternDimensionId; direction: 'increasing' | 'decreasing' } | null => {
  // Too little on either side to say anything honest about a shift.
  if (earlierSessions.length < 2 || laterSessions.length < 2) return null;

  const countThemes = (sessions: SessionForPatternDerivation[]) => {
    const counts = new Map<PatternDimensionId, number>();
    sessions.forEach((s) => {
      (s.detectedThemes || []).forEach((raw) => {
        if (!(raw in PATTERN_DIMENSIONS)) return;
        const key = raw as PatternDimensionId;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    return counts;
  };

  const earlierCounts = countThemes(earlierSessions);
  const laterCounts = countThemes(laterSessions);
  const allKeys = new Set([...earlierCounts.keys(), ...laterCounts.keys()]);

  let best: { patternKey: PatternDimensionId; direction: 'increasing' | 'decreasing'; delta: number } | null = null;
  for (const key of allKeys) {
    const earlierCount = earlierCounts.get(key) || 0;
    const laterCount = laterCounts.get(key) || 0;
    const delta = Math.abs(laterCount - earlierCount);
    if (delta === 0) continue;
    if (!best || delta > best.delta) {
      best = { patternKey: key, direction: laterCount > earlierCount ? 'increasing' : 'decreasing', delta };
    }
  }
  return best ? { patternKey: best.patternKey, direction: best.direction } : null;
};

export const MIN_SESSIONS_FOR_MONTHLY_REFLECTION = 4;

// ---------- Explore This: question sets grouped by category ----------
// Not 27 bespoke question sets - one progressive, reusable set per
// category, with the specific pattern's own description/label woven into
// the opening line so it still feels tailored. Keeps this maintainable as
// the taxonomy grows, and keeps every question authored by this app
// rather than generated per-session by a model.

export interface ExploreQuestionSet {
  openingTemplate: (patternLabel: string) => string;
  questions: string[];
}

export const EXPLORE_QUESTION_SETS: Record<PatternCategoryId, ExploreQuestionSet> = {
  control_responsibility: {
    openingTemplate: (label) => `Several of your recent reflections have touched on "${label.toLowerCase()}" - separating your own effort from outcomes involving other people or circumstances.`,
    questions: [
      'When things don\'t go as planned, what do you usually feel responsible for?',
      'Which part of that genuinely belonged to you?',
      'Which part depended on someone or something outside your control?',
      'If you stopped taking responsibility for that second part, what would change?',
      'What would responsible effort, without ownership of the outcome, look like next time?',
    ],
  },
  self_expectation: {
    openingTemplate: (label) => `Your reflections have repeatedly touched on "${label.toLowerCase()}" - the standard you hold yourself to.`,
    questions: [
      'Where does this standard actually come from?',
      'Would you expect this same standard from someone you cared about, in your situation?',
      'What has this standard cost you recently?',
      'What would "genuinely good enough" look like here?',
      "What's one place you could let the standard soften, on purpose, this week?",
    ],
  },
  boundaries_people: {
    openingTemplate: (label) => `"${label}" has come up more than once in your recent reflections.`,
    questions: [
      'What are you afraid would happen if you held this boundary?',
      'Whose reaction are you actually protecting against?',
      'What would it cost you to keep not holding it?',
      "What's the smallest version of this boundary you could hold this week?",
      'What would you need to feel steady enough to hold it?',
    ],
  },
  connection_support: {
    openingTemplate: (label) => `"${label}" has come up repeatedly - the sense of processing things without anyone else fully knowing.`,
    questions: [
      "Who knows what you're actually carrying right now?",
      'What has stopped you from telling them more?',
      'What would it feel like if one person understood this fully?',
      "What's the smallest way you could let someone in this week?",
      'What do you actually need from someone else right now - to fix it, or just to know?',
    ],
  },
  rest_guilt: {
    openingTemplate: () => `Guilt about resting has come up repeatedly in your reflections.`,
    questions: [
      'What do you believe resting says about you?',
      'Where did that belief come from?',
      'What would you say to someone else who felt guilty for resting?',
      "What's actually true about what rest does for you?",
      'What would resting without guilt, even once, look like this week?',
    ],
  },
  practical_pressures: {
    openingTemplate: (label) => `"${label}" has come up as a real, recurring pressure in your reflections.`,
    questions: [
      'What part of this pressure is something you can actually act on right now?',
      'What part is genuinely outside your control at this moment?',
      'What has this pressure been costing you elsewhere - sleep, relationships, health?',
      'Who, if anyone, could genuinely share part of this with you?',
      'What is one honest, manageable step - not a full solution - you could take this week?',
    ],
  },
  uncertainty_acceptance: {
    openingTemplate: (label) => `"${label}" has come up repeatedly - the pull to resolve or fully understand something before you can settle.`,
    questions: [
      'What do you imagine would happen if this stayed unresolved a while longer?',
      'What has trying to force an answer actually cost you?',
      "What's genuinely within your power to influence here, right now?",
      'What would it look like to take the next right step without needing the full picture?',
      'What would help you feel steadier while this stays uncertain?',
    ],
  },
  values_meaning: {
    openingTemplate: (label) => `"${label}" has come up repeatedly across your recent reflections.`,
    questions: [
      'What does this theme tell you about what actually matters to you right now?',
      'Where have you seen this show up most clearly recently?',
      'What gets in the way of leaning into this more?',
      'What would it look like to make more room for this, on purpose?',
      "What's one small way you could act on this in the coming week?",
    ],
  },
};

// ---------- Meaning-making prompts ----------

export type MeaningPromptId =
  | 'what_matters' | 'what_i_need' | 'my_limits' | 'my_relationships'
  | 'what_i_am_controlling' | 'what_i_may_need_to_change' | 'where_i_need_support' | 'what_i_value'
  | 'trust' | 'islamic_patience' | 'surrender' | 'islamic_gratitude' | 'dependence';

export const MEANING_PROMPTS_GENERAL: { id: MeaningPromptId; label: string }[] = [
  { id: 'what_matters', label: 'About what matters to me' },
  { id: 'what_i_need', label: 'About what I need' },
  { id: 'my_limits', label: 'About my limits' },
  { id: 'my_relationships', label: 'About my relationships' },
  { id: 'what_i_am_controlling', label: 'About what I am trying to control' },
  { id: 'what_i_may_need_to_change', label: 'About what I may need to change' },
  { id: 'where_i_need_support', label: 'About where I need support' },
  { id: 'what_i_value', label: 'About what I value' },
];

// Only ever shown for the faith/islamic lenses, appended after the
// general list above rather than replacing it.
export const MEANING_PROMPTS_FAITH_EXTRA: { id: MeaningPromptId; label: string }[] = [
  { id: 'trust', label: 'About trust' },
  { id: 'islamic_patience', label: 'About patience' },
  { id: 'surrender', label: 'About surrender' },
  { id: 'islamic_gratitude', label: 'About gratitude' },
  { id: 'dependence', label: 'About dependence on something greater than myself' },
];

export const MEANING_MAKING_INTRO = "You may not know why this happened. You can still consider how you want to respond to it.";
export const MEANING_MAKING_INTRO_ISLAMIC = "We may not understand the wisdom behind every circumstance. Reflection can focus instead on what is being asked of us now: appropriate effort, patience, trust, mercy and right action.";

// ---------- Values ----------

export const VALUES_LIST: string[] = [
  'Integrity', 'Compassion', 'Courage', 'Faith', 'Family', 'Patience', 'Honesty',
  'Service', 'Rest', 'Responsibility', 'Justice', 'Presence', 'Trust', 'Growth',
];
