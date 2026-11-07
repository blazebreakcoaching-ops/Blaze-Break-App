// Dedicated cross-engine test for NHEI Phase 1 requirement 11: "No
// raw-text leakage through classification metadata." NheiEvidenceRecord
// has no field capable of holding raw text at all (see nhei-types.ts's
// header comment for why), and validateEvidenceRecord strips any unknown
// field a careless caller attaches before an engine ever sees it. This
// test proves that guarantee holds end-to-end: a raw string is attached
// to input the way a careless caller might, pushed through validation and
// every Phase 1 engine, and none of the resulting output ever contains it.

import { describe, it, expect } from 'vitest';
import { validateEvidenceRecord } from './nhei-types';
import { classifyBySelfSystem, summarizeSelfSystemActivity } from './nhei-trifecta-engine';
import { classifyByDimension, summarizeDimensionActivity } from './nhei-dimensions-engine';
import { deriveRelationBetween, deriveRecurrenceRelations, buildTimeline } from './nhei-temporal-engine';
import { detectBehaviouralPatterns } from './nhei-adaptive-behaviour-engine';
import { summariseAvailableEvidence } from './nhei-context-agency-engine';

const SENSITIVE_RAW_TEXT = 'I feel like a failure because of what happened with my brother';

function sneakyInput(id: string, extra: Record<string, unknown>) {
  return {
    id,
    sourceType: 'USER_REPORTED_BEHAVIOUR',
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: ['INTERNAL_SELF'],
    dimensions: ['EMOTIONAL'],
    ...extra,
  };
}

describe('no raw-text leakage through classification metadata', () => {
  const r1 = validateEvidenceRecord(sneakyInput('e1', { debugContent: SENSITIVE_RAW_TEXT, reportedOrder: 1 }));
  const r2 = validateEvidenceRecord(
    sneakyInput('e2', { debugContent: SENSITIVE_RAW_TEXT, sourceType: 'USER_REPORTED_OUTCOME', reportedOrder: 2 }),
  );

  it('strips the raw text at validation time', () => {
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(JSON.stringify(r1.record)).not.toContain(SENSITIVE_RAW_TEXT);
    expect(JSON.stringify(r2.record)).not.toContain(SENSITIVE_RAW_TEXT);
  });

  it('never appears in Trifecta engine output', () => {
    const records = [r1.record!, r2.record!];
    expect(JSON.stringify(classifyBySelfSystem(records))).not.toContain(SENSITIVE_RAW_TEXT);
    expect(JSON.stringify(summarizeSelfSystemActivity(records))).not.toContain(SENSITIVE_RAW_TEXT);
  });

  it('never appears in Dimensions engine output', () => {
    const records = [r1.record!, r2.record!];
    expect(JSON.stringify(classifyByDimension(records))).not.toContain(SENSITIVE_RAW_TEXT);
    expect(JSON.stringify(summarizeDimensionActivity(records))).not.toContain(SENSITIVE_RAW_TEXT);
  });

  it('never appears in Temporal engine output', () => {
    const records = [r1.record!, r2.record!];
    expect(JSON.stringify(deriveRelationBetween(records, 'e1', 'e2'))).not.toContain(SENSITIVE_RAW_TEXT);
    expect(JSON.stringify(deriveRecurrenceRelations(records))).not.toContain(SENSITIVE_RAW_TEXT);
    expect(JSON.stringify(buildTimeline(records))).not.toContain(SENSITIVE_RAW_TEXT);
  });

  it('never appears in Adaptive Behaviour engine output', () => {
    const records = [r1.record!, r2.record!];
    const relation = deriveRelationBetween(records, 'e1', 'e2');
    expect(JSON.stringify(detectBehaviouralPatterns(records, [relation]))).not.toContain(SENSITIVE_RAW_TEXT);
  });

  it('never appears in Context and Agency engine output', () => {
    const records = [r1.record!, r2.record!];
    expect(JSON.stringify(summariseAvailableEvidence(records))).not.toContain(SENSITIVE_RAW_TEXT);
  });
});
