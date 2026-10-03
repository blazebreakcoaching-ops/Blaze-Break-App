import { db } from './firestore';
import { getDocs, collection, query, orderBy, limit } from 'firebase/firestore';

// Read-only access to Boundary Architect's existing boundary_scripts
// collection (written by BoundaryRehearsal.tsx itself) - used by My
// Boundaries to show real drafts/saved scripts back, not a second write
// path for the same data.
export interface BoundaryScriptRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  scenarioType: 'workload' | 'family' | 'client' | 'manager' | 'friend' | 'personal';
  scriptText: string;
  status: 'draft' | 'saved';
}

const SCRIPTS_LOAD_LIMIT = 20;

export const loadRecentBoundaryScripts = async (uid: string): Promise<BoundaryScriptRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'boundary_scripts'),
      orderBy('createdAt', 'desc'),
      limit(SCRIPTS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BoundaryScriptRecord);
  } catch {
    return [];
  }
};
