import { db } from './firestore';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, query, orderBy, limit,
} from 'firebase/firestore';
import { SituationKey, Capacity, DurationCategory, RecipeStepType, RecipeFeedback, HelpfulPartId } from '../../recovery-recipes-content';
import { GroundingLens } from '../../grounding-content';

// Recovery Recipes' Firebase service (Batch 1 - Foundation, section 26) -
// every Firestore read/write for the feature lives here, mirroring
// movement-snacks-service.ts's and grounding-personalisation.ts's
// convention exactly: try/catch-to-safe-default on every read, so the
// feature stays usable if Firestore is unreachable (section 31's "Firebase
// unavailable" acceptance test - the deterministic engine never depends on
// this layer succeeding).

export interface RecipePreferences {
  preferredDurationCategory?: DurationCategory;
  helpfulStepTypes?: RecipeStepType[];
  skippedStepTypes?: RecipeStepType[];
  preferredLens?: GroundingLens;
  favouriteRecipeIds?: string[];
  feedbackEnabled?: boolean;
  adaptSavedRecipes?: boolean;
  updatedAt: string;
}

const DEFAULT_PREFERENCES: RecipePreferences = { updatedAt: new Date(0).toISOString() };

export const loadRecipePreferences = async (uid: string): Promise<RecipePreferences> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'recipePreferences', 'main'));
    if (!snap.exists()) return DEFAULT_PREFERENCES;
    return snap.data() as RecipePreferences;
  } catch (e) {
    return DEFAULT_PREFERENCES;
  }
};

export const updateRecipePreferences = async (uid: string, partial: Partial<RecipePreferences>): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'recipePreferences', 'main'), {
    ...partial,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

export const toggleFavouriteRecipe = async (uid: string, savedRecipeId: string, isFavourite: boolean): Promise<void> => {
  const prefs = await loadRecipePreferences(uid);
  const current = prefs.favouriteRecipeIds || [];
  const next = isFavourite
    ? [...new Set([...current, savedRecipeId])].slice(0, 20)
    : current.filter((id) => id !== savedRecipeId);
  await updateRecipePreferences(uid, { favouriteRecipeIds: next });
};

// ---------- Saved recipes ("My Recipes", section 18) ----------

export interface SavedRecoveryRecipe {
  id: string;
  name: string;
  situationKey: SituationKey;
  capacity?: Capacity;
  // The exact step ids included when this was saved, so "Use as before"
  // (section 20) can replay it faithfully; "Adapt for today" rebuilds via
  // the engine from situationKey/capacity instead of these fixed ids.
  stepIds: string[];
  createdAt: string;
  lastUsedAt?: string;
}

export const saveRecoveryRecipe = async (
  uid: string, recipe: { name: string; situationKey: SituationKey; capacity?: Capacity; stepIds: string[] }
): Promise<string> => {
  const ref = await addDoc(collection(db, 'users', uid, 'recoveryRecipes'), {
    name: recipe.name,
    situationKey: recipe.situationKey,
    ...(recipe.capacity ? { capacity: recipe.capacity } : {}),
    stepIds: recipe.stepIds,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
};

export const loadSavedRecipes = async (uid: string): Promise<SavedRecoveryRecipe[]> => {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'recoveryRecipes'));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SavedRecoveryRecipe, 'id'>) }));
  } catch (e) {
    return [];
  }
};

export const deleteSavedRecipe = async (uid: string, savedRecipeId: string): Promise<void> => {
  await deleteDoc(doc(db, 'users', uid, 'recoveryRecipes', savedRecipeId));
};

export const markRecipeUsed = async (uid: string, savedRecipeId: string): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'recoveryRecipes', savedRecipeId), { lastUsedAt: new Date().toISOString() }, { merge: true });
};

// ---------- History (section 25) ----------

export interface RecipeHistoryEntry {
  id: string;
  situationKey: SituationKey;
  capacity?: Capacity;
  durationMinutes?: number;
  completedStepTypes?: RecipeStepType[];
  skippedStepTypes?: RecipeStepType[];
  feedback?: RecipeFeedback;
  helpfulPart?: HelpfulPartId;
  saved?: boolean;
  createdAt: string;
}

// Deliberately minimal fields (section 25's "do not store unnecessary
// sensitive text") - step TYPES, not step content or any free text typed
// during a practical_action/release step. Raw free text (e.g. a brain-dump
// note) stays governed by the same Nova-memory mechanism Movement Snacks
// and Grounding already use, never written here.
export const recordRecipeHistory = async (
  uid: string,
  entry: {
    situationKey: SituationKey; capacity?: Capacity; durationMinutes?: number;
    completedStepTypes?: RecipeStepType[]; skippedStepTypes?: RecipeStepType[];
    feedback?: RecipeFeedback; helpfulPart?: HelpfulPartId; saved?: boolean;
  }
): Promise<void> => {
  await addDoc(collection(db, 'users', uid, 'recipeHistory'), {
    situationKey: entry.situationKey,
    ...(entry.capacity ? { capacity: entry.capacity } : {}),
    ...(typeof entry.durationMinutes === 'number' ? { durationMinutes: entry.durationMinutes } : {}),
    ...(entry.completedStepTypes?.length ? { completedStepTypes: entry.completedStepTypes } : {}),
    ...(entry.skippedStepTypes?.length ? { skippedStepTypes: entry.skippedStepTypes } : {}),
    ...(entry.feedback ? { feedback: entry.feedback } : {}),
    ...(entry.helpfulPart ? { helpfulPart: entry.helpfulPart } : {}),
    ...(typeof entry.saved === 'boolean' ? { saved: entry.saved } : {}),
    createdAt: new Date().toISOString(),
  });
};

const RECENT_HISTORY_LIMIT = 40;

export const loadRecentRecipeHistory = async (uid: string): Promise<RecipeHistoryEntry[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'recipeHistory'),
      orderBy('createdAt', 'desc'),
      limit(RECENT_HISTORY_LIMIT)
    ));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecipeHistoryEntry, 'id'>) }));
  } catch (e) {
    return [];
  }
};

// Recent situations, most-recent first, deduped - feeds getSuggestedRecipe
// and the "recently overused" consideration Batch 6 builds on.
export const getRecentSituations = (history: RecipeHistoryEntry[]): SituationKey[] => {
  const seen = new Set<SituationKey>();
  const ordered: SituationKey[] = [];
  for (const entry of history) {
    if (!seen.has(entry.situationKey)) {
      seen.add(entry.situationKey);
      ordered.push(entry.situationKey);
    }
  }
  return ordered;
};
