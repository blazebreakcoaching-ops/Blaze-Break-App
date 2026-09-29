import { describe, it, expect, vi, beforeEach } from 'vitest';

// grounding-personalisation.ts is the one place every adaptive-grounding
// Firestore read/write goes through (section 31), and it's exactly the
// layer the brief's Phase 3 hardening acceptance list points at: a
// deleted grounding profile, a brand-new user with no history, Firebase
// being unavailable, and personalisation switched off should all degrade
// to a safe, predictable default rather than an error or a stale-data
// crash. None of that was under test until now. Mirrors auth.test.ts's
// approach of mocking only the Firebase boundary and exercising the real
// logic built on top of it.
const docTokens = new Map<string, string>();
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => `collection:${args.slice(1).join('/')}`,
  doc: (...args: unknown[]) => {
    const path = args.slice(1).join('/');
    docTokens.set(path, path);
    return path;
  },
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: (...args: unknown[]) => args[0],
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('./firestore', () => ({ db: {} }));

import { getDoc, getDocs, setDoc } from 'firebase/firestore';
import {
  loadGroundingProfile, isPersonalisationEnabled, loadPromptHistory,
  getAdaptivePromptSet, getGroundingRecommendation, getPreferredClosing,
  getRelevantPreviousAction, getRelevantPreviousInsight,
} from './grounding-personalisation';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadGroundingProfile', () => {
  it('returns a safe default for a brand-new user with no profile doc yet', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => false });
    const profile = await loadGroundingProfile('u1');
    expect(profile.personalisationEnabled).toBeUndefined();
    expect(profile.updatedAt).toBeTruthy();
  });

  it('returns the same safe default when the profile doc has been deleted', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => false });
    const profile = await loadGroundingProfile('u2');
    expect(isPersonalisationEnabled(profile)).toBe(true);
  });

  it('returns the safe default rather than throwing when Firestore is unreachable', async () => {
    (getDoc as any).mockRejectedValue(new Error('unavailable'));
    const profile = await loadGroundingProfile('u3');
    expect(profile.updatedAt).toBeTruthy();
    expect(isPersonalisationEnabled(profile)).toBe(true);
  });

  it('returns the real stored profile when one exists', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ personalisationEnabled: false, updatedAt: '2026-01-01T00:00:00.000Z' }) });
    const profile = await loadGroundingProfile('u4');
    expect(profile.personalisationEnabled).toBe(false);
  });
});

describe('isPersonalisationEnabled', () => {
  it('defaults to on (opt-out, not opt-in) when the field is unset', () => {
    expect(isPersonalisationEnabled({ updatedAt: 'x' })).toBe(true);
  });
  it('is off only when explicitly set to false', () => {
    expect(isPersonalisationEnabled({ updatedAt: 'x', personalisationEnabled: false })).toBe(false);
  });
  it('stays on when explicitly set to true', () => {
    expect(isPersonalisationEnabled({ updatedAt: 'x', personalisationEnabled: true })).toBe(true);
  });
});

describe('loadPromptHistory', () => {
  it('returns an empty history for a user who has never been shown a prompt', async () => {
    (getDocs as any).mockResolvedValue({ docs: [] });
    expect(await loadPromptHistory('u5')).toEqual([]);
  });

  it('returns an empty history rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadPromptHistory('u6')).toEqual([]);
  });

  it('maps existing history docs', async () => {
    const entry = { promptKey: 'control_1', lastShownAt: '2026-01-01T00:00:00.000Z', timesShown: 2, userEngaged: 0, userSkipped: 0 };
    (getDocs as any).mockResolvedValue({ docs: [{ data: () => entry }] });
    expect(await loadPromptHistory('u7')).toEqual([entry]);
  });
});

describe('getAdaptivePromptSet', () => {
  it('still returns a prompt for a new user with no history, and never throws even if the fire-and-forget write fails', async () => {
    (getDocs as any).mockResolvedValue({ docs: [] });
    (setDoc as any).mockRejectedValue(new Error('unavailable'));
    const chosen = await getAdaptivePromptSet('u8', 'control');
    expect(chosen.promptKey).toMatch(/^control_/);
    expect(chosen.text.length).toBeGreaterThan(0);
  });
});

describe('getGroundingRecommendation', () => {
  it('returns null when personalisation is switched off, even with a strong signal', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ personalisationEnabled: false, updatedAt: 'x' }) });
    const rec = await getGroundingRecommendation('u9', { capacity: 'running_on_empty', recentPatternKey: null, recentSameThemeSessionCount: 0 });
    expect(rec).toBeNull();
  });

  it('returns a real recommendation when personalisation is on (default) and the signal is strong', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => false });
    const rec = await getGroundingRecommendation('u10', { capacity: 'running_on_empty', recentPatternKey: null, recentSameThemeSessionCount: 0 });
    expect(rec?.depth).toBe('reset');
  });

  it('returns null (not a fabricated suggestion) when there is no real signal', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => false });
    const rec = await getGroundingRecommendation('u11', { capacity: 'ready_to_reflect', recentPatternKey: null, recentSameThemeSessionCount: 0 });
    expect(rec).toBeNull();
  });
});

describe('getRelevantPreviousAction / getRelevantPreviousInsight', () => {
  it('returns null when the user has no previous history', async () => {
    (getDocs as any).mockResolvedValue({ empty: true, docs: [] });
    expect(await getRelevantPreviousAction('u12')).toBeNull();
    expect(await getRelevantPreviousInsight('u12')).toBeNull();
  });

  it('returns null rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await getRelevantPreviousAction('u13')).toBeNull();
    expect(await getRelevantPreviousInsight('u13')).toBeNull();
  });

  it('returns the most recent record when one exists', async () => {
    const data = { chosenValue: 'rest', nextAlignedAction: 'Take the evening off', createdAt: '2026-01-01T00:00:00.000Z' };
    (getDocs as any).mockResolvedValue({ empty: false, docs: [{ id: 'a1', data: () => data }] });
    expect(await getRelevantPreviousAction('u14')).toEqual({ id: 'a1', ...data });
  });
});

describe('getPreferredClosing', () => {
  it('uses the explicit preference when the user has set one', () => {
    expect(getPreferredClosing({ updatedAt: 'x', preferredClosingStyle: 'islamic' }, 'secular'))
      .toBe('Take the means available to you, then allow the outcome to rest with Allah.');
  });

  it('falls back to a sensible per-lens default for a user with no preference set', () => {
    expect(getPreferredClosing({ updatedAt: 'x' }, 'islamic'))
      .toBe('Take the means available to you, then allow the outcome to rest with Allah.');
    expect(getPreferredClosing({ updatedAt: 'x' }, 'secular'))
      .toBe('You do not have to resolve everything in one sitting.');
  });
});
