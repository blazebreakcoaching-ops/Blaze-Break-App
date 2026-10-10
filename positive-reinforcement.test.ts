import { describe, it, expect } from 'vitest';
import { suggestStructuralRecognitionPrompts } from './positive-reinforcement';

describe('suggestStructuralRecognitionPrompts', () => {
  it('flags a resolved Work Design Debt item', () => {
    const suggestions = suggestStructuralRecognitionPrompts({ debtResolvedThisWeek: 1, usefulInterventionOutcomesThisWeek: 0, meetingPressureBand: null });
    expect(suggestions.some((s) => s.includes('Work Design Debt item was resolved'))).toBe(true);
  });

  it('pluralizes when more than one debt item resolved', () => {
    const suggestions = suggestStructuralRecognitionPrompts({ debtResolvedThisWeek: 3, usefulInterventionOutcomesThisWeek: 0, meetingPressureBand: null });
    expect(suggestions.some((s) => s.includes('3 Work Design Debt items were resolved'))).toBe(true);
  });

  it('flags a genuinely useful intervention outcome', () => {
    const suggestions = suggestStructuralRecognitionPrompts({ debtResolvedThisWeek: 0, usefulInterventionOutcomesThisWeek: 1, meetingPressureBand: null });
    expect(suggestions.some((s) => s.toLowerCase().includes('genuinely useful'))).toBe(true);
  });

  it('flags a low meeting pressure band', () => {
    const suggestions = suggestStructuralRecognitionPrompts({ debtResolvedThisWeek: 0, usefulInterventionOutcomesThisWeek: 0, meetingPressureBand: 'low' });
    expect(suggestions.some((s) => s.toLowerCase().includes('meeting load is reading low'))).toBe(true);
  });

  it('does not flag a meeting pressure band other than low', () => {
    const suggestions = suggestStructuralRecognitionPrompts({ debtResolvedThisWeek: 0, usefulInterventionOutcomesThisWeek: 0, meetingPressureBand: 'elevated' });
    expect(suggestions.some((s) => s.toLowerCase().includes('meeting load'))).toBe(false);
  });

  it('falls back to a generic-but-honest suggestion when nothing structural is happening', () => {
    const suggestions = suggestStructuralRecognitionPrompts({ debtResolvedThisWeek: 0, usefulInterventionOutcomesThisWeek: 0, meetingPressureBand: null });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toContain('Consistent small wins');
  });

  it('never returns more than 3 suggestions', () => {
    const suggestions = suggestStructuralRecognitionPrompts({ debtResolvedThisWeek: 2, usefulInterventionOutcomesThisWeek: 1, meetingPressureBand: 'low' });
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('never mentions a named individual', () => {
    // debtResolvedThisWeek is deliberately left at 0 here: its own
    // suggestion legitimately contains the two-capitalized-word product
    // term "Work Design Debt", which this naive "no Firstname Lastname"
    // check can't distinguish from an actual name.
    const suggestions = suggestStructuralRecognitionPrompts({ debtResolvedThisWeek: 0, usefulInterventionOutcomesThisWeek: 1, meetingPressureBand: 'low' });
    for (const s of suggestions) {
      expect(s).not.toMatch(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/);
    }
  });
});
