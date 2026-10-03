import { db } from './firestore';
import { doc, setDoc, getDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import { BoundaryProfileId, BoundaryActionId, UrgencyClassification } from '../../digital-boundary-shield-engine';

// Saved Boundary Profiles - "the transition should not require rebuilding
// settings every day." One doc per profile, keyed by profile id so a
// custom profile's chosen actions persist across sessions too.

export interface SavedBoundaryProfile {
  profileId: BoundaryProfileId;
  actions: BoundaryActionId[];
  updatedAt: string;
}

export const saveBoundaryProfile = async (uid: string, profileId: BoundaryProfileId, actions: BoundaryActionId[]): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'boundary_profiles', profileId), {
    profileId, actions, updatedAt: new Date().toISOString(),
  });
};

export const loadBoundaryProfile = async (uid: string, profileId: BoundaryProfileId): Promise<SavedBoundaryProfile | null> => {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'boundary_profiles', profileId));
    return snap.exists() ? (snap.data() as SavedBoundaryProfile) : null;
  } catch {
    return null;
  }
};

// "Urgent or Loud?" assessment log - the questions, the user's own
// answers, and their own final classification (never an automated
// verdict), so a later "My Boundaries" view can show what usually tests
// a boundary without re-deriving it from scratch.

export interface UrgentOrLoudRecord {
  id: string;
  message: string;
  answers: Record<string, string>;
  classification: UrgencyClassification;
  createdAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const recordUrgentOrLoudAssessment = async (
  uid: string,
  data: { message: string; answers: Record<string, string>; classification: UrgencyClassification }
): Promise<string> => {
  const record: UrgentOrLoudRecord = { id: randomId('urgentloud'), ...data, createdAt: new Date().toISOString() };
  await setDoc(doc(db, 'users', uid, 'urgent_or_loud_assessments', record.id), record);
  return record.id;
};

const ASSESSMENTS_LOAD_LIMIT = 20;

export const loadRecentUrgentOrLoudAssessments = async (uid: string): Promise<UrgentOrLoudRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'urgent_or_loud_assessments'),
      orderBy('createdAt', 'desc'),
      limit(ASSESSMENTS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as UrgentOrLoudRecord);
  } catch {
    return [];
  }
};
