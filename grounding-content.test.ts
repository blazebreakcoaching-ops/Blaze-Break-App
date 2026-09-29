import { describe, it, expect } from 'vitest';
import {
  ISLAMIC_THEMES,
  ISLAMIC_THEME_ORDER,
  BURDEN_OPTIONS,
  NEXT_ACTION_OPTIONS,
  rankIslamicThemesByRelevance,
  DIMENSION_TO_ISLAMIC_THEMES,
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

describe('ISLAMIC_THEMES verified-content governance fields (Phase 3 section 20)', () => {
  it('marks every verse as reviewerStatus "pending" - never "approved" without a real reviewer', () => {
    for (const themeId of ISLAMIC_THEME_ORDER) {
      for (const verse of ISLAMIC_THEMES[themeId].verses) {
        expect(verse.reviewerStatus).toBe('pending');
        expect(verse.reviewerName).toBeUndefined();
        expect(verse.reviewDate).toBeUndefined();
      }
    }
  });

  it('never stores Arabic source text this codebase has not had scholar-verified, same as the empty Hadith slots', () => {
    for (const themeId of ISLAMIC_THEME_ORDER) {
      for (const verse of ISLAMIC_THEMES[themeId].verses) {
        expect(verse.originalText).toBeUndefined();
      }
    }
  });

  it('marks every verse sourceType as quran - matches the "no Hadith text yet" reference check above', () => {
    for (const themeId of ISLAMIC_THEME_ORDER) {
      for (const verse of ISLAMIC_THEMES[themeId].verses) {
        expect(verse.sourceType).toBe('quran');
      }
    }
  });

  it('gives every verse a title and at least one usage context, and defaults every verse to active', () => {
    for (const themeId of ISLAMIC_THEME_ORDER) {
      for (const verse of ISLAMIC_THEMES[themeId].verses) {
        expect(verse.title.length).toBeGreaterThan(0);
        expect(verse.usageContexts.length).toBeGreaterThan(0);
        expect(verse.active).toBe(true);
      }
    }
  });
});

describe('DIMENSION_TO_ISLAMIC_THEMES (Phase 3 section 21)', () => {
  it('every one of the 10 curated themes is reachable through relevance ranking - none is a dead end', () => {
    const reachable = new Set(Object.values(DIMENSION_TO_ISLAMIC_THEMES).flat());
    for (const themeId of ISLAMIC_THEME_ORDER) {
      expect(reachable.has(themeId)).toBe(true);
    }
  });

  it('matches the brief\'s worked examples: feeling alone -> ummah, harsh self-judgment -> rahmah, constant doing -> salah', () => {
    expect(rankIslamicThemesByRelevance(['isolation'])[0]).toBe('ummah');
    expect(rankIslamicThemesByRelevance(['self_criticism'])[0]).toBe('rahmah');
    expect(rankIslamicThemesByRelevance(['overcommitment'])).toContain('salah');
  });
});

describe('BURDEN_OPTIONS / NEXT_ACTION_OPTIONS', () => {
  it('has all 10 pressure options from the brief', () => {
    expect(BURDEN_OPTIONS).toHaveLength(10);
    expect(BURDEN_OPTIONS.map((o) => o.id)).toContain('cannot_change');
    expect(BURDEN_OPTIONS.map((o) => o.id)).toContain('other');
  });

  it('offers the Phase 2 Reconnect option set in order', () => {
    expect(NEXT_ACTION_OPTIONS.map((o) => o.id)).toEqual([
      'sit_with_this', 'next_step', 'continue_with_nova', 'trusted_person', 'community', 'return_to_blaze_break',
    ]);
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
