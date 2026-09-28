import { db } from './firestore';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, query, orderBy, limit,
} from 'firebase/firestore';
import {
  GroundingProfile, PromptHistoryEntry, AdaptivePrompt, SessionDepth, ClosingStyle,
  PROMPT_FAMILIES, selectAdaptivePrompt, CLOSING_STYLES,
  getSessionDepthRecommendation, SessionDepthRecommendationInput, SessionDepthRecommendation,
} from '../../grounding-adaptive';
import { PatternDimensionId } from '../../grounding-patterns-taxonomy';

// Phase 3's dedicated personalisation service (section 31) - all
// Firestore access for adaptive grounding lives here, never inline in a
// UI component, so FaithValuesMode.tsx and any future entry point (smart
// entry points, routines) share exactly one source of truth for how
// personalisation reads/writes work. Deliberately mirrors the pure logic
// in grounding-adaptive.ts rather than re-implementing it.

const DEFAULT_PROFILE: GroundingProfile = { updatedAt: new Date(0).toISOString() };

export const loadGroundingProfile = async (uid: string): Promise<GroundingProfile> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'groundingProfile', 'main'));
    if (!snap.exists()) return DEFAULT_PROFILE;
    return snap.data() as GroundingProfile;
  } catch (e) {
    return DEFAULT_PROFILE;
  }
};

// personalisationEnabled defaults to true (opt-out, not opt-in) unless
// the profile doc explicitly says otherwise - matches Phase 2's
// patternAnalysisEnabled convention (users/{uid}/preferences/grounding).
export const isPersonalisationEnabled = (profile: GroundingProfile): boolean =>
  profile.personalisationEnabled !== false;

export const updateGroundingProfile = async (uid: string, partial: Partial<GroundingProfile>): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'groundingProfile', 'main'), {
    ...partial,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
};

// Section 37's "Reset my grounding personalisation" - clears derived
// personalisation metadata (the profile doc + every prompt-history
// record) while deliberately leaving grounding_sessions/reflection_
// patterns/aligned_actions untouched, since those are the person's own
// reflection history, not derived personalisation state.
export const resetGroundingPersonalisation = async (uid: string): Promise<void> => {
  const [profileSnap, historySnap] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'groundingProfile', 'main')),
    getDocs(collection(db, 'users', uid, 'groundingPromptHistory')),
  ]);
  const deletes: Promise<void>[] = [];
  if (profileSnap.exists()) deletes.push(deleteDoc(profileSnap.ref));
  historySnap.docs.forEach((d) => deletes.push(deleteDoc(d.ref)));
  await Promise.all(deletes);
};

export const loadPromptHistory = async (uid: string): Promise<PromptHistoryEntry[]> => {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'groundingPromptHistory'));
    return snap.docs.map((d) => d.data() as PromptHistoryEntry);
  } catch (e) {
    return [];
  }
};

// The single entry point the UI calls to get "which question next" -
// combines the pure selection logic with a fire-and-forget write
// recording that this prompt was shown, so the next call already reflects
// it (question-fatigue prevention, section 5).
export const getAdaptivePromptSet = async (
  uid: string,
  patternKey: PatternDimensionId
): Promise<AdaptivePrompt> => {
  const history = await loadPromptHistory(uid);
  const chosen = selectAdaptivePrompt(patternKey, history);
  recordPromptShown(uid, chosen.promptKey, patternKey, history).catch(() => {});
  return chosen;
};

export const recordPromptShown = async (
  uid: string,
  promptKey: string,
  patternKey: PatternDimensionId,
  existingHistory?: PromptHistoryEntry[]
): Promise<void> => {
  const history = existingHistory || (await loadPromptHistory(uid));
  const existing = history.find((h) => h.promptKey === promptKey);
  const now = new Date().toISOString();
  await setDoc(doc(db, 'users', uid, 'groundingPromptHistory', promptKey), {
    promptKey,
    patternKey,
    lastShownAt: now,
    timesShown: (existing?.timesShown || 0) + 1,
    ...(existing?.userEngaged !== undefined ? { userEngaged: existing.userEngaged } : {}),
    ...(existing?.userSkipped !== undefined ? { userSkipped: existing.userSkipped } : {}),
    ...(existing?.helpfulRating ? { helpfulRating: existing.helpfulRating } : {}),
    ...(existing ? {} : { createdAt: now }),
    updatedAt: now,
  }, { merge: true });
};

export const recordPromptFeedback = async (
  uid: string,
  promptKey: string,
  patternKey: PatternDimensionId,
  rating: 'helpful' | 'not_helpful'
): Promise<void> => {
  const history = await loadPromptHistory(uid);
  const existing = history.find((h) => h.promptKey === promptKey);
  const now = new Date().toISOString();
  await setDoc(doc(db, 'users', uid, 'groundingPromptHistory', promptKey), {
    promptKey,
    patternKey,
    lastShownAt: existing?.lastShownAt || now,
    timesShown: existing?.timesShown || 1,
    helpfulRating: rating,
    ...(existing ? {} : { createdAt: now }),
    updatedAt: now,
  }, { merge: true });
};

export const GROUNDING_FEEDBACK_OPTIONS = [
  { id: 'question_helped_see_differently', label: 'The question helped me see it differently' },
  { id: 'separating_control_helped', label: 'Separating control helped' },
  { id: 'faith_reflection_helped', label: 'The faith reflection helped' },
  { id: 'values_reflection_helped', label: 'The values reflection helped' },
  { id: 'release_exercise_helped', label: 'The release exercise helped' },
  { id: 'choosing_action_helped', label: 'Choosing one action helped' },
  { id: 'just_needed_space', label: 'I just needed space' },
  { id: 'not_really', label: 'Not really' },
] as const;

export const recordGroundingFeedback = async (
  uid: string,
  selectedOptions: string[],
  opts?: { helpfulNote?: string; sessionDepth?: SessionDepth }
): Promise<void> => {
  await addDoc(collection(db, 'users', uid, 'groundingFeedback'), {
    selectedOptions: selectedOptions.slice(0, 8),
    ...(opts?.helpfulNote?.trim() ? { helpfulNote: opts.helpfulNote.trim().slice(0, 200) } : {}),
    ...(opts?.sessionDepth ? { sessionDepth: opts.sessionDepth } : {}),
    createdAt: new Date().toISOString(),
  });
};

// Respects the personalisation toggle (section 37) at the single point
// every recommendation flows through - if it's off, "Let Nova choose"
// simply never has anything to say, rather than every call site needing
// to remember to check the profile itself.
export const getGroundingRecommendation = async (
  uid: string,
  input: SessionDepthRecommendationInput
): Promise<SessionDepthRecommendation | null> => {
  const profile = await loadGroundingProfile(uid);
  if (!isPersonalisationEnabled(profile)) return null;
  return getSessionDepthRecommendation(input);
};

export const getPreferredClosing = (profile: GroundingProfile, lens: string): string => {
  if (profile.preferredClosingStyle) return CLOSING_STYLES[profile.preferredClosingStyle];
  const fallback: Record<string, ClosingStyle> = {
    islamic: 'islamic', faith: 'faith_friendly', values: 'values', secular: 'compassionate',
  };
  return CLOSING_STYLES[fallback[lens] || 'compassionate'];
};

export const getRelevantPreviousAction = async (
  uid: string
): Promise<{ id: string; chosenValue: string; nextAlignedAction: string; createdAt: string } | null> => {
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'aligned_actions'), orderBy('createdAt', 'desc'), limit(1)));
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    return { id: d.id, ...(d.data() as any) };
  } catch (e) {
    return null;
  }
};

export const getRelevantPreviousInsight = async (
  uid: string
): Promise<{ id: string; type: string; text: string; createdAt: string } | null> => {
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'savedReflections'), orderBy('createdAt', 'desc'), limit(1)));
    if (snap.empty) return null;
    const d = snap.docs[0]!;
    return { id: d.id, ...(d.data() as any) };
  } catch (e) {
    return null;
  }
};

export { PROMPT_FAMILIES };
