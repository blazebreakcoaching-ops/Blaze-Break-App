// Energy Delta Model v1 - the deterministic calculation core behind the
// "Energy & Capacity" area of the Recover tab. Pure functions only (no
// Firestore, no React, no AI), mirroring recovery-recipes-engine.ts's own
// "this is trivially unit-testable in isolation" reasoning - every number
// shown to the user traces back to a function in this file, never a model
// guess. The product question this whole file answers:
//
//   "Are the demands on me currently greater than the capacity I have
//    available to meet them?"
//
// Capacity − Net Load = Energy Delta. Recovery rebuilds capacity (via a
// fresh check-in); it never subtracts from load directly - section 8's
// explicit "do not automatically assign fake values" rule.

// ---------- Capacity (section 1) ----------

export type CapacityLevel = 'very_low' | 'low' | 'okay' | 'good' | 'strong';

export const CAPACITY_LEVEL_ORDER: CapacityLevel[] = ['very_low', 'low', 'okay', 'good', 'strong'];

export const CAPACITY_LEVEL_LABELS: Record<CapacityLevel, string> = {
  very_low: 'Very low',
  low: 'Low',
  okay: 'Okay',
  good: 'Good',
  strong: 'Strong',
};

const CAPACITY_LEVEL_VALUES: Record<CapacityLevel, number> = {
  very_low: 0, low: 1, okay: 2, good: 3, strong: 4,
};

export interface CapacityCheckIn {
  physical: CapacityLevel;
  mental: CapacityLevel;
  emotional: CapacityLevel;
}

// Average of the three dimensions × 25, rounded to a whole 0-100 score -
// the user only ever sees the resulting number and its plain-language
// interpretation, never this arithmetic (section 1: "the user does not
// need to see how this mathematics works").
export const computeCapacityScore = (checkIn: CapacityCheckIn): number => {
  const avg = (CAPACITY_LEVEL_VALUES[checkIn.physical] + CAPACITY_LEVEL_VALUES[checkIn.mental] + CAPACITY_LEVEL_VALUES[checkIn.emotional]) / 3;
  return Math.round(avg * 25);
};

// Plain-language interpretation of a capacity score - section 1's "Moderate
// capacity today" example, generalised to the other four bands so every
// capacity level a check-in can actually produce has matching copy.
export const describeCapacity = (score: number): string => {
  if (score <= 15) return 'Very low capacity today';
  if (score <= 40) return 'Low capacity today';
  if (score <= 65) return 'Moderate capacity today';
  if (score <= 85) return 'Good capacity today';
  return 'Strong capacity today';
};

// ---------- Stressors (sections 2-4) ----------

export type StressorSeverity = 1 | 2 | 3 | 4 | 5;
export type StressorPersistence = 'one_off' | 'repeated' | 'ongoing';
// How much a reported action (delegating, cancelling, setting a boundary,
// etc.) reduced a specific stressor's demand - section 4's "Did this
// reduce the demand?" check, never a raw point value the user has to
// invent themselves.
export type ReductionLevel = 'not_yet' | 'a_little' | 'meaningfully' | 'a_lot';
export type StressorCategory = 'professional' | 'social' | 'emotional' | 'logistical';
// Section 15's Energy Audit classification - what the person can actually
// do about a given demand, not just "it exists". Optional: a freshly
// logged stressor has no classification yet until the person chooses one.
export type StressorAction = 'control' | 'reduce' | 'delegate' | 'defer' | 'accept';

export const STRESSOR_SEVERITY_ORDER: StressorSeverity[] = [1, 2, 3, 4, 5];

export const STRESSOR_SEVERITY_LABELS: Record<StressorSeverity, string> = {
  1: 'Light', 2: 'Noticeable', 3: 'Significant', 4: 'Heavy', 5: 'Very heavy',
};

const STRESSOR_SEVERITY_BASE_VALUES: Record<StressorSeverity, number> = {
  1: 10, 2: 20, 3: 30, 4: 40, 5: 50,
};

export const STRESSOR_PERSISTENCE_ORDER: StressorPersistence[] = ['one_off', 'repeated', 'ongoing'];

export const STRESSOR_PERSISTENCE_LABELS: Record<StressorPersistence, string> = {
  one_off: 'One-off', repeated: 'Happening repeatedly', ongoing: 'Ongoing',
};

const STRESSOR_PERSISTENCE_MULTIPLIERS: Record<StressorPersistence, number> = {
  one_off: 0.8, repeated: 1.0, ongoing: 1.15,
};

export const REDUCTION_LEVEL_ORDER: ReductionLevel[] = ['not_yet', 'a_little', 'meaningfully', 'a_lot'];

export const REDUCTION_LEVEL_LABELS: Record<ReductionLevel, string> = {
  not_yet: 'Not yet', a_little: 'A little', meaningfully: 'Meaningfully', a_lot: 'A lot',
};

const REDUCTION_LEVEL_PERCENTAGES: Record<ReductionLevel, number> = {
  not_yet: 0, a_little: 0.10, meaningfully: 0.20, a_lot: 0.35,
};

export const STRESSOR_CATEGORY_LABELS: Record<StressorCategory, string> = {
  professional: 'Work', emotional: 'Emotional', social: 'Social', logistical: 'Life admin',
};

export const STRESSOR_ACTION_LABELS: Record<StressorAction, string> = {
  control: 'Control it', reduce: 'Reduce it', delegate: 'Delegate it', defer: 'Defer it', accept: 'Accept it',
};

export interface Stressor {
  id: string;
  name: string;
  category: StressorCategory;
  severity: StressorSeverity;
  persistence: StressorPersistence;
  // The most recently reported reduction, if any action has been taken
  // against this stressor yet (section 4) - undefined means "not yet
  // addressed", distinct from an explicit 'not_yet' report.
  reduction?: ReductionLevel;
  action?: StressorAction;
  status: 'active' | 'resolved';
  createdAt: string;
  updatedAt: string;
  // Only ever set on an illustrative demo-data.ts stressor seeded during a
  // demo session - never on a real stressor the visitor logged. Gates
  // every write path in EnergyBudgetMatrix.tsx, since a sample stressor
  // has no real Firestore document behind it.
  isSample?: boolean;
}

// The persistence-adjusted value before any reduction is applied -
// section 2's "internal stressor value" (e.g. Heavy·Ongoing = 40×1.15=46).
// Never shown to the user as a raw number.
export const computeStressorBaseValue = (severity: StressorSeverity, persistence: StressorPersistence): number =>
  STRESSOR_SEVERITY_BASE_VALUES[severity] * STRESSOR_PERSISTENCE_MULTIPLIERS[persistence];

// The stressor's value right now, after whatever reduction has most
// recently been reported against it (section 4's worked example: a Heavy
// stressor's base 40, reduced "Meaningfully" by 20%, becomes 32).
export const computeStressorCurrentValue = (stressor: Pick<Stressor, 'severity' | 'persistence' | 'reduction'>): number => {
  const base = computeStressorBaseValue(stressor.severity, stressor.persistence);
  const reductionPct = stressor.reduction ? REDUCTION_LEVEL_PERCENTAGES[stressor.reduction] : 0;
  return base * (1 - reductionPct);
};

// How much capacity a single stressor's own reduction has protected -
// section 4's "+8" example. Purely the difference between what it would
// have cost and what it costs now.
export const computeStressorCapacityProtected = (stressor: Pick<Stressor, 'severity' | 'persistence' | 'reduction'>): number =>
  computeStressorBaseValue(stressor.severity, stressor.persistence) - computeStressorCurrentValue(stressor);

// ---------- Load saturation (section 3) ----------

// Section 3's saturation formula - Gross Load = 100 × (1 − product of
// (1 − each stressor/100)). Keeps the scale bounded at 100 regardless of
// how many stressors are active, with diminishing impact per additional
// one, rather than letting values pile up into something like "180%".
// values are expected in the 0-100 range (not yet divided by 100).
const saturate = (values: number[]): number => {
  if (values.length === 0) return 0;
  const product = values.reduce((acc, v) => acc * (1 - Math.max(0, Math.min(100, v)) / 100), 1);
  return 100 * (1 - product);
};

// Gross Load: demand before any reductions are taken into account - what's
// actually being asked, ignoring boundaries already set (section 3).
export const computeGrossLoad = (stressors: Pick<Stressor, 'severity' | 'persistence' | 'status'>[]): number =>
  saturate(stressors.filter((s) => s.status === 'active').map((s) => computeStressorBaseValue(s.severity, s.persistence)));

// Net Load: demand after reductions - section 5's "Gross Load after
// reductions". Computed via the same saturation formula over each active
// stressor's current (post-reduction) value, so it stays internally
// consistent with Gross Load rather than a raw subtraction that could
// behave oddly across several partially-reduced stressors.
export const computeNetLoad = (stressors: Pick<Stressor, 'severity' | 'persistence' | 'reduction' | 'status'>[]): number =>
  saturate(stressors.filter((s) => s.status === 'active').map((s) => computeStressorCurrentValue(s)));

// Capacity Protected (aggregate): the gap reductions have actually closed,
// shown on the dashboard (section 4/16) - Gross Load minus Net Load, both
// already saturation-consistent.
export const computeCapacityProtected = (stressors: Pick<Stressor, 'severity' | 'persistence' | 'reduction' | 'status'>[]): number =>
  computeGrossLoad(stressors) - computeNetLoad(stressors);

// ---------- Energy Delta (section 6) ----------

export interface EnergyDeltaResult {
  capacity: number;
  grossLoad: number;
  netLoad: number;
  capacityProtected: number;
  energyDelta: number;
}

export const computeEnergyDelta = (
  capacity: number,
  stressors: Pick<Stressor, 'severity' | 'persistence' | 'reduction' | 'status'>[]
): EnergyDeltaResult => {
  const grossLoad = computeGrossLoad(stressors);
  const netLoad = computeNetLoad(stressors);
  return {
    capacity,
    grossLoad,
    netLoad,
    capacityProtected: grossLoad - netLoad,
    energyDelta: capacity - netLoad,
  };
};

// ---------- Delta states (section 7) ----------

export type DeltaStateKey = 'buffer_available' | 'within_capacity' | 'near_limit' | 'capacity_strained' | 'over_capacity' | 'significant_gap';

export interface DeltaState {
  key: DeltaStateKey;
  label: string;
  description: string;
  // Never "show a red score and leave them there" (section 7) - every
  // state carries at least one real next action.
  actions: string[];
}

// Ordered from most buffer to most strained - min is inclusive, checked
// top-down, so the first band whose min the delta meets or exceeds wins.
const DELTA_STATE_BANDS: (DeltaState & { min: number })[] = [
  {
    key: 'buffer_available', min: 20, label: 'Buffer available',
    description: "Your current demands are comfortably within the capacity you've reported.",
    actions: ['Protect Capacity'],
  },
  {
    key: 'within_capacity', min: 5, label: 'Within capacity',
    description: "Your current demands appear manageable within today's available capacity.",
    actions: ['Protect Capacity', 'Choose Recovery'],
  },
  {
    key: 'near_limit', min: -4, label: 'Near your limit',
    description: "Demand and available capacity are closely matched. There isn't much room for extra load.",
    actions: ['Reduce Load', 'Protect Capacity'],
  },
  {
    key: 'capacity_strained', min: -19, label: 'Capacity strained',
    description: 'Your demands are running ahead of the capacity you currently have available.',
    actions: ['Reduce Load', 'Choose Recovery'],
  },
  {
    key: 'over_capacity', min: -39, label: 'Over capacity',
    description: "You're carrying considerably more than your current capacity comfortably supports.",
    actions: ['Reduce Load', 'Protect Capacity', 'Choose Recovery'],
  },
  {
    key: 'significant_gap', min: -Infinity, label: 'Significant capacity gap',
    description: 'Your reported demands substantially exceed the capacity you currently have available.',
    actions: ['Reduce Load', 'Choose Recovery', 'Find the biggest drain'],
  },
];

export const getDeltaState = (energyDelta: number): DeltaState => {
  const band = DELTA_STATE_BANDS.find((b) => energyDelta >= b.min)!;
  return { key: band.key, label: band.label, description: band.description, actions: band.actions };
};

// ---------- Seven-Day pattern (sections 10-12) ----------

export interface DailyEnergyRecord {
  date: string; // YYYY-MM-DD
  capacity: number | null; // null = no check-in that day (section 17 - never coerce missing to 0)
  grossLoad: number;
  netLoad: number;
  capacityProtected: number;
  energyDelta: number | null; // null whenever capacity is null - nothing to compare load against
}

// A day only counts toward the pattern once it has a real capacity
// reading - section 10/17's "never convert missing information into
// zero" applies here too: a day with stressors logged but no check-in
// has a real load, but no delta to speak of.
export const MIN_VALID_DAYS_FOR_PATTERN = 3;

export const getValidDays = (days: DailyEnergyRecord[]): DailyEnergyRecord[] =>
  days.filter((d) => d.energyDelta !== null);

// Section 11's 7-Day Energy Delta - the average of whatever valid days
// exist (never requires a full 7), or null before there's enough history
// to mean anything (section 10's 3-valid-day minimum).
export const computeSevenDayDelta = (days: DailyEnergyRecord[]): number | null => {
  const valid = getValidDays(days);
  if (valid.length < MIN_VALID_DAYS_FOR_PATTERN) return null;
  return valid.reduce((sum, d) => sum + d.energyDelta!, 0) / valid.length;
};

// Section 11's supporting insight - "4 of your last 5 check-ins showed
// more demand than available capacity", a plain fact rather than an
// interpretation of the average itself.
export const countStrainedDays = (days: DailyEnergyRecord[], threshold = 0): number =>
  getValidDays(days).filter((d) => d.energyDelta! < threshold).length;

// ---------- Sustained Capacity Gap (section 12) ----------

export const SUSTAINED_GAP_DELTA_THRESHOLD = -10;
export const SUSTAINED_GAP_MIN_DAYS = 4;
export const SUSTAINED_GAP_WINDOW = 7;

// Triggers only once there's enough real history to say something
// responsible (section 10's floor applies here too) - never a diagnosis,
// just a factual pattern observation (section 12's explicit "do not say
// 'you are burning out'").
export const detectSustainedCapacityGap = (days: DailyEnergyRecord[]): boolean => {
  const recent = days.slice(-SUSTAINED_GAP_WINDOW);
  const valid = getValidDays(recent);
  if (valid.length < MIN_VALID_DAYS_FOR_PATTERN) return false;
  const strainedCount = valid.filter((d) => d.energyDelta! < SUSTAINED_GAP_DELTA_THRESHOLD).length;
  return strainedCount >= SUSTAINED_GAP_MIN_DAYS;
};
