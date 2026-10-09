import { describe, it, expect } from 'vitest';
import {
  buildSignalCandidates, buildExplicitRequestCandidate, isKnownRoutingModule, MODULE_ROUTE_MAP,
  RoutingSignalInput,
} from './recovery-signal-candidates';

const NOW = 1_700_000_000_000;

const baseInput: RoutingSignalInput = {
  capacityScore: null,
  deltaState: null,
  pendingWorkloadTasks: 0,
  pendingMustWorkloadTasks: 0,
  recentTriggers: [],
  recentMoodPulses: [],
  nowMs: NOW,
};

describe('buildSignalCandidates - no signal', () => {
  it('produces no candidates when nothing warrants one', () => {
    expect(buildSignalCandidates(baseInput)).toEqual([]);
  });
});

describe('buildSignalCandidates - STABILISE', () => {
  it('fires on a recent high-severity trigger (within the acute window)', () => {
    const candidates = buildSignalCandidates({
      ...baseInput,
      recentTriggers: [{ source: 'Meetings', severity: 'high', createdAtMs: NOW - 60 * 60 * 1000 }],
    });
    const stabilise = candidates.find((c) => c.routeType === 'STABILISE');
    expect(stabilise).toBeTruthy();
    expect(stabilise?.urgency).toBe('high');
    expect(stabilise?.evidence.source).toBe('current_user_report');
  });

  it('does not fire on a high-severity trigger outside the acute window', () => {
    const candidates = buildSignalCandidates({
      ...baseInput,
      recentTriggers: [{ source: 'Meetings', severity: 'high', createdAtMs: NOW - 10 * 60 * 60 * 1000 }],
    });
    expect(candidates.find((c) => c.routeType === 'STABILISE')).toBeUndefined();
  });

  it('fires on an acute distress mood pulse', () => {
    const candidates = buildSignalCandidates({
      ...baseInput,
      recentMoodPulses: [{ moodLabel: 'overwhelmed', intensity: 8, createdAtMs: NOW - 30 * 60 * 1000 }],
    });
    expect(candidates.find((c) => c.routeType === 'STABILISE')).toBeTruthy();
  });

  it('fires on a severely strained delta state even with no recent trigger/mood', () => {
    const candidates = buildSignalCandidates({ ...baseInput, deltaState: 'over_capacity' });
    const stabilise = candidates.find((c) => c.routeType === 'STABILISE');
    expect(stabilise).toBeTruthy();
    expect(stabilise?.urgency).toBe('medium');
    expect(stabilise?.evidence.source).toBe('deterministic_calculation');
  });

  it('does not fire on a merely near_limit delta state alone', () => {
    const candidates = buildSignalCandidates({ ...baseInput, deltaState: 'near_limit' });
    expect(candidates.find((c) => c.routeType === 'STABILISE')).toBeUndefined();
  });
});

describe('buildSignalCandidates - REDUCE', () => {
  it('fires when pending workload tasks exist alongside strained capacity', () => {
    const candidates = buildSignalCandidates({ ...baseInput, pendingWorkloadTasks: 3, deltaState: 'near_limit' });
    const reduce = candidates.find((c) => c.routeType === 'REDUCE');
    expect(reduce).toBeTruthy();
    expect(reduce?.structuralProblem).toBe(true);
  });

  it('fires when pending workload tasks exist alongside a low capacity score, with no delta state at all', () => {
    const candidates = buildSignalCandidates({ ...baseInput, pendingWorkloadTasks: 2, capacityScore: 30 });
    expect(candidates.find((c) => c.routeType === 'REDUCE')).toBeTruthy();
  });

  it('does not fire when there is no pending workload, however strained', () => {
    const candidates = buildSignalCandidates({ ...baseInput, pendingWorkloadTasks: 0, deltaState: 'significant_gap' });
    expect(candidates.find((c) => c.routeType === 'REDUCE')).toBeUndefined();
  });

  it('does not fire when workload is pending but capacity is fine', () => {
    const candidates = buildSignalCandidates({ ...baseInput, pendingWorkloadTasks: 3, capacityScore: 90, deltaState: 'buffer_available' });
    expect(candidates.find((c) => c.routeType === 'REDUCE')).toBeUndefined();
  });

  it('is high urgency only when a must-task is pending alongside severe strain', () => {
    const mild = buildSignalCandidates({ ...baseInput, pendingWorkloadTasks: 3, pendingMustWorkloadTasks: 1, deltaState: 'near_limit' });
    expect(mild.find((c) => c.routeType === 'REDUCE')?.urgency).toBe('medium');

    const severe = buildSignalCandidates({ ...baseInput, pendingWorkloadTasks: 3, pendingMustWorkloadTasks: 1, deltaState: 'over_capacity' });
    expect(severe.find((c) => c.routeType === 'REDUCE')?.urgency).toBe('high');
  });
});

describe('buildSignalCandidates - PROTECT vs UNDERSTAND', () => {
  const repeat = (source: string, n: number) => Array.from({ length: n }, (_, i) => ({ source, severity: 'medium' as const, createdAtMs: NOW - i * 1000 }));

  it('a repeated boundary-pressure source (Meetings) yields PROTECT, not UNDERSTAND', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentTriggers: repeat('Meetings', 3) });
    expect(candidates.find((c) => c.routeType === 'PROTECT')).toBeTruthy();
    expect(candidates.find((c) => c.routeType === 'UNDERSTAND')).toBeUndefined();
  });

  it('a repeated non-boundary source yields UNDERSTAND, not PROTECT', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentTriggers: repeat('Scope / Deadline creep', 3) });
    expect(candidates.find((c) => c.routeType === 'UNDERSTAND')).toBeTruthy();
    expect(candidates.find((c) => c.routeType === 'PROTECT')).toBeUndefined();
  });

  it('fewer than 3 repeats of the same source is not yet a pattern', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentTriggers: repeat('Meetings', 2) });
    expect(candidates.find((c) => c.routeType === 'PROTECT')).toBeUndefined();
  });

  it('confidence rises to high at 5+ repeats', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentTriggers: repeat('Meetings', 5) });
    expect(candidates.find((c) => c.routeType === 'PROTECT')?.evidence.confidence).toBe('high');
  });

  it('an empty/missing source (historical entries logged before source was persisted) never counts toward a pattern', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentTriggers: repeat('', 5) });
    expect(candidates.find((c) => c.routeType === 'UNDERSTAND')).toBeUndefined();
    expect(candidates.find((c) => c.routeType === 'PROTECT')).toBeUndefined();
  });

  it('the UNDERSTAND candidate requires reflective bandwidth (never demanded cheaply)', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentTriggers: repeat('Scope / Deadline creep', 3) });
    expect(candidates.find((c) => c.routeType === 'UNDERSTAND')?.userEffort).toBe('reflective_bandwidth');
  });
});

describe('buildSignalCandidates - RECOVER', () => {
  it('fires on a recent depleted-foundation mood pulse', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentMoodPulses: [{ moodLabel: 'tired', intensity: 7, createdAtMs: NOW }] });
    expect(candidates.find((c) => c.routeType === 'RECOVER')).toBeTruthy();
  });

  it('does not fire on a low-intensity tired mood pulse', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentMoodPulses: [{ moodLabel: 'tired', intensity: 3, createdAtMs: NOW }] });
    expect(candidates.find((c) => c.routeType === 'RECOVER')).toBeUndefined();
  });

  it('does not fire on an unrelated mood label', () => {
    const candidates = buildSignalCandidates({ ...baseInput, recentMoodPulses: [{ moodLabel: 'focused', intensity: 9, createdAtMs: NOW }] });
    expect(candidates.find((c) => c.routeType === 'RECOVER')).toBeUndefined();
  });
});

describe('buildSignalCandidates - moduleHistory', () => {
  it('defaults every candidate to no history when moduleHistory is omitted', () => {
    const candidates = buildSignalCandidates({ ...baseInput, deltaState: 'over_capacity' });
    const stabilise = candidates.find((c) => c.routeType === 'STABILISE');
    expect(stabilise?.recentlyUsed).toBe(false);
    expect(stabilise?.cooldownActive).toBe(false);
  });

  it('carries real recentlyUsed/cooldownActive through for the matching module', () => {
    const candidates = buildSignalCandidates({
      ...baseInput, deltaState: 'over_capacity',
      moduleHistory: { guided_reset: { recentlyUsed: true, cooldownActive: true } },
    });
    const stabilise = candidates.find((c) => c.routeType === 'STABILISE');
    expect(stabilise?.recentlyUsed).toBe(true);
    expect(stabilise?.cooldownActive).toBe(true);
  });

  it('history for an unrelated module never leaks onto a different candidate', () => {
    const candidates = buildSignalCandidates({
      ...baseInput, deltaState: 'over_capacity',
      moduleHistory: { recovery_fuel: { recentlyUsed: true, cooldownActive: true } },
    });
    const stabilise = candidates.find((c) => c.routeType === 'STABILISE');
    expect(stabilise?.recentlyUsed).toBe(false);
    expect(stabilise?.cooldownActive).toBe(false);
  });
});

describe('isKnownRoutingModule / MODULE_ROUTE_MAP', () => {
  it('recognises every module this PR\'s candidates can name as a source', () => {
    expect(isKnownRoutingModule('guided_reset')).toBe(true);
    expect(isKnownRoutingModule('one_less_thing')).toBe(true);
    expect(isKnownRoutingModule('capacity_firewall')).toBe(true);
    expect(isKnownRoutingModule('recovery_fuel')).toBe(true);
    expect(isKnownRoutingModule('my_patterns')).toBe(true);
  });

  it('rejects an unknown module name', () => {
    expect(isKnownRoutingModule('not_a_real_module')).toBe(false);
  });

  it('every mapped module has a valid route type', () => {
    const validRoutes = new Set(['STABILISE', 'REDUCE', 'PROTECT', 'RECOVER', 'UNDERSTAND', 'ACT', 'CONNECT']);
    for (const route of Object.values(MODULE_ROUTE_MAP)) expect(validRoutes.has(route)).toBe(true);
  });
});

describe('buildExplicitRequestCandidate', () => {
  it('builds a candidate for a known module, marked explicit and high confidence', () => {
    const candidate = buildExplicitRequestCandidate('capacity_firewall');
    expect(candidate).toMatchObject({
      sourceModule: 'capacity_firewall', routeType: 'PROTECT', explicitUserRequest: true,
      reasonCode: 'explicit_user_request',
    });
    expect(candidate?.evidence.confidence).toBe('high');
  });

  it('returns null for an unrecognised module rather than guessing a route', () => {
    expect(buildExplicitRequestCandidate('not_a_real_module')).toBeNull();
  });

  it('marks requiresHumanContact true only for a CONNECT-routed module', () => {
    expect(buildExplicitRequestCandidate('recovery_ally')?.requiresHumanContact).toBe(true);
    expect(buildExplicitRequestCandidate('one_less_thing')?.requiresHumanContact).toBe(false);
  });
});
