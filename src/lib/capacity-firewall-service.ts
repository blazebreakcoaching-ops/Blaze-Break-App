import { db } from './firestore';
import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import {
  FirewallChoice, SqueezeArea, AcceptRationale, ConditionalYesLever,
} from '../../capacity-firewall-engine';

// The Capacity Firewall's decision log - one record per incoming demand
// the user ran through The Pause / Capacity Gate / Choice Screen. Mirrors
// this codebase's other session-log services: try/catch-to-safe-default on
// every read, narrow updates added after creation as the flow progresses.

export interface FirewallDecisionRecord {
  id: string;
  demandDescription: string;
  estimatedMinutes: number | null;
  isToday: boolean;
  capacityScore: number | null;
  plannedLoad: number | null;
  squeezeAreas: SqueezeArea[];
  choice: FirewallChoice | null;
  acceptRationale: AcceptRationale | null;
  conditionalYesLever: ConditionalYesLever | null;
  conditionalYesMessage: string | null;
  delegateAnswer: string | null;
  deferAnswer: string | null;
  createdAt: string;
}

const randomId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const recordFirewallDecision = async (
  uid: string,
  data: {
    demandDescription: string; estimatedMinutes: number | null; isToday: boolean;
    capacityScore: number | null; plannedLoad: number | null;
  }
): Promise<string> => {
  const record: FirewallDecisionRecord = {
    id: randomId('firewall'),
    ...data,
    squeezeAreas: [],
    choice: null,
    acceptRationale: null,
    conditionalYesLever: null,
    conditionalYesMessage: null,
    delegateAnswer: null,
    deferAnswer: null,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'users', uid, 'capacity_firewall_decisions', record.id), record);
  return record.id;
};

export const updateFirewallDecision = async (
  uid: string,
  decisionId: string,
  update: Partial<Pick<FirewallDecisionRecord,
    'squeezeAreas' | 'choice' | 'acceptRationale' | 'conditionalYesLever' | 'conditionalYesMessage' | 'delegateAnswer' | 'deferAnswer'
  >>
): Promise<void> => {
  await setDoc(doc(db, 'users', uid, 'capacity_firewall_decisions', decisionId), update, { merge: true });
};

const DECISIONS_LOAD_LIMIT = 30;

export const loadRecentFirewallDecisions = async (uid: string): Promise<FirewallDecisionRecord[]> => {
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'capacity_firewall_decisions'),
      orderBy('createdAt', 'desc'),
      limit(DECISIONS_LOAD_LIMIT)
    ));
    return snap.docs.map((d) => d.data() as FirewallDecisionRecord);
  } catch {
    return [];
  }
};
