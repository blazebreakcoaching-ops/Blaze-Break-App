// Recovery Fuel's "Nova Fuel Check" decision core - pure functions only,
// same reasoning as energy-delta-engine.ts and recovery-debt-engine.ts:
// every question Nova asks (or skips) and every recommendation it gives
// traces back to a function here, never an open-ended model call. This is
// deliberately NOT a general conversation engine - it's the bounded
// "trigger -> at most one question -> one recommended action" shape every
// worked example in the brief actually uses, kept genuinely adaptive by
// skipping the question whenever real context already answers it.

// ---------- Triggers (the opening quick-response chips) ----------

export type FuelTriggerId = 'running_low' | 'not_eaten' | 'need_drink' | 'running_on_caffeine' | 'no_sleep' | 'overloaded' | 'okay';

export const FUEL_TRIGGER_ORDER: FuelTriggerId[] = ['running_low', 'not_eaten', 'need_drink', 'running_on_caffeine', 'no_sleep', 'overloaded', 'okay'];

export const FUEL_TRIGGER_LABELS: Record<FuelTriggerId, string> = {
  running_low: 'Running low',
  not_eaten: "Haven't eaten properly",
  need_drink: 'Probably need a drink',
  running_on_caffeine: 'Running on caffeine',
  no_sleep: "Didn't sleep well",
  overloaded: 'Feeling overloaded',
  okay: "I'm okay - just checking in",
};

// ---------- What Blaze Break already knows (never re-asked) ----------

export interface FuelContextSnapshot {
  capacityLow: boolean | null; // null = no capacity check-in yet
  energyDeltaNegative: boolean | null; // null = capacity/load unknown
  sleepShortfallHigh: boolean | null; // null = no sleep data logged yet
  loggedAteToday: boolean | null; // null = nothing logged today yet
}

// Mirrors the brief's own "Nova knows: capacity is low, sleep was short,
// energy delta is negative" example - the bar for skipping the opening
// question entirely and leading with a tailored statement instead.
export const hasRichOverloadContext = (ctx: FuelContextSnapshot): boolean =>
  ctx.capacityLow === true && ctx.energyDeltaNegative === true && ctx.sleepShortfallHigh === true;

export interface FuelOpening {
  proactive: boolean; // true = Nova noticed and opened with a tailored line; false = the default "How are you doing right now?" prompt
  line: string;
}

export const getFuelOpening = (ctx: FuelContextSnapshot): FuelOpening => {
  if (hasRichOverloadContext(ctx)) {
    return {
      proactive: true,
      line: "Your capacity is already low and today's load is heavy. Have you managed to eat and drink properly?",
    };
  }
  return { proactive: false, line: 'How are you doing right now?' };
};

// ---------- The single follow-up question ----------

export type FuelAnswerId = 'yes' | 'a_bit' | 'not_really' | 'cant_remember';

export interface FuelQuestion {
  prompt: string;
  options: { id: FuelAnswerId; label: string }[];
}

const ATE_QUESTION: FuelQuestion = {
  prompt: 'Have you eaten anything substantial recently?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'a_bit', label: 'A bit' },
    { id: 'not_really', label: 'Not really' },
  ],
};

const PROACTIVE_QUESTION: FuelQuestion = {
  prompt: 'Have you managed to eat and drink properly?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'a_bit', label: 'A bit' },
    { id: 'not_really', label: 'Not really' },
    { id: 'cant_remember', label: "Can't remember" },
  ],
};

export const getProactiveQuestion = (): FuelQuestion => PROACTIVE_QUESTION;

// Triggers that already carry enough signal on their own - asking a
// follow-up would just restate what the user already told Nova.
const SELF_EXPLANATORY_TRIGGERS: FuelTriggerId[] = ['not_eaten', 'need_drink', 'running_on_caffeine', 'no_sleep', 'okay'];

// null means "enough information already - go straight to a
// recommendation" (section "Stop asking when there is enough
// information"), not "no question exists".
export const getFuelFollowUpQuestion = (trigger: FuelTriggerId, ctx: FuelContextSnapshot): FuelQuestion | null => {
  if (SELF_EXPLANATORY_TRIGGERS.includes(trigger)) return null;
  if (ctx.loggedAteToday !== null) return null; // today's eating status is already logged
  if (trigger === 'overloaded' && hasRichOverloadContext(ctx)) return null; // resolved via the proactive opening instead
  return ATE_QUESTION;
};

// ---------- The recommendation ----------

export type FuelActionId = 'eat' | 'drink' | 'daylight' | 'take_break' | 'somatic_reset' | 'check_capacity' | 'one_less_thing' | 'reduce_load' | 'wind_down';

export const FUEL_ACTION_LABELS: Record<FuelActionId, string> = {
  eat: 'Eat Something',
  drink: 'Get a Drink',
  daylight: 'Step Outside',
  take_break: 'Take 2 Minutes',
  somatic_reset: 'Somatic Reset',
  check_capacity: 'Check Capacity',
  one_less_thing: 'Help Me Remove One Thing',
  reduce_load: "Reduce Today's Load",
  wind_down: 'Start Wind-Down',
};

export interface FuelRecommendation {
  novaLine: string;
  primary: FuelActionId | null; // null only for the 'okay' trigger - no action is being pushed
  secondary: FuelActionId[];
}

const impliedAteAnswer = (ctx: FuelContextSnapshot): FuelAnswerId | null => {
  if (ctx.loggedAteToday === true) return 'yes';
  if (ctx.loggedAteToday === false) return 'not_really';
  return null;
};

export const getFuelRecommendation = (trigger: FuelTriggerId, answer: FuelAnswerId | null, ctx: FuelContextSnapshot): FuelRecommendation => {
  switch (trigger) {
    case 'not_eaten':
      return { novaLine: "Okay. Don't optimise everything. Start with one basic.", primary: 'eat', secondary: ['drink', 'take_break', 'reduce_load'] };
    case 'need_drink':
      return { novaLine: 'Good call. A proper drink can make more difference than it seems.', primary: 'drink', secondary: ['eat', 'take_break'] };
    case 'running_on_caffeine':
      return { novaLine: 'Caffeine can mask how tired you actually are. A proper drink and something to eat might help more than another cup.', primary: 'drink', secondary: ['eat', 'take_break'] };
    case 'no_sleep':
      return { novaLine: "Sleep was short last night. Let's keep today simpler if you can.", primary: 'reduce_load', secondary: ['take_break', 'check_capacity'] };
    case 'okay':
      return { novaLine: "Good to hear. I'm here if anything changes.", primary: null, secondary: [] };
    case 'overloaded': {
      if (ctx.capacityLow === true && ctx.energyDeltaNegative === true) {
        return {
          novaLine: "You're already running low. Instead of giving you another thing to do, let's remove something.",
          primary: 'one_less_thing',
          secondary: ['reduce_load', 'take_break'],
        };
      }
      const resolved = answer ?? impliedAteAnswer(ctx);
      if (resolved === 'not_really') {
        return { novaLine: "Okay. Don't optimise everything. Start with one basic.", primary: 'eat', secondary: ['take_break', 'one_less_thing'] };
      }
      return {
        novaLine: "You're asking a lot from yourself today. Let's slow down for a moment before anything else.",
        primary: 'take_break',
        secondary: ['check_capacity', 'one_less_thing'],
      };
    }
    case 'running_low':
    default: {
      const resolved = answer ?? impliedAteAnswer(ctx);
      if (resolved === 'not_really') {
        return { novaLine: "Okay. Don't optimise everything. Start with one basic.", primary: 'eat', secondary: ['drink', 'take_break', 'reduce_load'] };
      }
      if (resolved === 'a_bit') {
        return { novaLine: 'A little is better than none, but worth topping up properly.', primary: 'drink', secondary: ['eat', 'take_break'] };
      }
      return { novaLine: 'Worth checking in on your capacity before deciding what today needs.', primary: 'check_capacity', secondary: ['take_break', 'drink'] };
    }
  }
};

// The proactive opening's question ("eaten AND drunk properly?") and
// options (it adds "Can't remember") differ from the standard
// single-topic follow-up, so it gets its own small recommendation map
// rather than overloading getFuelRecommendation with a trigger it was
// never asked under.
export const getProactiveRecommendation = (answer: FuelAnswerId): FuelRecommendation => {
  if (answer === 'yes') {
    return {
      novaLine: "Good - the basics are covered. Given how heavy today is, it might be worth removing something rather than adding more.",
      primary: 'one_less_thing',
      secondary: ['take_break', 'check_capacity'],
    };
  }
  if (answer === 'a_bit') {
    return { novaLine: 'A little is better than none, but worth topping up properly.', primary: 'drink', secondary: ['eat', 'one_less_thing'] };
  }
  return { novaLine: "Okay. Don't optimise everything. Start with one basic.", primary: 'eat', secondary: ['drink', 'one_less_thing', 'reduce_load'] };
};

// ---------- Pattern confidence & "what tends to help" ----------

export type FuelPatternConfidence = 'early' | 'emerging' | 'consistent';

export const FUEL_PATTERN_CONFIDENCE_LABELS: Record<FuelPatternConfidence, string> = {
  early: 'Early pattern',
  emerging: 'Emerging pattern',
  consistent: 'Consistent pattern',
};

const MIN_CHECKINS_FOR_PATTERN = 3;

// null below the minimum - never implies scientific certainty, just a
// rough, honestly-labelled confidence band once there's enough history.
export const computeFuelPatternConfidence = (sampleSize: number): FuelPatternConfidence | null => {
  if (sampleSize < MIN_CHECKINS_FOR_PATTERN) return null;
  if (sampleSize < 6) return 'early';
  if (sampleSize < 12) return 'emerging';
  return 'consistent';
};

export type FuelHelpfulness = 'yes' | 'a_little' | 'not_really';

export interface FuelHelpfulnessEntry {
  action: FuelActionId;
  helpful: FuelHelpfulness;
}

const HELPFULNESS_VALUES: Record<FuelHelpfulness, number> = { yes: 2, a_little: 1, not_really: 0 };

export interface FuelActionInsight {
  action: FuelActionId;
  confidence: FuelPatternConfidence;
  averageHelpfulness: number;
}

// "What tends to help" (My Patterns) - same reasoning as energy-delta-
// engine's computePreferredRecoveryAction: a plain average per action,
// only surfaced once there's a real sample and only when it's actually
// trending positive, described as a personal pattern rather than proven
// causation anywhere this is rendered.
export const computeMostHelpfulFuelAction = (entries: FuelHelpfulnessEntry[]): FuelActionInsight | null => {
  const byAction = new Map<FuelActionId, number[]>();
  for (const entry of entries) {
    const list = byAction.get(entry.action) ?? [];
    list.push(HELPFULNESS_VALUES[entry.helpful]);
    byAction.set(entry.action, list);
  }

  let best: FuelActionInsight | null = null;
  for (const [action, values] of byAction) {
    const confidence = computeFuelPatternConfidence(values.length);
    if (!confidence) continue;
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    if (avg <= 1) continue; // not meaningfully positive (1 == "a little", on average)
    if (!best || avg > best.averageHelpfulness) best = { action, confidence, averageHelpfulness: avg };
  }
  return best;
};
