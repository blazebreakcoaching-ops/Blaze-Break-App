// Recovery Signal Candidates - turns real, already-fetched signal data (a
// capacity/delta state, pending workload tasks, recent trigger-journal
// entries, recent mood pulses) into the InterventionCandidate objects
// recovery-routing-engine.ts arbitrates between. Pure functions only (no
// Firestore, no React) - server.ts does the actual reads and hands this
// module plain data, so every rule here stays unit-testable without a
// database.
//
// Deliberately modest for this first wiring pass: one candidate per route
// type, using the lowest-effort real destination module that fits (Guided
// Reset for STABILISE, One Less Thing for REDUCE, Capacity Firewall for
// PROTECT, Recovery Fuel for RECOVER, My Patterns for UNDERSTAND). ACT and
// CONNECT are never auto-generated here - ACT needs a user-confirmed
// pattern Action Engine doesn't yet surface to this layer, and CONNECT is
// explicitly user-initiated only ("the user always decides whether another
// person becomes involved"). Which specific sub-tool to route to within a
// state (e.g. Reset Studio vs. Guided Reset vs. Anxiety Reset) is deferred
// until a real signal exists to tell them apart.

import type { DeltaStateKey } from './energy-delta-engine';
import type { InterventionCandidate, RouteType } from './recovery-routing-engine';

export const MODULE_ROUTE_MAP: Record<string, RouteType> = {
  guided_reset: 'STABILISE',
  reset_studio: 'STABILISE',
  anxiety_reset: 'STABILISE',
  one_less_thing: 'REDUCE',
  workload_reality_check: 'REDUCE',
  capacity_firewall: 'PROTECT',
  boundary_architect: 'PROTECT',
  digital_boundary_shield: 'PROTECT',
  recovery_fuel: 'RECOVER',
  my_patterns: 'UNDERSTAND',
  weekly_review: 'UNDERSTAND',
  action_engine: 'ACT',
  recovery_ally: 'CONNECT',
  support_circle: 'CONNECT',
};

export const isKnownRoutingModule = (sourceModule: string): boolean => sourceModule in MODULE_ROUTE_MAP;

const SEVERELY_STRAINED_DELTA_STATES: DeltaStateKey[] = ['capacity_strained', 'over_capacity', 'significant_gap'];
const ANY_STRAINED_DELTA_STATES: DeltaStateKey[] = ['near_limit', ...SEVERELY_STRAINED_DELTA_STATES];

// Trigger-journal sources the spec itself names as boundary/external-
// pressure categories - repeated entries from these specifically indicate
// a PROTECT-shaped problem, distinct from a general repeated pattern that
// only warrants UNDERSTAND/reflection.
const BOUNDARY_PRESSURE_SOURCES = new Set(['Meetings', 'People (Colleague/Client)', 'Message / Slack Tone']);

const RECOVER_MOOD_LABELS = new Set(['tired', 'flat']);
const STABILISE_MOOD_LABELS = new Set(['overwhelmed', 'frustrated', 'pressured']);

const REPEATED_PATTERN_MIN_COUNT = 3;
const HIGH_CONFIDENCE_PATTERN_COUNT = 5;
const ACUTE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface RecentTriggerSignal {
  source: string;
  severity: 'low' | 'medium' | 'high';
  createdAtMs: number;
}

export interface RecentMoodSignal {
  moodLabel: string;
  intensity: number; // 1-10
  createdAtMs: number;
}

export interface RoutingSignalInput {
  // The latest capacity check-in's stored score (energy-delta-engine's
  // computeCapacityScore, already computed at write time) - null if the
  // person has never checked in.
  capacityScore: number | null;
  // The current Energy Delta state (getDeltaState) computed from that same
  // check-in plus active stressors - null if there's no check-in to derive
  // it from.
  deltaState: DeltaStateKey | null;
  pendingWorkloadTasks: number;
  pendingMustWorkloadTasks: number;
  // Already filtered to a recent window (e.g. last 14 days) and sorted
  // most-recent-first by the caller - this module only counts/inspects,
  // it never decides the window.
  recentTriggers: RecentTriggerSignal[];
  recentMoodPulses: RecentMoodSignal[];
  nowMs: number;
}

// A trigger with no recorded source (e.g. one logged before the source
// field was persisted at all) can never count toward a repeated-source
// pattern - treating it as its own "" category would falsely group
// unrelated historical entries together as if they were all the same
// recurring source.
const countBySource = (triggers: RecentTriggerSignal[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const t of triggers) {
    if (!t.source) continue;
    counts.set(t.source, (counts.get(t.source) ?? 0) + 1);
  }
  return counts;
};

const hasAcuteHighSeverityTrigger = (triggers: RecentTriggerSignal[], nowMs: number): boolean =>
  triggers.some((t) => t.severity === 'high' && nowMs - t.createdAtMs <= ACUTE_WINDOW_MS);

const hasAcuteDistressMood = (moods: RecentMoodSignal[], nowMs: number): RecentMoodSignal | null =>
  moods.find((m) => STABILISE_MOOD_LABELS.has(m.moodLabel) && m.intensity >= 7 && nowMs - m.createdAtMs <= ACUTE_WINDOW_MS) ?? null;

// Builds the STABILISE candidate, if the signals genuinely warrant one.
const buildStabiliseCandidate = (input: RoutingSignalInput): InterventionCandidate | null => {
  const acuteTrigger = hasAcuteHighSeverityTrigger(input.recentTriggers, input.nowMs);
  const acuteMood = hasAcuteDistressMood(input.recentMoodPulses, input.nowMs);
  const severelyStrained = !!input.deltaState && SEVERELY_STRAINED_DELTA_STATES.includes(input.deltaState);

  if (!acuteTrigger && !acuteMood && !severelyStrained) return null;

  const evidence: InterventionCandidate['evidence'] = acuteTrigger || acuteMood
    ? { source: 'current_user_report', confidence: 'high', detail: 'A recent entry reported high-intensity distress.' }
    : { source: 'deterministic_calculation', confidence: 'medium', detail: 'Current demand appears to exceed reported capacity.' };

  return {
    candidateId: 'guided_reset_stabilise',
    sourceModule: 'guided_reset',
    routeType: 'STABILISE',
    reasonCode: 'high_demand_low_capacity',
    evidence,
    userEffort: 'low_bandwidth',
    estimatedDurationMinutes: 5,
    urgency: (acuteTrigger || acuteMood) ? 'high' : 'medium',
    requiresReflection: false,
    requiresExternalAction: false,
    requiresConnector: false,
    requiresHumanContact: false,
    structuralProblem: false,
    prerequisitesMet: true,
    recentlyUsed: false,
    cooldownActive: false,
    eligibleForPrivacyZone: true,
  };
};

// Builds the REDUCE candidate - the spec's signature "make something
// smaller instead of adding another recovery task" behaviour.
const buildReduceCandidate = (input: RoutingSignalInput): InterventionCandidate | null => {
  const strained = !!input.deltaState && ANY_STRAINED_DELTA_STATES.includes(input.deltaState);
  const lowCapacity = typeof input.capacityScore === 'number' && input.capacityScore <= 40;
  if (input.pendingWorkloadTasks <= 0 || !(strained || lowCapacity)) return null;

  const severelyStrained = !!input.deltaState && SEVERELY_STRAINED_DELTA_STATES.includes(input.deltaState);

  return {
    candidateId: 'one_less_thing_reduce',
    sourceModule: 'one_less_thing',
    routeType: 'REDUCE',
    reasonCode: 'high_demand_low_capacity',
    evidence: { source: 'deterministic_calculation', confidence: 'high', detail: 'Pending workload items alongside strained capacity.' },
    userEffort: 'low_bandwidth',
    estimatedDurationMinutes: 2,
    urgency: (input.pendingMustWorkloadTasks > 0 && severelyStrained) ? 'high' : 'medium',
    requiresReflection: false,
    requiresExternalAction: true,
    requiresConnector: false,
    requiresHumanContact: false,
    structuralProblem: true,
    prerequisitesMet: true,
    recentlyUsed: false,
    cooldownActive: false,
    eligibleForPrivacyZone: true,
  };
};

// Builds the PROTECT candidate from a repeated boundary-pressure source.
const buildProtectCandidate = (input: RoutingSignalInput): InterventionCandidate | null => {
  const counts = countBySource(input.recentTriggers);
  let best: { source: string; count: number } | null = null;
  for (const [source, count] of counts) {
    if (!BOUNDARY_PRESSURE_SOURCES.has(source) || count < REPEATED_PATTERN_MIN_COUNT) continue;
    if (!best || count > best.count) best = { source, count };
  }
  if (!best) return null;

  return {
    candidateId: 'capacity_firewall_protect',
    sourceModule: 'capacity_firewall',
    routeType: 'PROTECT',
    reasonCode: 'boundary_issue_confirmed',
    evidence: {
      source: 'recent_repeated_pattern',
      confidence: best.count >= HIGH_CONFIDENCE_PATTERN_COUNT ? 'high' : 'medium',
      detail: `The same source of pressure ("${best.source}") has come up repeatedly recently.`,
    },
    userEffort: 'some_bandwidth',
    estimatedDurationMinutes: 8,
    urgency: 'medium',
    requiresReflection: false,
    requiresExternalAction: false,
    requiresConnector: false,
    requiresHumanContact: false,
    structuralProblem: true,
    prerequisitesMet: true,
    recentlyUsed: false,
    cooldownActive: false,
    eligibleForPrivacyZone: true,
  };
};

// Builds the RECOVER candidate from a depleted-foundation mood signal.
const buildRecoverCandidate = (input: RoutingSignalInput): InterventionCandidate | null => {
  const latestMood = input.recentMoodPulses[0];
  const depleted = !!latestMood && RECOVER_MOOD_LABELS.has(latestMood.moodLabel) && latestMood.intensity >= 6;
  if (!depleted) return null;

  return {
    candidateId: 'recovery_fuel_recover',
    sourceModule: 'recovery_fuel',
    routeType: 'RECOVER',
    reasonCode: 'recovery_foundation_low',
    evidence: { source: 'current_user_report', confidence: 'medium', detail: `Your most recent mood check-in reported feeling ${latestMood!.moodLabel}.` },
    userEffort: 'low_bandwidth',
    estimatedDurationMinutes: 3,
    urgency: 'medium',
    requiresReflection: false,
    requiresExternalAction: false,
    requiresConnector: false,
    requiresHumanContact: false,
    structuralProblem: false,
    prerequisitesMet: true,
    recentlyUsed: false,
    cooldownActive: false,
    eligibleForPrivacyZone: true,
  };
};

// Builds the UNDERSTAND candidate from a general repeated pattern that
// isn't specifically a boundary-pressure source (those are PROTECT's job
// above) - a real recurring pattern worth reflecting on, not acting on yet.
const buildUnderstandCandidate = (input: RoutingSignalInput): InterventionCandidate | null => {
  const counts = countBySource(input.recentTriggers);
  let best: { source: string; count: number } | null = null;
  for (const [source, count] of counts) {
    if (BOUNDARY_PRESSURE_SOURCES.has(source) || count < REPEATED_PATTERN_MIN_COUNT) continue;
    if (!best || count > best.count) best = { source, count };
  }
  if (!best) return null;

  return {
    candidateId: 'my_patterns_understand',
    sourceModule: 'my_patterns',
    routeType: 'UNDERSTAND',
    reasonCode: 'repeated_pressure_pattern',
    evidence: {
      source: 'recent_repeated_pattern',
      confidence: best.count >= HIGH_CONFIDENCE_PATTERN_COUNT ? 'high' : 'medium',
      detail: `"${best.source}" has come up repeatedly recently.`,
    },
    userEffort: 'reflective_bandwidth',
    estimatedDurationMinutes: 10,
    urgency: 'low',
    requiresReflection: true,
    requiresExternalAction: false,
    requiresConnector: false,
    requiresHumanContact: false,
    structuralProblem: false,
    prerequisitesMet: true,
    recentlyUsed: false,
    cooldownActive: false,
    eligibleForPrivacyZone: true,
  };
};

// The single entry point: every rule above is independently evaluated and
// independently either does or doesn't contribute a candidate - the actual
// choice between them is recovery-routing-engine.ts's job, not this one's.
export const buildSignalCandidates = (input: RoutingSignalInput): InterventionCandidate[] =>
  [
    buildStabiliseCandidate(input),
    buildReduceCandidate(input),
    buildProtectCandidate(input),
    buildRecoverCandidate(input),
    buildUnderstandCandidate(input),
  ].filter((c): c is InterventionCandidate => c !== null);

// A minimal candidate for when the user has directly asked for a specific
// module by name, bypassing signal detection entirely - per the spec,
// "If the user requests a specific feature directly: respect the request
// unless a genuine safety/technical restriction applies." Returns null for
// an unrecognised module name rather than guessing a route for it.
export const buildExplicitRequestCandidate = (sourceModule: string): InterventionCandidate | null => {
  const routeType = MODULE_ROUTE_MAP[sourceModule];
  if (!routeType) return null;

  return {
    candidateId: `${sourceModule}_explicit`,
    sourceModule,
    routeType,
    reasonCode: 'explicit_user_request',
    evidence: { source: 'current_user_report', confidence: 'high', detail: 'You asked for this directly.' },
    userEffort: 'reflective_bandwidth', // irrelevant - explicit requests bypass the bandwidth ceiling.
    estimatedDurationMinutes: 5,
    urgency: 'medium',
    requiresReflection: false,
    requiresExternalAction: false,
    requiresConnector: false,
    requiresHumanContact: routeType === 'CONNECT',
    structuralProblem: false,
    prerequisitesMet: true,
    recentlyUsed: false,
    cooldownActive: false,
    eligibleForPrivacyZone: true,
    explicitUserRequest: true,
  };
};
