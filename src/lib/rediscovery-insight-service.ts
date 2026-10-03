import { db } from './firestore';
import { doc, setDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import { InsightState, RediscoverySection } from '../../rediscovery-engine';
import { ActionInsightRecord, Controllability, SharedResponsibilityPlan, OutsideControlResponse, NothingNeedsFixingChoice } from '../../action-engine';

// The confirmed-insight store the Rediscovery layer's own comment called
// "built in the next batch" - this is that batch. One record per insight
// Nova surfaced, carried through confirmation and (for the Action Engine)
// its Controllability Gate resolution. Mirrors this codebase's narrow-
// update session pattern throughout.

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createActionInsight = async (
  uid: string,
  data: { section: RediscoverySection; text: string; source: string }
): Promise<string> => {
  const now = new Date().toISOString();
  const record: ActionInsightRecord = {
    id: randomId('insight'),
    ...data,
    state: 'nova_noticed',
    controllability: null,
    sharedResponsibilityPlan: null,
    outsideControlChoice: null,
    nothingNeedsFixingChoice: null,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'users', uid, 'rediscovery_insights', record.id), record);
  return record.id;
};

export const updateActionInsight = async (
  uid: string,
  id: string,
  update: Partial<Pick<ActionInsightRecord,
    'state' | 'controllability' | 'sharedResponsibilityPlan' | 'outsideControlChoice' | 'nothingNeedsFixingChoice'
  >>
): Promise<void> => {
  await setDoc(
    doc(db, 'users', uid, 'rediscovery_insights', id),
    { ...update, updatedAt: new Date().toISOString() },
    { merge: true }
  );
};

const INSIGHTS_LOAD_LIMIT = 50;

export const loadRecentActionInsights = async (uid: string): Promise<ActionInsightRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'rediscovery_insights'),
      orderBy('createdAt', 'desc'),
      limit(INSIGHTS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as ActionInsightRecord);
  } catch {
    return [];
  }
};

export type { InsightState, Controllability, SharedResponsibilityPlan, OutsideControlResponse, NothingNeedsFixingChoice };
