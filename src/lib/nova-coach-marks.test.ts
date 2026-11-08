import { describe, expect, it } from 'vitest';
import { NOVA_COACH_MARKS, novaCoachMarksForPage } from './nova-coach-marks';

describe('Nova Guide real-control targeting', () => {
  it('defines explanations only for the five real customer journey screens', () => {
    expect(Object.keys(NOVA_COACH_MARKS).sort()).toEqual(['diagnose', 'home', 'nova', 'plan', 'recovery_intelligence']);
  });

  it('keeps every mark short, unique and tied to an explicit existing target', () => {
    const allTargets = new Set<string>();
    for (const marks of Object.values(NOVA_COACH_MARKS)) {
      expect(marks.length).toBeGreaterThan(0);
      expect(marks.length).toBeLessThanOrEqual(3);
      for (const mark of marks) {
        expect(mark.title.length).toBeLessThan(60);
        expect(mark.explanation.length).toBeLessThan(170);
        expect(mark.target).toMatch(/^[a-z][a-z0-9-]+$/);
        expect(allTargets.has(mark.target)).toBe(false);
        allTargets.add(mark.target);
      }
    }
  });

  it('does not offer an overlay on an unknown or restricted page', () => {
    expect(novaCoachMarksForPage('admin')).toEqual([]);
    expect(novaCoachMarksForPage('not-a-page')).toEqual([]);
  });
});
