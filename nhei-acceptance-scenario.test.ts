// NHEI PHASE 1 - REQUIRED CRITICAL ACCEPTANCE FIXTURE
//
// Implements the exact scenario from the approved specification: a user
// expects their manager to refuse a time-off request (A), the manager
// approves it (B), the user later feels guilty about not working (C),
// finds it difficult to rest (D), and reports the overall experience
// affected their self-confidence (E).
//
// Interpretive note on source types (a documented Phase 1 design choice,
// not an assumption baked in silently): EvidenceSourceType and Dimension
// are deliberately orthogonal axes in this contract. Event D is tagged
// sourceType: USER_REPORTED_BEHAVIOUR (what they did/experienced -
// "found it difficult to rest") with dimension: PHYSICAL to carry the
// "recovery-related" half of the spec's "behavioural and recovery-related
// outcome" description, rather than inventing a combined source type that
// doesn't exist in the approved enum.
//
// No absolute timestamps are given in the narrative - only "before",
// "later", "later" - so this fixture uses reportedOrder exclusively,
// exercising the uncertain/approximate-timestamp path deliberately, per
// "Allow incomplete timelines, uncertain timestamps."

import { describe, it, expect } from 'vitest';
import { validateEvidenceRecords, type NheiEvidenceRecord } from './nhei-types';
import { classifyBySelfSystem, selfSystemIsActive } from './nhei-trifecta-engine';
import { classifyByDimension } from './nhei-dimensions-engine';
import { deriveRelationBetween, buildTimeline } from './nhei-temporal-engine';
import { detectBehaviouralPatterns } from './nhei-adaptive-behaviour-engine';

const rawInputs = [
  {
    id: 'A', // Expected a refusal, before asking
    sourceType: 'USER_REPORTED_THOUGHT',
    reportedOrder: 1,
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: ['PERCEIVED_RECEIVED_SELF'],
    dimensions: ['MENTAL'],
  },
  {
    id: 'B', // Manager approved the request
    sourceType: 'USER_REPORTED_EVENT',
    reportedOrder: 2,
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: ['RELATIONAL_SELF'],
    dimensions: [],
  },
  {
    id: 'C', // Guilt about not working, at home
    sourceType: 'USER_REPORTED_EMOTION',
    reportedOrder: 3,
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: ['INTERNAL_SELF'],
    dimensions: ['EMOTIONAL'],
  },
  {
    id: 'D', // Difficulty resting
    sourceType: 'USER_REPORTED_BEHAVIOUR',
    reportedOrder: 4,
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: [],
    dimensions: ['PHYSICAL'],
  },
  {
    id: 'E', // Overall experience affected self-confidence
    sourceType: 'USER_REPORTED_OUTCOME',
    reportedOrder: 5,
    timeUncertainty: 'unknown',
    evidenceQuality: 'medium',
    confirmationState: 'not_applicable',
    selfSystems: [],
    dimensions: [],
  },
];

const { valid: records, invalid } = validateEvidenceRecords(rawInputs);

describe('critical acceptance scenario - fixture validity', () => {
  it('every event in the scenario is a well-formed evidence record', () => {
    expect(invalid).toEqual([]);
    expect(records).toHaveLength(5);
  });
});

describe('critical acceptance scenario - expected self-system/dimension associations', () => {
  it('Event A associates with the Perceived-Received Self and the mental dimension', () => {
    const { bySelfSystem } = classifyBySelfSystem(records);
    const { byDimension } = classifyByDimension(records);
    expect(bySelfSystem.PERCEIVED_RECEIVED_SELF.map((r) => r.id)).toContain('A');
    expect(byDimension.MENTAL.map((r) => r.id)).toContain('A');
  });

  it('Event B associates with the Relational Self', () => {
    const { bySelfSystem } = classifyBySelfSystem(records);
    expect(bySelfSystem.RELATIONAL_SELF.map((r) => r.id)).toContain('B');
  });

  it('Event C associates with the Internal Self and the emotional dimension', () => {
    const { bySelfSystem } = classifyBySelfSystem(records);
    const { byDimension } = classifyByDimension(records);
    expect(bySelfSystem.INTERNAL_SELF.map((r) => r.id)).toContain('C');
    expect(byDimension.EMOTIONAL.map((r) => r.id)).toContain('C');
  });

  it('Event D is represented as a behavioural, recovery-related (physical-dimension) outcome', () => {
    const d = records.find((r) => r.id === 'D') as NheiEvidenceRecord;
    expect(d.sourceType).toBe('USER_REPORTED_BEHAVIOUR');
    const { byDimension } = classifyByDimension(records);
    expect(byDimension.PHYSICAL.map((r) => r.id)).toContain('D');
  });

  it('Event E is represented as a user-reported personal impact (an outcome)', () => {
    const e = records.find((r) => r.id === 'E') as NheiEvidenceRecord;
    expect(e.sourceType).toBe('USER_REPORTED_OUTCOME');
  });
});

describe('critical acceptance scenario - order preserved', () => {
  it('preserves the narrative order A, B, C, D, E', () => {
    const timeline = buildTimeline(records);
    expect(timeline.map((entry) => entry.record.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    // No real timestamp was ever given - every position is honestly
    // reported as order-only, not mistaken for a verified time.
    expect(timeline.every((entry) => entry.orderBasis === 'reported_order')).toBe(true);
  });
});

describe('critical acceptance scenario - no unsupported causal/interference assumptions', () => {
  it('never assumes Event C was caused by Event A', () => {
    const relation = deriveRelationBetween(records, 'A', 'C');
    expect(relation.relationType).not.toBe('USER_ATTRIBUTED_INFLUENCE');
    expect(relation.relationType).not.toBe('HYPOTHESISED_INFLUENCE');
    // The only thing honestly knowable from the fixture's reported order is
    // that A preceded C - a sequence fact, never an influence claim.
    expect(relation.relationType).toBe('SEQUENCE');
    expect(relation.derivedBy).toBe('engine_computed');
  });

  it("never assumes the manager's approval (B) eliminated the internal concern (C) - both remain simultaneously active", () => {
    expect(selfSystemIsActive(records, 'RELATIONAL_SELF')).toBe(true);
    expect(selfSystemIsActive(records, 'INTERNAL_SELF')).toBe(true);
    const { bySelfSystem } = classifyBySelfSystem(records);
    // C's presence in INTERNAL_SELF is entirely unaffected by B existing in
    // RELATIONAL_SELF - no cross-bucket interaction exists in this engine.
    expect(bySelfSystem.INTERNAL_SELF.map((r) => r.id)).toContain('C');
    expect(bySelfSystem.RELATIONAL_SELF.map((r) => r.id)).toContain('B');
  });

  it('never treats the three self-systems as mutually exclusive', () => {
    const { bySelfSystem } = classifyBySelfSystem(records);
    const systemsWithEvidence = (['INTERNAL_SELF', 'RELATIONAL_SELF', 'PERCEIVED_RECEIVED_SELF'] as const).filter(
      (s) => bySelfSystem[s].length > 0,
    );
    // All three are simultaneously represented across this one scenario -
    // none were suppressed or merged to make room for another.
    expect(systemsWithEvidence.sort()).toEqual(['INTERNAL_SELF', 'PERCEIVED_RECEIVED_SELF', 'RELATIONAL_SELF']);
  });

  it('does not invent the underlying cause of the guilt in Event C', () => {
    // There is no function anywhere in the NHEI Phase 1 modules that
    // assigns a "cause" to a feeling - this is a structural absence, not
    // a value to assert on. The closest thing to "explaining" C is asking
    // for its temporal relation to every other event, none of which can
    // ever come back as an influence claim unless explicitly asserted
    // (see nhei-temporal-engine.test.ts's dedicated coverage of this) -
    // confirmed here for every other event in this specific scenario.
    const others = ['A', 'B', 'D', 'E'];
    for (const otherId of others) {
      const relation = deriveRelationBetween(records, otherId, 'C');
      expect(relation.relationType).not.toBe('USER_ATTRIBUTED_INFLUENCE');
      expect(relation.relationType).not.toBe('HYPOTHESISED_INFLUENCE');
    }
  });

  it('returns insufficient evidence (no fabricated pattern) for the one-off behaviour->outcome sequence D->E', () => {
    const relation = deriveRelationBetween(records, 'D', 'E');
    const patterns = detectBehaviouralPatterns(records, [relation]);
    // Exactly one behaviour->outcome occurrence exists in this scenario -
    // below the two-occurrence threshold - so no pattern is manufactured
    // from a single, isolated instance, however plausible it might look.
    expect(patterns).toEqual([]);
  });
});
