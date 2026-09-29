import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same mocking approach as grounding-personalisation.test.ts: mock only the
// firebase/firestore boundary and exercise the real logic on top of it, so
// this covers exactly the resilience properties the feature needs -
// deleted/missing preferences, no history yet, and Firestore unreachable
// (section 31's acceptance tests).
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => args.slice(1).join('/'),
  doc: (...args: unknown[]) => args.slice(1).join('/'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  query: (...args: unknown[]) => args[0],
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('./firestore', () => ({ db: {} }));

import { getDoc, getDocs, setDoc } from 'firebase/firestore';
import {
  loadMovementPreferences, toggleFavourite,
  loadRecentMovementHistory, computeUsageFromHistory, MovementHistoryEntry,
} from './movement-snacks-service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadMovementPreferences', () => {
  it('returns a safe default for a brand-new user', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => false });
    const prefs = await loadMovementPreferences('u1');
    expect(prefs.favourites).toBeUndefined();
    expect(prefs.updatedAt).toBeTruthy();
  });

  it('returns the safe default rather than throwing when Firestore is unreachable', async () => {
    (getDoc as any).mockRejectedValue(new Error('unavailable'));
    const prefs = await loadMovementPreferences('u2');
    expect(prefs.updatedAt).toBeTruthy();
  });

  it('returns the real stored preferences when they exist', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ favourites: ['desk_stretch'], updatedAt: '2026-01-01T00:00:00.000Z' }) });
    const prefs = await loadMovementPreferences('u3');
    expect(prefs.favourites).toEqual(['desk_stretch']);
  });
});

describe('toggleFavourite', () => {
  it('adds a movement to favourites without duplicating an existing one', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ favourites: ['desk_stretch'], updatedAt: 'x' }) });
    (setDoc as any).mockResolvedValue(undefined);
    await toggleFavourite('u4', 'desk_stretch', true);
    const call = (setDoc as any).mock.calls[0];
    expect(call[1].favourites).toEqual(['desk_stretch']);
  });

  it('removes a movement from favourites', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ favourites: ['desk_stretch', 'after_work'], updatedAt: 'x' }) });
    (setDoc as any).mockResolvedValue(undefined);
    await toggleFavourite('u5', 'desk_stretch', false);
    const call = (setDoc as any).mock.calls[0];
    expect(call[1].favourites).toEqual(['after_work']);
  });
});

describe('loadRecentMovementHistory', () => {
  it('returns an empty history for a new user', async () => {
    (getDocs as any).mockResolvedValue({ docs: [] });
    expect(await loadRecentMovementHistory('u6')).toEqual([]);
  });

  it('returns an empty history rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadRecentMovementHistory('u7')).toEqual([]);
  });
});

describe('computeUsageFromHistory', () => {
  const entry = (movementId: string, createdAt: string, skipped = false, feedback?: any): MovementHistoryEntry =>
    ({ id: `${movementId}-${createdAt}`, movementId, createdAt, skipped, ...(feedback ? { feedback } : {}) });

  it('counts completions and tracks the most recent completion time', () => {
    const usage = computeUsageFromHistory([
      entry('desk_stretch', '2026-01-01T00:00:00.000Z'),
      entry('desk_stretch', '2026-01-02T00:00:00.000Z'),
    ]);
    const desk = usage.find((u) => u.movementId === 'desk_stretch')!;
    expect(desk.completionCount).toBe(2);
    expect(desk.lastCompletedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('a skipped entry does not count as a completion', () => {
    const usage = computeUsageFromHistory([entry('walk_3min', '2026-01-01T00:00:00.000Z', true)]);
    const walk = usage.find((u) => u.movementId === 'walk_3min')!;
    expect(walk.completionCount).toBe(0);
    expect(walk.lastSkippedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('marks favourites even for a movement with no history yet', () => {
    const usage = computeUsageFromHistory([], ['after_work']);
    expect(usage.find((u) => u.movementId === 'after_work')?.favourite).toBe(true);
  });

  it('returns an empty array for a brand-new user with no history and no favourites', () => {
    expect(computeUsageFromHistory([], [])).toEqual([]);
  });

  it('flags a movement whose most recent feedback was "more uncomfortable"', () => {
    const usage = computeUsageFromHistory([
      entry('neck_shoulder', '2026-01-01T00:00:00.000Z', false, 'more_uncomfortable'),
    ]);
    expect(usage.find((u) => u.movementId === 'neck_shoulder')?.recentlyUncomfortable).toBe(true);
  });

  it('a later, gentler feedback clears an earlier "more uncomfortable" flag rather than sticking permanently', () => {
    const usage = computeUsageFromHistory([
      entry('neck_shoulder', '2026-01-01T00:00:00.000Z', false, 'more_uncomfortable'),
      entry('neck_shoulder', '2026-01-05T00:00:00.000Z', false, 'looser'),
    ]);
    expect(usage.find((u) => u.movementId === 'neck_shoulder')?.recentlyUncomfortable).toBe(false);
  });

  it('does not flag a movement that has never received "more uncomfortable" feedback', () => {
    const usage = computeUsageFromHistory([entry('desk_stretch', '2026-01-01T00:00:00.000Z', false, 'more_awake')]);
    expect(usage.find((u) => u.movementId === 'desk_stretch')?.recentlyUncomfortable).toBe(false);
  });
});
