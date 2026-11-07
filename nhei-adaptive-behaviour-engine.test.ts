import { describe, it, expect } from 'vitest';
import { detectBehaviouralPatterns, MIN_OCCURRENCES_FOR_BEHAVIOURAL_PATTERN } from './nhei-adaptive-behaviour-engine';
import { type NheiEvidenceRecord } from './nhei-types';
import { type NheiTemporalRelation } from './nhei-temporal-engine';

function makeRecord(overrides: Partial<NheiEvidenceRecord>): NheiEvidenceRecord {
  return {
    id: 'ev1',
    sourceType: 'USER_REPORTED_EVENT',
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: [],
    dimensions: [],
    relatedEventIds: [],
    ...overrides,
  };
}

function makeSequenceRelation(fromEventId: string, toEventId: string): NheiTemporalRelation {
  return {
    fromEventId, toEventId, relationType: 'SEQUENCE',
    interpretationConfidence: 'medium', derivedBy: 'engine_computed', rationale: 'timestamp_order',
  };
}

describe('detectBehaviouralPatterns - evidence threshold', () => {
  it('returns no pattern for a single behaviour-outcome occurrence (insufficient evidence)', () => {
    const behaviour = makeRecord({ id: 'b1', sourceType: 'USER_REPORTED_BEHAVIOUR', selfSystems: ['INTERNAL_SELF'] });
    const outcome = makeRecord({ id: 'o1', sourceType: 'USER_REPORTED_OUTCOME', selfSystems: ['INTERNAL_SELF'] });
    const patterns = detectBehaviouralPatterns([behaviour, outcome], [makeSequenceRelation('b1', 'o1')]);
    expect(patterns).toEqual([]);
  });

  it(`surfaces a pattern once at least ${MIN_OCCURRENCES_FOR_BEHAVIOURAL_PATTERN} behaviour->outcome occurrences share a tag`, () => {
    const b1 = makeRecord({ id: 'b1', sourceType: 'USER_REPORTED_BEHAVIOUR', selfSystems: ['INTERNAL_SELF'] });
    const o1 = makeRecord({ id: 'o1', sourceType: 'USER_REPORTED_OUTCOME', selfSystems: ['INTERNAL_SELF'] });
    const b2 = makeRecord({ id: 'b2', sourceType: 'USER_REPORTED_BEHAVIOUR', selfSystems: ['INTERNAL_SELF'] });
    const o2 = makeRecord({ id: 'o2', sourceType: 'USER_REPORTED_OUTCOME', selfSystems: ['INTERNAL_SELF'] });
    const relations = [makeSequenceRelation('b1', 'o1'), makeSequenceRelation('b2', 'o2')];
    const patterns = detectBehaviouralPatterns([b1, o1, b2, o2], relations);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].occurrenceCount).toBe(2);
    expect(patterns[0].behaviourEventIds.sort()).toEqual(['b1', 'b2']);
    expect(patterns[0].outcomeEventIds.sort()).toEqual(['o1', 'o2']);
  });

  it('never asserts a causal claim - causalClaim is always false, even for a strong pattern', () => {
    const b1 = makeRecord({ id: 'b1', sourceType: 'USER_REPORTED_BEHAVIOUR', dimensions: ['EMOTIONAL'] });
    const o1 = makeRecord({ id: 'o1', sourceType: 'USER_REPORTED_OUTCOME', dimensions: ['EMOTIONAL'] });
    const b2 = makeRecord({ id: 'b2', sourceType: 'USER_REPORTED_BEHAVIOUR', dimensions: ['EMOTIONAL'] });
    const o2 = makeRecord({ id: 'o2', sourceType: 'USER_REPORTED_OUTCOME', dimensions: ['EMOTIONAL'] });
    const b3 = makeRecord({ id: 'b3', sourceType: 'USER_REPORTED_BEHAVIOUR', dimensions: ['EMOTIONAL'] });
    const o3 = makeRecord({ id: 'o3', sourceType: 'USER_REPORTED_OUTCOME', dimensions: ['EMOTIONAL'] });
    const relations = [makeSequenceRelation('b1', 'o1'), makeSequenceRelation('b2', 'o2'), makeSequenceRelation('b3', 'o3')];
    const patterns = detectBehaviouralPatterns([b1, o1, b2, o2, b3, o3], relations);
    expect(patterns.every((p) => p.causalClaim === false)).toBe(true);
    // The type itself only allows `false` - this assertion is a runtime
    // confirmation of a compile-time guarantee.
  });

  it('only counts SEQUENCE/RECURRENCE relations between a behaviour and a later outcome, not any pair', () => {
    const event = makeRecord({ id: 'e1', sourceType: 'USER_REPORTED_EVENT' }); // not a behaviour or outcome
    const thought = makeRecord({ id: 't1', sourceType: 'USER_REPORTED_THOUGHT' });
    const patterns = detectBehaviouralPatterns([event, thought], [makeSequenceRelation('e1', 't1')]);
    expect(patterns).toEqual([]);
  });

  it('excludes a disputed interpretation from contributing to a pattern', () => {
    const b1 = makeRecord({ id: 'b1', sourceType: 'USER_REPORTED_BEHAVIOUR', selfSystems: ['RELATIONAL_SELF'] });
    const o1 = makeRecord({ id: 'o1', sourceType: 'USER_REPORTED_OUTCOME', selfSystems: ['RELATIONAL_SELF'] });
    const b2 = makeRecord({ id: 'b2', sourceType: 'USER_REPORTED_BEHAVIOUR', selfSystems: ['RELATIONAL_SELF'], confirmationState: 'user_disputed' });
    const o2 = makeRecord({ id: 'o2', sourceType: 'USER_REPORTED_OUTCOME', selfSystems: ['RELATIONAL_SELF'] });
    const relations = [makeSequenceRelation('b1', 'o1'), makeSequenceRelation('b2', 'o2')];
    const patterns = detectBehaviouralPatterns([b1, o1, b2, o2], relations);
    // b2 is disputed, so only one valid occurrence remains - below threshold.
    expect(patterns).toEqual([]);
  });

  it('handles empty input without error', () => {
    expect(detectBehaviouralPatterns([], [])).toEqual([]);
  });
});
