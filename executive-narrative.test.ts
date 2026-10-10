import { describe, it, expect } from 'vitest';
import { buildExecutiveNarrative } from './executive-narrative';

describe('buildExecutiveNarrative', () => {
  it('reports no open debt items honestly when there are none', () => {
    const text = buildExecutiveNarrative({
      activeInterventionCount: 0, maxConcurrentActiveInterventions: 3,
      openDebtCount: 0, openDebtWithoutOwnerCount: 0, localOperatingPrincipleCount: 0,
    });
    expect(text).toContain('0 active changes running (of a budget of 3)');
    expect(text).toContain('no open Work Design Debt items');
    expect(text).not.toContain('Local Operating Principle');
  });

  it('uses singular phrasing for exactly one active intervention', () => {
    const text = buildExecutiveNarrative({
      activeInterventionCount: 1, maxConcurrentActiveInterventions: 3,
      openDebtCount: 0, openDebtWithoutOwnerCount: 0, localOperatingPrincipleCount: 0,
    });
    expect(text).toContain('1 active change running');
  });

  it('includes the owner-missing clause only when some debt items lack an owner', () => {
    const withOwner = buildExecutiveNarrative({
      activeInterventionCount: 1, maxConcurrentActiveInterventions: 3,
      openDebtCount: 2, openDebtWithoutOwnerCount: 0, localOperatingPrincipleCount: 0,
    });
    expect(withOwner).toContain('2 open Work Design Debt items');
    expect(withOwner).not.toContain('without an owner');

    const withoutOwner = buildExecutiveNarrative({
      activeInterventionCount: 1, maxConcurrentActiveInterventions: 3,
      openDebtCount: 2, openDebtWithoutOwnerCount: 1, localOperatingPrincipleCount: 0,
    });
    expect(withoutOwner).toContain('1 without an owner yet');
  });

  it('includes the Local Operating Principle clause only when at least one exists', () => {
    const text = buildExecutiveNarrative({
      activeInterventionCount: 1, maxConcurrentActiveInterventions: 3,
      openDebtCount: 0, openDebtWithoutOwnerCount: 0, localOperatingPrincipleCount: 2,
    });
    expect(text).toContain('2 practices established as a Local Operating Principle');
  });

  it('uses singular phrasing for exactly one Local Operating Principle', () => {
    const text = buildExecutiveNarrative({
      activeInterventionCount: 0, maxConcurrentActiveInterventions: 3,
      openDebtCount: 0, openDebtWithoutOwnerCount: 0, localOperatingPrincipleCount: 1,
    });
    expect(text).toContain('1 practice established as a Local Operating Principle');
  });
});
