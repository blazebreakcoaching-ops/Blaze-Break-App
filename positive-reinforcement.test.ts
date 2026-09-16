import { describe, it, expect } from 'vitest';
import { suggestRecognitionPrompts } from './positive-reinforcement';

describe('suggestRecognitionPrompts', () => {
  it('flags a notable rise in engagement when a prior week exists to compare against', () => {
    const suggestions = suggestRecognitionPrompts({ engagementRate: 60 }, { engagementRate: 50 });
    expect(suggestions.some((s) => s.includes('up 10 points'))).toBe(true);
  });

  it('does not claim a rise when the change is smaller than the notable threshold', () => {
    const suggestions = suggestRecognitionPrompts({ engagementRate: 52 }, { engagementRate: 50 });
    expect(suggestions.some((s) => s.includes('points'))).toBe(false);
  });

  it('flags high sustained engagement even with no prior week to compare against', () => {
    const suggestions = suggestRecognitionPrompts({ engagementRate: 80 }, null);
    expect(suggestions.some((s) => s.toLowerCase().includes('solid'))).toBe(true);
  });

  it('flags a notable drop in engagement', () => {
    const suggestions = suggestRecognitionPrompts({ engagementRate: 40 }, { engagementRate: 55 });
    expect(suggestions.some((s) => s.toLowerCase().includes('dipped'))).toBe(true);
  });

  it('falls back to a generic-but-honest suggestion when nothing notable is happening', () => {
    const suggestions = suggestRecognitionPrompts({ engagementRate: 55 }, { engagementRate: 53 });
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('never returns more than 3 suggestions', () => {
    const suggestions = suggestRecognitionPrompts({ engagementRate: 80 }, { engagementRate: 60 });
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('never mentions a named individual - only ever describes aggregate percentages', () => {
    const suggestions = suggestRecognitionPrompts({ engagementRate: 80 }, { engagementRate: 60 });
    for (const s of suggestions) {
      expect(s).not.toMatch(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/); // no "Firstname Lastname"-shaped text
    }
  });
});
