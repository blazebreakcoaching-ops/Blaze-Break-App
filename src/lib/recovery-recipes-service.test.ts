import { describe, it, expect, vi, beforeEach } from 'vitest';

// Same mocking approach as movement-snacks-service.test.ts: mock only the
// firebase/firestore boundary and exercise the real logic on top of it.
vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => args.slice(1).join('/'),
  doc: (...args: unknown[]) => args.slice(1).join('/'),
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

import { getDoc, getDocs, setDoc, addDoc, deleteDoc } from 'firebase/firestore';
import {
  loadRecipePreferences, toggleFavouriteRecipe, saveRecoveryRecipe, loadSavedRecipes,
  deleteSavedRecipe, markRecipeUsed, recordRecipeHistory, loadRecentRecipeHistory, getRecentSituations,
  deriveStepTypePreferences, RecipeHistoryEntry,
} from './recovery-recipes-service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadRecipePreferences', () => {
  it('returns a safe default for a brand-new user', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => false });
    const prefs = await loadRecipePreferences('u1');
    expect(prefs.favouriteRecipeIds).toBeUndefined();
    expect(prefs.updatedAt).toBeTruthy();
  });

  it('returns the safe default rather than throwing when Firestore is unreachable', async () => {
    (getDoc as any).mockRejectedValue(new Error('unavailable'));
    const prefs = await loadRecipePreferences('u2');
    expect(prefs.updatedAt).toBeTruthy();
  });

  it('returns the real stored preferences when they exist', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ preferredLens: 'values', updatedAt: '2026-01-01T00:00:00.000Z' }) });
    const prefs = await loadRecipePreferences('u3');
    expect(prefs.preferredLens).toBe('values');
  });
});

describe('toggleFavouriteRecipe', () => {
  it('adds a saved recipe id to favourites without duplicating', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ favouriteRecipeIds: ['r1'], updatedAt: 'x' }) });
    (setDoc as any).mockResolvedValue(undefined);
    await toggleFavouriteRecipe('u4', 'r1', true);
    const call = (setDoc as any).mock.calls[0];
    expect(call[1].favouriteRecipeIds).toEqual(['r1']);
  });

  it('removes a saved recipe id from favourites', async () => {
    (getDoc as any).mockResolvedValue({ exists: () => true, data: () => ({ favouriteRecipeIds: ['r1', 'r2'], updatedAt: 'x' }) });
    (setDoc as any).mockResolvedValue(undefined);
    await toggleFavouriteRecipe('u5', 'r1', false);
    const call = (setDoc as any).mock.calls[0];
    expect(call[1].favouriteRecipeIds).toEqual(['r2']);
  });
});

describe('saved recipes ("My Recipes")', () => {
  it('saves a recipe and returns its id', async () => {
    (addDoc as any).mockResolvedValue({ id: 'new-id' });
    const id = await saveRecoveryRecipe('u6', { name: 'Sunday night', situationKey: 'need_switch_off', stepIds: ['a', 'b'] });
    expect(id).toBe('new-id');
    const call = (addDoc as any).mock.calls[0];
    expect(call[1].name).toBe('Sunday night');
    expect(call[1].stepIds).toEqual(['a', 'b']);
  });

  it('returns an empty list for a new user rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadSavedRecipes('u7')).toEqual([]);
  });

  it('loads saved recipes with their ids attached', async () => {
    (getDocs as any).mockResolvedValue({ docs: [{ id: 'r1', data: () => ({ name: 'Sunday night', situationKey: 'need_switch_off', stepIds: [], createdAt: 'x' }) }] });
    const saved = await loadSavedRecipes('u8');
    expect(saved[0]!.id).toBe('r1');
    expect(saved[0]!.name).toBe('Sunday night');
  });

  it('deletes and marks-used without throwing when the calls succeed', async () => {
    (deleteDoc as any).mockResolvedValue(undefined);
    (setDoc as any).mockResolvedValue(undefined);
    await expect(deleteSavedRecipe('u9', 'r1')).resolves.toBeUndefined();
    await expect(markRecipeUsed('u9', 'r1')).resolves.toBeUndefined();
  });
});

describe('recipeHistory', () => {
  it('only writes fields that were actually provided, never empty arrays/undefined keys', async () => {
    (addDoc as any).mockResolvedValue({ id: 'h1' });
    await recordRecipeHistory('u10', { situationKey: 'hard_meeting' });
    const call = (addDoc as any).mock.calls[0];
    expect(call[1]).not.toHaveProperty('feedback');
    expect(call[1]).not.toHaveProperty('completedStepTypes');
    expect(call[1].situationKey).toBe('hard_meeting');
  });

  it('returns an empty history rather than throwing when Firestore is unreachable', async () => {
    (getDocs as any).mockRejectedValue(new Error('unavailable'));
    expect(await loadRecentRecipeHistory('u11')).toEqual([]);
  });
});

describe('getRecentSituations', () => {
  const entry = (situationKey: any, createdAt: string): RecipeHistoryEntry => ({ id: situationKey + createdAt, situationKey, createdAt });

  it('dedupes, keeping only the first (most recent) occurrence of each situation', () => {
    const situations = getRecentSituations([
      entry('hard_meeting', '2026-01-03T00:00:00.000Z'),
      entry('over_capacity', '2026-01-02T00:00:00.000Z'),
      entry('hard_meeting', '2026-01-01T00:00:00.000Z'),
    ]);
    expect(situations).toEqual(['hard_meeting', 'over_capacity']);
  });

  it('returns an empty array for no history', () => {
    expect(getRecentSituations([])).toEqual([]);
  });
});

describe('deriveStepTypePreferences', () => {
  const entry = (completed: any[], skipped: any[]): RecipeHistoryEntry =>
    ({ id: Math.random().toString(), situationKey: 'hard_meeting', createdAt: 'x', completedStepTypes: completed, skippedStepTypes: skipped });

  it('ranks a type as helpful once it has been completed more than skipped', () => {
    const { helpfulStepTypes } = deriveStepTypePreferences([
      entry(['movement', 'movement', 'movement'], []),
      entry([], ['nova_reflection']),
    ]);
    expect(helpfulStepTypes).toContain('movement');
    expect(helpfulStepTypes).not.toContain('nova_reflection');
  });

  it('ranks a type as frequently skipped once it has been skipped more than completed', () => {
    const { skippedStepTypes } = deriveStepTypePreferences([
      entry([], ['grounding', 'grounding']),
      entry(['grounding'], []),
    ]);
    expect(skippedStepTypes).toContain('grounding');
  });

  it('caps each list at the top 3', () => {
    const { helpfulStepTypes } = deriveStepTypePreferences([
      entry(['movement', 'nova_reflection', 'practical_action', 'release', 'connection'], []),
    ]);
    expect(helpfulStepTypes.length).toBeLessThanOrEqual(3);
  });

  it('returns empty lists for a brand-new user with no history', () => {
    expect(deriveStepTypePreferences([])).toEqual({ helpfulStepTypes: [], skippedStepTypes: [] });
  });

  it('never lists the same type as both helpful and skipped', () => {
    const { helpfulStepTypes, skippedStepTypes } = deriveStepTypePreferences([
      entry(['movement', 'movement'], ['movement']),
    ]);
    expect(helpfulStepTypes).toContain('movement');
    expect(skippedStepTypes).not.toContain('movement');
  });
});
