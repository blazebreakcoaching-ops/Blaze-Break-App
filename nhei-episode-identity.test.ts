// NHEI PHASE 3C-2A - SECTION 3: EPISODE IDENTITY TESTS
//
// The defect this section exists to fix: deriveRecurrenceRelations used to
// treat ANY two evidence records sharing a self-system/dimension tag as
// grounds for a RECURRENCE relation, even when both records came from one
// single reported experience (e.g. "felt anxious asking my manager" and
// "felt guilty afterward," both tagged EMOTIONAL, told as one story in one
// conversation). That conflates "two facets of one episode" with "a
// repeating pattern across separate occasions." These tests use the same
// manager/time-off scenario as every prior phase's mandatory fixture,
// contrasting a single-episode telling against a genuinely-repeated,
// separate-occasions telling.

import { describe, it, expect } from 'vitest';
import { deriveRecurrenceRelations } from './nhei-temporal-engine';
import { toNheiEvidenceRecord, type NheiExtractionCandidate } from './nhei-extraction-types';
import { type NheiEvidenceRecord } from './nhei-types';

function record(overrides: Partial<NheiEvidenceRecord>): NheiEvidenceRecord {
  return {
    id: 'ev', sourceType: 'USER_REPORTED_EVENT', timeUncertainty: 'unknown', evidenceQuality: 'medium',
    confirmationState: 'not_applicable', selfSystems: [], dimensions: [], relatedEventIds: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<NheiExtractionCandidate>): NheiExtractionCandidate {
  return {
    candidateId: 'c', abstain: false, sourceType: 'USER_REPORTED_EVENT', selfSystems: [], dimensions: [],
    relativeOrder: 0, timeUncertainty: 'unknown', evidenceQuality: 'medium', relatedCandidateIds: [],
    ...overrides,
  };
}

describe('deriveRecurrenceRelations - same episode vs. separate occasions (pure engine)', () => {
  it('two EMOTIONAL-tagged records from the SAME episode (one story, two beats) never produce RECURRENCE', () => {
    // "Anticipating asking my manager" and "felt guilty afterward" - one
    // single retelling of the manager/time-off situation, both tagged
    // EMOTIONAL, both carrying the SAME episodeId.
    const anticipation = record({ id: 'anticipation', dimensions: ['EMOTIONAL'], reportedOrder: 0, episodeId: 'conv1_ep0' });
    const guilt = record({ id: 'guilt', dimensions: ['EMOTIONAL'], reportedOrder: 2, episodeId: 'conv1_ep0' });
    const relations = deriveRecurrenceRelations([anticipation, guilt]);
    expect(relations.filter((r) => r.relationType === 'RECURRENCE')).toEqual([]);
  });

  it('the SAME two tagged records DO produce RECURRENCE once they belong to genuinely different episodes', () => {
    // The user separately describes asking for time off on two different
    // occasions, each producing its own EMOTIONAL-tagged record.
    const firstOccasion = record({ id: 'occasion1_guilt', dimensions: ['EMOTIONAL'], reportedOrder: 0, episodeId: 'conv1_ep0' });
    const secondOccasion = record({ id: 'occasion2_guilt', dimensions: ['EMOTIONAL'], reportedOrder: 1, episodeId: 'conv1_ep1' });
    const relations = deriveRecurrenceRelations([firstOccasion, secondOccasion]);
    const recurrence = relations.find((r) => r.relationType === 'RECURRENCE');
    expect(recurrence).toBeDefined();
    expect(recurrence?.fromEventId).toBe('occasion1_guilt');
    expect(recurrence?.toEventId).toBe('occasion2_guilt');
  });

  it('a single episode with THREE tagged records still produces zero RECURRENCE - episode count stays 1 regardless of record count', () => {
    const a = record({ id: 'a', selfSystems: ['INTERNAL_SELF'], reportedOrder: 0, episodeId: 'conv1_ep0' });
    const b = record({ id: 'b', selfSystems: ['INTERNAL_SELF'], reportedOrder: 1, episodeId: 'conv1_ep0' });
    const c = record({ id: 'c', selfSystems: ['INTERNAL_SELF'], reportedOrder: 2, episodeId: 'conv1_ep0' });
    const relations = deriveRecurrenceRelations([a, b, c]);
    expect(relations.filter((r) => r.relationType === 'RECURRENCE')).toEqual([]);
  });

  it('mixing one multi-record episode with one genuinely separate occasion still correctly identifies exactly one recurrence pair', () => {
    const episode0a = record({ id: 'e0a', selfSystems: ['INTERNAL_SELF'], reportedOrder: 0, episodeId: 'conv1_ep0' });
    const episode0b = record({ id: 'e0b', selfSystems: ['INTERNAL_SELF'], reportedOrder: 1, episodeId: 'conv1_ep0' });
    const episode1 = record({ id: 'e1', selfSystems: ['INTERNAL_SELF'], reportedOrder: 2, episodeId: 'conv1_ep1' });
    const relations = deriveRecurrenceRelations([episode0a, episode0b, episode1]);
    const recurrences = relations.filter((r) => r.relationType === 'RECURRENCE');
    expect(recurrences).toHaveLength(1);
    // The recurrence is between the later record of episode 0 and episode
    // 1 (adjacent in chronological order), never between the two
    // same-episode records.
    expect(recurrences[0].fromEventId).toBe('e0b');
    expect(recurrences[0].toEventId).toBe('e1');
  });

  it('records with no episodeId at all (pre-3C-2A shape) behave exactly as before - each is its own singleton episode', () => {
    const a = record({ id: 'a', selfSystems: ['INTERNAL_SELF'], reportedOrder: 1 });
    const b = record({ id: 'b', selfSystems: ['INTERNAL_SELF'], reportedOrder: 2 });
    const relations = deriveRecurrenceRelations([a, b]);
    expect(relations.some((r) => r.relationType === 'RECURRENCE')).toBe(true);
  });
});

describe('toNheiEvidenceRecord - episodeIndex becomes a batch-namespaced episodeId', () => {
  it('defaults to episode 0 when episodeIndex is omitted', () => {
    const result = toNheiEvidenceRecord(candidate({ candidateId: 'c1' }), 'batchA');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.episodeId).toBe('batchA_ep0');
  });

  it('carries an explicit episodeIndex through', () => {
    const result = toNheiEvidenceRecord(candidate({ candidateId: 'c1', episodeIndex: 2 }), 'batchA');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.episodeId).toBe('batchA_ep2');
  });

  it('the same episodeIndex in two DIFFERENT batches never collides into one episode', () => {
    const first = toNheiEvidenceRecord(candidate({ candidateId: 'c1', episodeIndex: 0 }), 'batchA');
    const second = toNheiEvidenceRecord(candidate({ candidateId: 'c1', episodeIndex: 0 }), 'batchB');
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.record.episodeId).not.toBe(second.record.episodeId);
  });
});

describe('end-to-end: manager/time-off told as one episode vs. told as two separate occasions', () => {
  it('one conversation, one episode: anticipatory anxiety and later guilt (both EMOTIONAL) never trigger recurrence', () => {
    const anticipation = toNheiEvidenceRecord(
      candidate({ candidateId: 'anticipation', sourceType: 'USER_REPORTED_THOUGHT', selfSystems: ['PERCEIVED_RECEIVED_SELF'], dimensions: ['EMOTIONAL'], relativeOrder: 0, episodeIndex: 0 }),
      'conv1',
    );
    const guilt = toNheiEvidenceRecord(
      candidate({ candidateId: 'guilt', sourceType: 'USER_REPORTED_EMOTION', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], relativeOrder: 2, episodeIndex: 0 }),
      'conv1',
    );
    expect(anticipation.ok && guilt.ok).toBe(true);
    if (anticipation.ok && guilt.ok) {
      const relations = deriveRecurrenceRelations([anticipation.record, guilt.record]);
      expect(relations.filter((r) => r.relationType === 'RECURRENCE')).toEqual([]);
    }
  });

  it('one conversation, two separately-described occasions of the same situation: the shared EMOTIONAL tag now correctly reads as recurrence', () => {
    const firstTimeGuilt = toNheiEvidenceRecord(
      candidate({ candidateId: 'guilt1', sourceType: 'USER_REPORTED_EMOTION', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], relativeOrder: 0, episodeIndex: 0 }),
      'conv1',
    );
    const secondTimeGuilt = toNheiEvidenceRecord(
      candidate({ candidateId: 'guilt2', sourceType: 'USER_REPORTED_EMOTION', selfSystems: ['INTERNAL_SELF'], dimensions: ['EMOTIONAL'], relativeOrder: 1, episodeIndex: 1 }),
      'conv1',
    );
    expect(firstTimeGuilt.ok && secondTimeGuilt.ok).toBe(true);
    if (firstTimeGuilt.ok && secondTimeGuilt.ok) {
      const relations = deriveRecurrenceRelations([firstTimeGuilt.record, secondTimeGuilt.record]);
      const recurrence = relations.find((r) => r.relationType === 'RECURRENCE');
      expect(recurrence).toBeDefined();
      expect(recurrence?.fromEventId).toBe(firstTimeGuilt.record.id);
      expect(recurrence?.toEventId).toBe(secondTimeGuilt.record.id);
    }
  });
});
