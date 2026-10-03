import { db } from './firestore';
import { doc, setDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import {
  ExperimentRecord, ExperimentStatus, ExperimentDuration, MomentOfTruthPlan, FrictionType, ActionLadderLevel,
  MomentChoice, ReviewChoice, ChangeReason, AutopsyReason, KeepFollowUp,
} from '../../action-engine';

// One record per experiment - created from a confirmed, controllable
// insight, carried through to review. Mirrors this codebase's
// narrow-update session pattern throughout.

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createExperiment = async (
  uid: string,
  data: {
    insightId: string; text: string; ladderLevel: ActionLadderLevel; duration: ExperimentDuration | null;
    momentOfTruth: MomentOfTruthPlan | null; friction: FrictionType | null; minimumViableChange: string | null;
  }
): Promise<string> => {
  const now = new Date().toISOString();
  const record: ExperimentRecord = {
    id: randomId('experiment'), ...data, status: 'active',
    lastMomentChoice: null, prediction: null, reality: null,
    reviewChoice: null, changeReason: null, autopsyReason: null, keepFollowUp: null,
    createdAt: now, updatedAt: now,
  };
  await setDoc(doc(db, 'users', uid, 'action_experiments', record.id), record);
  return record.id;
};

export const updateExperimentStatus = async (uid: string, id: string, status: ExperimentStatus): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'action_experiments', id), { status, updatedAt: new Date().toISOString() }, { merge: true });
};

export const recordMomentChoice = async (uid: string, id: string, choice: MomentChoice): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'action_experiments', id), { lastMomentChoice: choice, updatedAt: new Date().toISOString() }, { merge: true });
};

export const recordPrediction = async (uid: string, id: string, prediction: string): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'action_experiments', id), { prediction, updatedAt: new Date().toISOString() }, { merge: true });
};

export const recordReality = async (uid: string, id: string, reality: string): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'action_experiments', id), { reality, updatedAt: new Date().toISOString() }, { merge: true });
};

export const recordReview = async (
  uid: string, id: string,
  data: { reviewChoice: ReviewChoice; changeReason: ChangeReason | null; keepFollowUp: KeepFollowUp | null; status: ExperimentStatus }
): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'action_experiments', id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
};

export const recordAutopsy = async (
  uid: string, id: string,
  data: { autopsyReason: AutopsyReason; status: ExperimentStatus }
): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'action_experiments', id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
};

const EXPERIMENTS_LOAD_LIMIT = 50;

export const loadRecentExperiments = async (uid: string): Promise<ExperimentRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'action_experiments'),
      orderBy('createdAt', 'desc'),
      limit(EXPERIMENTS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as ExperimentRecord);
  } catch {
    return [];
  }
};
