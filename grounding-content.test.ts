import { describe, it, expect } from 'vitest';
import {
  ISLAMIC_THEMES,
  ISLAMIC_THEME_ORDER,
  BURDEN_OPTIONS,
  NEXT_ACTION_OPTIONS,
  detectGroundingPatterns,
  GroundingSessionRecord,
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

const session = (overrides: Partial<GroundingSessionRecord>): Pick<GroundingSessionRecord, 'burdenIds' | 'controllableItems' | 'uncontrollableItems' | 'nextAction'> => ({
  burdenIds: [],
  controllableItems: [],
  uncontrollableItems: [],
  nextAction: undefined,
  ...overrides,
});

describe('detectGroundingPatterns', () => {
  it('returns nothing with fewer than 3 sessions', () => {
    const sessions = [
      session({ uncontrollableItems: ['The final outcome'] }),
      session({ uncontrollableItems: ['The final outcome'] }),
    ];
    expect(detectGroundingPatterns(sessions)).toEqual([]);
  });

  it('flags releasing_control once it appears in a majority of sessions', () => {
    const sessions = [
      session({ uncontrollableItems: ['The final outcome'] }),
      session({ uncontrollableItems: ["Other people's reactions"] }),
      session({ uncontrollableItems: ['Timing'] }),
    ];
    const result = detectGroundingPatterns(sessions);
    expect(result.map((p) => p.id)).toEqual(['releasing_control']);
    expect(result[0].sessionsAffected).toBe(3);
    expect(result[0].totalSessions).toBe(3);
  });

  it('does not flag releasing_control on a minority of sessions', () => {
    const sessions = [
      session({ uncontrollableItems: ['The final outcome'] }),
      session({ uncontrollableItems: ['The past'] }),
      session({ uncontrollableItems: ['Unexpected events'] }),
    ];
    expect(detectGroundingPatterns(sessions)).toEqual([]);
  });

  it('flags rest_without_guilt only when guilt AND rest co-occur', () => {
    const sessions = [
      session({ burdenIds: ['guilt'], nextAction: 'rest' }),
      session({ burdenIds: ['guilt'], nextAction: 'rest' }),
      session({ burdenIds: ['guilt'], nextAction: 'nova' }), // guilt without rest doesn't count
    ];
    const result = detectGroundingPatterns(sessions);
    expect(result.map((p) => p.id)).toEqual(['rest_without_guilt']);
    expect(result[0].sessionsAffected).toBe(2);
  });

  it('flags asking_for_support from either the controllable item or the chosen next action', () => {
    const sessions = [
      session({ controllableItems: ['Asking for help'] }),
      session({ nextAction: 'trusted_person' }),
      session({ controllableItems: [], nextAction: 'rest' }),
    ];
    const result = detectGroundingPatterns(sessions);
    expect(result.map((p) => p.id)).toEqual(['asking_for_support']);
    expect(result[0].sessionsAffected).toBe(2);
  });

  it('returns multiple genuine patterns together', () => {
    const sessions = [
      session({ uncontrollableItems: ['The final outcome'], burdenIds: ['guilt'], nextAction: 'rest' }),
      session({ uncontrollableItems: ['Timing'], burdenIds: ['guilt'], nextAction: 'rest' }),
      session({ uncontrollableItems: ["Other people's reactions"], burdenIds: ['guilt'], nextAction: 'rest' }),
    ];
    const result = detectGroundingPatterns(sessions);
    expect(result.map((p) => p.id).sort()).toEqual(['releasing_control', 'rest_without_guilt']);
  });

  it('returns nothing for a set of unrelated, non-repeating sessions', () => {
    const sessions = [
      session({ uncontrollableItems: ['The past'] }),
      session({ burdenIds: ['work'] }),
      session({ nextAction: 'nova' }),
    ];
    expect(detectGroundingPatterns(sessions)).toEqual([]);
  });
});
