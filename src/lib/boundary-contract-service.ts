import { db } from './firestore';
import { doc, setDoc, deleteDoc, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { BoundaryContractCategory, ContractReviewEntry } from '../../boundary-contract-engine';

// My Default Boundaries: decided ahead of time, reviewed (never
// auto-enforced) with Keep / Make Exception / Change whenever they're
// actually tested. Mirrors this codebase's narrow-update session pattern.
export interface BoundaryContractRecord {
  id: string;
  category: BoundaryContractCategory;
  customLabel: string | null;
  defaultResponse: string;
  reviewHistory: ContractReviewEntry[];
  createdAt: string;
  updatedAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createBoundaryContract = async (
  uid: string,
  data: { category: BoundaryContractCategory; customLabel: string | null; defaultResponse: string }
): Promise<string> => {
  const now = new Date().toISOString();
  const record: BoundaryContractRecord = {
    id: randomId('contract'),
    ...data,
    reviewHistory: [],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'users', uid, 'boundary_contracts', record.id), record);
  return record.id;
};

export const reviewBoundaryContract = async (
  uid: string,
  id: string,
  update: { defaultResponse: string; reviewHistory: ContractReviewEntry[] }
): Promise<void> => {
  await setDoc(
    doc(db, 'users', uid, 'boundary_contracts', id),
    { defaultResponse: update.defaultResponse, reviewHistory: update.reviewHistory, updatedAt: new Date().toISOString() },
    { merge: true }
  );
};

export const deleteBoundaryContract = async (uid: string, id: string): Promise<void> => {
  await deleteDoc(doc(db, 'users', uid, 'boundary_contracts', id));
};

export const loadBoundaryContracts = async (uid: string): Promise<BoundaryContractRecord[]> => {
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'boundary_contracts'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => d.data() as BoundaryContractRecord);
  } catch {
    return [];
  }
};
