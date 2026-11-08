import { describe, it, expect } from 'vitest';
import { buildDiagnoseFallbackAnalysis } from './diagnose-fallback';

describe('diagnostic fallback analysis', () => {
  it("names the person's actual highest-rated areas", () => {
    const text = buildDiagnoseFallbackAnalysis('Responsibility Addict', [
      { label: 'Sleep', score: 2 }, { label: 'Responsibility creep', score: 4 }, { label: 'Guilt', score: 4 }, { label: 'Workload', score: 1 },
    ]);
    expect(text).toContain('Responsibility Addict');
    expect(text).toMatch(/highest-rated areas were responsibility creep and guilt \(4 out of 4\)/);
    expect(text).not.toMatch(/sleep|workload/i);
  });

  it('does not invent a "clear leak" when nothing stands out', () => {
    const text = buildDiagnoseFallbackAnalysis('Crisis Sprinter', [{ label: 'Sleep', score: 1 }, { label: 'Guilt', score: 1 }]);
    expect(text).toMatch(/None of the areas you rated stood out strongly/);
    expect(text).not.toMatch(/completely clear/);
  });

  it('never makes medical claims or pretends Nova analysed it', () => {
    const text = buildDiagnoseFallbackAnalysis('People-Pleasing Performer', [{ label: 'Masking load', score: 3 }]);
    expect(text).not.toMatch(/biologic|metabolic|Having analysed/i);
    expect(text).toMatch(/not a medical assessment/);
    expect(text).toMatch(/Nova's written analysis isn't available/);
  });

  it('ignores non-numeric scores', () => {
    expect(() => buildDiagnoseFallbackAnalysis('X', [{ label: 'A', score: NaN }])).not.toThrow();
  });
});
