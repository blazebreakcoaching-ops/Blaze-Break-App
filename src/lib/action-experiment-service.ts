import { db } from './firestore';
import { doc, setDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import {
  ExperimentRecord, ExperimentStatus, ExperimentDuration, MomentOfTruthPlan, FrictionType, ActionLadderLevel,
} from '../../action-engine';

// One record per experiment - created from a confirmed, controllable
// insight, carried through to review (a later batch). Mirrors this
// codebase's narrow-update session pattern throughout.

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createExperiment = async (
  uid: string,
  data: {
    insightId: string; text: string; ladderLevel: ActionLadderLevel; duration: ExperimentDuration | null;
    momentOfTruth: MomentOfTruthPlan | null; friction: FrictionType | null; minimumViableChange: string | null;
  }
): Promise<string> => {
  const now = new Date().toISOString();
  const record: ExperimentRecord = { id: randomId('experiment'), ...data, status: 'active', createdAt: now, updatedAt: now };
  await setDoc(doc(db, 'users', uid, 'action_experiments', record.id), record);
  return record.id;
};

export const updateExperimentStatus = async (uid: string, id: string, status: ExperimentStatus): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'action_experiments', id), { status, updatedAt: new Date().toISOString() }, { merge: true });
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
