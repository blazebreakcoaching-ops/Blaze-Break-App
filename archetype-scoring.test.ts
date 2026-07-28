import { describe, it, expect } from 'vitest';
import { computeDimensionScores, computeArchetypeScores, pickDominantProfile, computeBlend } from './archetype-scoring';

// A baseline where every dimension sits at the neutral default (2), so tests
// can elevate just the one or two dimensions they're actually checking
// without every other archetype scoring identically at the baseline.
const baseline = () => computeDimensionScores({});

describe('archetype scoring: each archetype wins on its own defining signal', () => {
  const cases: [string, Record<string, number>][] = [
    ['Founder on Fire', { workload: 4, guilt: 4, sleep: 4 }],
    ['Over-Giver', { peoplePleasing: 4, boundaries: 4 }],
    ['Silent Resenter', { emotionalOverload: 4, boundaries: 4, meaning: 4 }],
    ['High-Functioning Exhausted', { workload: 4, sleep: 4 }],
    ['Manager in the Middle', { workload: 4, boundaries: 3, peoplePleasing: 3, emotionalOverload: 3, meaning: 3, guilt: 1 }],
    ['The Impostor', { selfDoubt: 4 }],
    ['The Perfectionist', { delegationControl: 4 }],
    ['The Constant Adapter', { maskingLoad: 4 }],
    ['The Second Shift', { caregivingLoad: 4 }],
    ['Crisis Sprinter', { crisisDependency: 4 }],
    ['People-Pleasing Performer', { emotionalPerformance: 4 }],
    ['Responsibility Addict', { responsibilityCreep: 4 }],
  ];

  for (const [expectedProfile, elevated] of cases) {
    it(`${expectedProfile} wins when its defining dimension(s) are elevated`, () => {
      const dims = { ...baseline(), ...elevated };
      const scores = computeArchetypeScores(dims);
      expect(pickDominantProfile(scores)).toBe(expectedProfile);
    });
  }
});

describe('archetype scoring: genuine differentiation between similar-shaped archetypes', () => {
  // These two pairs were flagged as overlap risks before building — same
  // coefficient shape, different primary question. If the dedicated
  // questions stopped actually differentiating them, that's a real
  // regression worth catching here, not discovering after it ships.
  it('Responsibility Addict wins when ownership-creep is high but delegation-control is not', () => {
    const dims = { ...baseline(), responsibilityCreep: 4, delegationControl: 1 };
    const scores = computeArchetypeScores(dims);
    expect(pickDominantProfile(scores)).toBe('Responsibility Addict');
  });

  it('The Perfectionist wins when delegation-control is high but ownership-creep is not', () => {
    const dims = { ...baseline(), delegationControl: 4, responsibilityCreep: 1 };
    const scores = computeArchetypeScores(dims);
    expect(pickDominantProfile(scores)).toBe('The Perfectionist');
  });

  it('People-Pleasing Performer wins when emotional performance is high but peoplePleasing is not', () => {
    const dims = { ...baseline(), emotionalPerformance: 4, peoplePleasing: 1 };
    const scores = computeArchetypeScores(dims);
    expect(pickDominantProfile(scores)).toBe('People-Pleasing Performer');
  });

  it('Over-Giver wins when peoplePleasing/boundaries are high but emotional performance is not', () => {
    const dims = { ...baseline(), peoplePleasing: 4, boundaries: 4, emotionalPerformance: 1 };
    const scores = computeArchetypeScores(dims);
    expect(pickDominantProfile(scores)).toBe('Over-Giver');
  });
});

describe('archetype scoring: edge cases', () => {
  it('produces a valid profile from fully neutral/unanswered input, without throwing', () => {
    const dims = computeDimensionScores({});
    const scores = computeArchetypeScores(dims);
    expect(() => pickDominantProfile(scores)).not.toThrow();
    expect(typeof pickDominantProfile(scores)).toBe('string');
  });

  it('handles legacy answer field names (identity/rest/wired/emotional/disconnection)', () => {
    const dims = computeDimensionScores({ identity: 3, rest: 3, wired: 3, emotional: 3, disconnection: 3 });
    expect(dims.peoplePleasing).toBe(3);
    expect(dims.guilt).toBe(3);
    expect(dims.sleep).toBe(3);
    expect(dims.emotionalOverload).toBe(3);
    expect(dims.meaning).toBe(3);
  });

  it('maps legacy string answers (e.g. "most days") to the correct severity value', () => {
    const dims = computeDimensionScores({ workload: 'Most days — I am perpetually behind' });
    expect(dims.workload).toBe(3);
  });
});

describe('blend: the top-3 percentage mix', () => {
  it('always sums to (approximately) 100%, accounting for rounding', () => {
    const dims = { ...baseline(), selfDoubt: 4, workload: 3, guilt: 3 };
    const scores = computeArchetypeScores(dims);
    const blend = computeBlend(scores);
    const total = blend.reduce((sum, b) => sum + b.percentage, 0);
    expect(total).toBeGreaterThanOrEqual(98);
    expect(total).toBeLessThanOrEqual(102);
  });

  it('always returns exactly 3 entries', () => {
    const dims = baseline();
    const scores = computeArchetypeScores(dims);
    const blend = computeBlend(scores);
    expect(blend).toHaveLength(3);
  });

  it('ranks the dominant archetype first', () => {
    const dims = { ...baseline(), selfDoubt: 4 };
    const scores = computeArchetypeScores(dims);
    const blend = computeBlend(scores);
    expect(blend[0].profile).toBe('The Impostor');
    expect(blend[0].percentage).toBeGreaterThan(blend[1].percentage);
  });
});
