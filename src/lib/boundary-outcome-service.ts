import { db } from './firestore';
import { doc, setDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import {
  resolveStressor, reportStressorReduction,
} from './energy-delta-service';
import {
  AftercareResponse, WaitingChoice, BoundaryOutcome, FearedOutcome,
  RequestSourceType, outcomeReflectsRealReduction,
} from '../../boundary-outcome-engine';

// One record per real boundary action taken (currently: via Boundary
// Autopilot) - ties together the feared outcome captured before acting,
// the aftercare response, and the real outcome, closing the loop the
// spec describes. Mirrors this codebase's narrow-update session pattern.

export interface BoundaryOutcomeRecord {
  id: string;
  sourceAction: 'slack_send' | 'slack_dnd' | 'slack_status' | 'calendar_decline';
  requestSource: RequestSourceType | null;
  fearedOutcome: FearedOutcome | null;
  aftercareResponse: AftercareResponse | null;
  waitingChoice: WaitingChoice | null;
  outcome: BoundaryOutcome | null;
  capacityProtectedApplied: boolean;
  linkedStressorId: string | null;
  createdAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const recordBoundaryAction = async (
  uid: string,
  data: { sourceAction: BoundaryOutcomeRecord['sourceAction']; requestSource: RequestSourceType | null; fearedOutcome: FearedOutcome | null }
): Promise<string> => {
  const record: BoundaryOutcomeRecord = {
    id: randomId('boundary'),
    ...data,
    aftercareResponse: null,
    waitingChoice: null,
    outcome: null,
    capacityProtectedApplied: false,
    linkedStressorId: null,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'users', uid, 'boundary_outcomes', record.id), record);
  return record.id;
};

export const updateBoundaryOutcomeRecord = async (
  uid: string,
  id: string,
  update: Partial<Pick<BoundaryOutcomeRecord, 'aftercareResponse' | 'waitingChoice' | 'outcome' | 'capacityProtectedApplied' | 'linkedStressorId'>>
): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'boundary_outcomes', id), update, { merge: true });
};

const OUTCOMES_LOAD_LIMIT = 40;

export const loadRecentBoundaryOutcomes = async (uid: string): Promise<BoundaryOutcomeRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'boundary_outcomes'),
      orderBy('createdAt', 'desc'),
      limit(OUTCOMES_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as BoundaryOutcomeRecord);
  } catch {
    return [];
  }
};

// CAPACITY PROTECTED: only ever called once a real outcome confirms the
// boundary genuinely reduced demand (never for drafting, practising, or
// the action merely being taken) - reuses the exact same Energy Delta
// write path One Less Thing already established, rather than a second
// capacity-protected mechanism.
export const applyCapacityProtectedIfEarned = async (
  uid: string,
  record: BoundaryOutcomeRecord,
  stressorId: string | null
): Promise<boolean> => {
  if (!stressorId) return false;
  if (record.sourceAction === 'calendar_decline') {
    // Declining the meeting already IS the confirmed reduction - no
    // "how did it go?" to wait on, unlike a negotiated message.
    await resolveStressor(uid, stressorId);
  } else {
    if (!record.outcome || !outcomeReflectsRealReduction(record.outcome)) return false;
    await reportStressorReduction(uid, stressorId, 'meaningfully');
  }
  await updateBoundaryOutcomeRecord(uid, record.id, { capacityProtectedApplied: true, linkedStressorId: stressorId });
  return true;
};
