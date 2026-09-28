import { describe, it, expect } from 'vitest';
import {
  ISLAMIC_THEMES,
  ISLAMIC_THEME_ORDER,
  BURDEN_OPTIONS,
  NEXT_ACTION_OPTIONS,
  rankIslamicThemesByRelevance,
} from './grounding-content';

describe('ISLAMIC_THEMES curated content', () => {
  it('marks every verse as not yet scholar-reviewed', () => {
    for (const themeId of ISLAMIC_THEME_ORDER) {
      for (const verse of ISLAMIC_THEMES[themeId].verses) {
        expect(verse.scholarReviewed).toBe(false);
      }
    }
  });

  it('gives every verse an exact reference and a translator attribution', () => {
    for (const themeId of ISLAMIC_THEME_ORDER) {
      for (const verse of ISLAMIC_THEMES[themeId].verses) {
        expect(verse.reference.length).toBeGreaterThan(0);
        expect(verse.translator.length).toBeGreaterThan(0);
        expect(verse.translation.length).toBeGreaterThan(0);
      }
    }
  });

  it('never includes Hadith text - only Qur\'an references, pending scholar-sourced Hadith selection', () => {
    for (const themeId of ISLAMIC_THEME_ORDER) {
      for (const verse of ISLAMIC_THEMES[themeId].verses) {
        expect(verse.reference.toLowerCase()).toContain("qur'an");
      }
    }
  });

  it('has all 10 required curated themes (Phase 1\'s 8 plus Phase 2\'s Niyyah and Ihsan)', () => {
    expect(ISLAMIC_THEME_ORDER).toEqual(['tawakkul', 'sabr', 'shukr', 'qadr', 'rahmah', 'salah', 'dua', 'ummah', 'niyyah', 'ihsan']);
  });

  it('gives every theme exactly one prompt and one follow-up question, not advice statements', () => {
    for (const themeId of ISLAMIC_THEME_ORDER) {
      const theme = ISLAMIC_THEMES[themeId];
      expect(theme.prompt.trim().endsWith('?')).toBe(true);
      expect(theme.followUp.trim().endsWith('?')).toBe(true);
    }
  });
});

describe('BURDEN_OPTIONS / NEXT_ACTION_OPTIONS', () => {
  it('has all 10 pressure options from the brief', () => {
    expect(BURDEN_OPTIONS).toHaveLength(10);
    expect(BURDEN_OPTIONS.map((o) => o.id)).toContain('cannot_change');
    expect(BURDEN_OPTIONS.map((o) => o.id)).toContain('other');
  });

  it('never offers a fabricated "Community conversation" option - no such feature exists', () => {
    expect(NEXT_ACTION_OPTIONS.map((o) => o.id)).toEqual(['nova', 'trusted_person', 'practical_action', 'rest']);
  });
});

describe('rankIslamicThemesByRelevance', () => {
  it('falls back to the fixed order when there is no pattern context', () => {
    expect(rankIslamicThemesByRelevance([])).toEqual(ISLAMIC_THEME_ORDER);
  });

  it('surfaces the most relevant theme first once pattern context exists', () => {
    const ranked = rankIslamicThemesByRelevance(['isolation']);
    expect(ranked[0]).toBe('ummah');
  });

  it('never drops any theme, even when reordering', () => {
    const ranked = rankIslamicThemesByRelevance(['control', 'guilt_about_rest']);
    expect([...ranked].sort()).toEqual([...ISLAMIC_THEME_ORDER].sort());
  });

  it('ignores an unrecognised pattern key rather than throwing', () => {
    expect(() => rankIslamicThemesByRelevance(['not_a_real_pattern'])).not.toThrow();
  });
});
