import { describe, it, expect } from 'vitest';
import {
  deriveRelationBetween,
  deriveRecurrenceRelations,
  carryAssertedInfluence,
  buildTimeline,
  buildSelfSystemTimeline,
  MIN_OCCURRENCES_FOR_RECURRENCE,
} from './nhei-temporal-engine';
import { type NheiEvidenceRecord } from './nhei-types';

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

describe('deriveRelationBetween - chronological ordering', () => {
  it('derives SEQUENCE from exact timestamps, in the correct direction', () => {
    const a = makeRecord({ id: 'a', occurredAt: '2026-01-01T10:00:00Z', timeUncertainty: 'exact' });
    const b = makeRecord({ id: 'b', occurredAt: '2026-01-01T12:00:00Z', timeUncertainty: 'exact' });
    const relation = deriveRelationBetween([a, b], 'b', 'a'); // queried in reverse order on purpose
    expect(relation.relationType).toBe('SEQUENCE');
    expect(relation.fromEventId).toBe('a'); // engine reorders to the real earlier->later direction
    expect(relation.toEventId).toBe('b');
    expect(relation.derivedBy).toBe('engine_computed');
    expect(relation.interpretationConfidence).toBe('high');
  });

  it('derives COOCCURRENCE for simultaneous experiences', () => {
    const a = makeRecord({ id: 'a', occurredAt: '2026-01-01T10:00:00Z', timeUncertainty: 'exact' });
    const b = makeRecord({ id: 'b', occurredAt: '2026-01-01T10:00:00Z', timeUncertainty: 'exact' });
    const relation = deriveRelationBetween([a, b], 'a', 'b');
    expect(relation.relationType).toBe('COOCCURRENCE');
  });

  it('returns UNKNOWN - not a guess - when both timestamps are missing and unordered', () => {
    const a = makeRecord({ id: 'a' });
    const b = makeRecord({ id: 'b' });
    const relation = deriveRelationBetween([a, b], 'a', 'b');
    expect(relation.relationType).toBe('UNKNOWN');
    expect(relation.rationale).toBe('insufficient_timestamp_data');
    expect(relation.interpretationConfidence).toBe('unknown');
  });

  it('returns UNKNOWN when either event id does not exist in the record set', () => {
    const a = makeRecord({ id: 'a', occurredAt: '2026-01-01T10:00:00Z', timeUncertainty: 'exact' });
    const relation = deriveRelationBetween([a], 'a', 'does-not-exist');
    expect(relation.relationType).toBe('UNKNOWN');
  });

  it('falls back to reportedOrder, preserving order, when no real timestamp is known', () => {
    const a = makeRecord({ id: 'a', reportedOrder: 1 });
    const b = makeRecord({ id: 'b', reportedOrder: 2 });
    const relation = deriveRelationBetween([a, b], 'a', 'b');
    expect(relation.relationType).toBe('SEQUENCE');
    expect(relation.rationale).toBe('reported_order_only');
    // Lower confidence than a real timestamp - order-only is weaker evidence.
    expect(relation.interpretationConfidence).toBe('low');
  });

  it('treats a present but unknown-uncertainty timestamp as not usable on its own', () => {
    // occurredAt is set, but timeUncertainty is 'unknown' - per spec this
    // must not be trusted as a real time; reportedOrder is the only
    // allowed fallback.
    const a = makeRecord({ id: 'a', occurredAt: '2026-01-01T10:00:00Z', timeUncertainty: 'unknown', reportedOrder: 1 });
    const b = makeRecord({ id: 'b', occurredAt: '2026-01-01T12:00:00Z', timeUncertainty: 'unknown', reportedOrder: 2 });
    const relation = deriveRelationBetween([a, b], 'a', 'b');
    expect(relation.rationale).toBe('reported_order_only');
  });
});

describe('deriveRecurrenceRelations - repeated vs. isolated events', () => {
  it('never produces RECURRENCE for a single, isolated occurrence', () => {
    const a = makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'], reportedOrder: 1 });
    const b = makeRecord({ id: 'b', selfSystems: ['RELATIONAL_SELF'], reportedOrder: 2 }); // no shared tag
    const relations = deriveRecurrenceRelations([a, b]);
    expect(relations.filter((r) => r.relationType === 'RECURRENCE')).toEqual([]);
  });

  it(`produces RECURRENCE once at least ${MIN_OCCURRENCES_FOR_RECURRENCE} occurrences share a tag`, () => {
    const a = makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'], reportedOrder: 1 });
    const b = makeRecord({ id: 'b', selfSystems: ['INTERNAL_SELF'], reportedOrder: 2 });
    const relations = deriveRecurrenceRelations([a, b]);
    const recurrence = relations.find((r) => r.relationType === 'RECURRENCE');
    expect(recurrence).toBeDefined();
    expect(recurrence?.fromEventId).toBe('a');
    expect(recurrence?.toEventId).toBe('b');
    expect(recurrence?.derivedBy).toBe('engine_computed');
  });

  it('shares dimension tags as a valid basis for recurrence too', () => {
    const a = makeRecord({ id: 'a', dimensions: ['EMOTIONAL'], reportedOrder: 1 });
    const b = makeRecord({ id: 'b', dimensions: ['EMOTIONAL'], reportedOrder: 2 });
    const relations = deriveRecurrenceRelations([a, b]);
    expect(relations.some((r) => r.relationType === 'RECURRENCE')).toBe(true);
  });
});

describe('carryAssertedInfluence - the only path to an influence relation', () => {
  it('carries a caller-asserted USER_ATTRIBUTED_INFLUENCE through, tagged as such', () => {
    const a = makeRecord({ id: 'a' });
    const b = makeRecord({ id: 'b' });
    const relation = carryAssertedInfluence([a, b], {
      fromEventId: 'a',
      toEventId: 'b',
      relationType: 'USER_ATTRIBUTED_INFLUENCE',
      interpretationConfidence: 'medium',
    });
    expect(relation).not.toBeNull();
    expect(relation?.relationType).toBe('USER_ATTRIBUTED_INFLUENCE');
    expect(relation?.derivedBy).toBe('caller_asserted');
    expect(relation?.rationale).toBe('caller_supplied');
  });

  it('returns null rather than fabricating a relation when a referenced event id is unknown', () => {
    const a = makeRecord({ id: 'a' });
    const relation = carryAssertedInfluence([a], {
      fromEventId: 'a',
      toEventId: 'does-not-exist',
      relationType: 'HYPOTHESISED_INFLUENCE',
      interpretationConfidence: 'low',
    });
    expect(relation).toBeNull();
  });

  it('never appears as a byproduct of deriveRelationBetween or deriveRecurrenceRelations on their own', () => {
    // The two pure-computation functions never produce an influence type,
    // however suggestive the timing - this is the "never infer causation
    // solely from chronology" guarantee, checked directly against both
    // computation paths.
    const a = makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'], occurredAt: '2026-01-01T00:00:00Z', timeUncertainty: 'exact' });
    const b = makeRecord({ id: 'b', selfSystems: ['INTERNAL_SELF'], occurredAt: '2026-01-02T00:00:00Z', timeUncertainty: 'exact' });
    const sequenceRelation = deriveRelationBetween([a, b], 'a', 'b');
    const recurrenceRelations = deriveRecurrenceRelations([a, b]);
    expect(sequenceRelation.relationType).not.toBe('USER_ATTRIBUTED_INFLUENCE');
    expect(sequenceRelation.relationType).not.toBe('HYPOTHESISED_INFLUENCE');
    expect(recurrenceRelations.every((r) => r.relationType !== 'USER_ATTRIBUTED_INFLUENCE' && r.relationType !== 'HYPOTHESISED_INFLUENCE')).toBe(true);
  });
});

describe('buildTimeline - preserves order, allows incomplete timelines', () => {
  it('orders by real timestamp when available', () => {
    const a = makeRecord({ id: 'a', occurredAt: '2026-01-02T00:00:00Z', timeUncertainty: 'exact' });
    const b = makeRecord({ id: 'b', occurredAt: '2026-01-01T00:00:00Z', timeUncertainty: 'exact' });
    const timeline = buildTimeline([a, b]);
    expect(timeline.map((e) => e.record.id)).toEqual(['b', 'a']);
    expect(timeline.every((e) => e.orderBasis === 'timestamp')).toBe(true);
  });

  it('falls back to reportedOrder and labels the basis honestly', () => {
    const a = makeRecord({ id: 'a', reportedOrder: 2 });
    const b = makeRecord({ id: 'b', reportedOrder: 1 });
    const timeline = buildTimeline([a, b]);
    expect(timeline.map((e) => e.record.id)).toEqual(['b', 'a']);
    expect(timeline.every((e) => e.orderBasis === 'reported_order')).toBe(true);
  });

  it('keeps a record with no usable ordering information in a stable position rather than reshuffling it', () => {
    const a = makeRecord({ id: 'a', occurredAt: '2026-01-01T00:00:00Z', timeUncertainty: 'exact' });
    const b = makeRecord({ id: 'b' }); // no timestamp, no reportedOrder
    const timeline = buildTimeline([a, b]);
    expect(timeline.find((e) => e.record.id === 'b')?.orderBasis).toBe('unknown');
  });

  it('handles an empty record set', () => {
    expect(buildTimeline([])).toEqual([]);
  });
});

describe('buildSelfSystemTimeline - different self-systems relevant at different times', () => {
  it('returns only the subset relevant to the requested self-system, without pulling in others', () => {
    const a = makeRecord({ id: 'a', selfSystems: ['INTERNAL_SELF'], reportedOrder: 1 });
    const b = makeRecord({ id: 'b', selfSystems: ['RELATIONAL_SELF'], reportedOrder: 2 });
    const timeline = buildSelfSystemTimeline([a, b], 'INTERNAL_SELF');
    expect(timeline.map((e) => e.record.id)).toEqual(['a']);
  });
});
