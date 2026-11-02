// Recovery Routing Persistence - the one atomic, concurrency-safe gate
// both /api/user/recommendation and /api/recovery/routing-decision go
// through to turn an already-arbitrated routing decision into a durable
// record. Extracted as its own module (rather than left inline in
// server.ts) for the same reason nova-task-deferral-service.ts is its own
// module: a real Firestore emulator can exercise this file's exported
// functions directly, with real transaction/optimistic-concurrency
// semantics, not just the in-memory fake's single-threaded FIFO queue.
//
// The CTO's own acceptance criterion (Report 28): one genuine
// recommendation results in one durable decision and correctly accounted
// budget usage, regardless of refreshes, retries, simultaneous requests,
// or which interface initiated it. This module is where that guarantee
// actually lives - both routes calling the *same* function against the
// *same* two collections (recovery_routing_decisions,
// recovery_routing/session_state) is what makes "regardless of which
// interface" true by construction, not by two routes independently trying
// to agree.
//
// Pure data-layer concerns only: no candidate arbitration, no bandwidth
// logic, no copy/templates. Callers decide WHAT to offer; this module
// only ever decides HOW SAFELY to persist that one real event.

export type SessionCounterField =
  | 'recommendationsOffered' | 'recommendationsDeclined'
  | 'interventionsStarted' | 'interventionsCompleted' | 'interventionsAbandoned';

export const EMPTY_SESSION_COUNTERS = {
  recommendationsOffered: 0,
  recommendationsDeclined: 0,
  interventionsStarted: 0,
  interventionsCompleted: 0,
  interventionsAbandoned: 0,
};

export const todayUtcDateKey = (nowMs: number = Date.now()): string =>
  new Date(nowMs).toISOString().split('T')[0]!;

// Pure: the next day-aware session_state document given whatever is
// currently stored (or nothing/a stale previous day, which resets first)
// and the one field to increment. The single definition every counter
// write in this file - and incrementSessionCounter in server.ts, which
// delegates here - uses, so there is never a second, divergent copy of
// this reset-then-increment rule.
export const nextSessionCounterState = (
  currentData: Record<string, any> | undefined, today: string, field: SessionCounterField,
) => {
  const current = currentData && currentData.day === today ? currentData : { ...EMPTY_SESSION_COUNTERS };
  return {
    day: today,
    recommendationsOffered: current.recommendationsOffered || 0,
    recommendationsDeclined: current.recommendationsDeclined || 0,
    interventionsStarted: current.interventionsStarted || 0,
    interventionsCompleted: current.interventionsCompleted || 0,
    interventionsAbandoned: current.interventionsAbandoned || 0,
    [field]: (current[field] || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
};

export interface RecommendationOfferInput {
  selectedRoute: string;
  selectedModule: string;
  routingOutcome: string;
  reasonCodes: string[];
  confidence: string;
  consideredModules: string[];
  bandwidthBand: string | null;
  sourceSurface: 'pulse_home_recommendation' | 'recovery_hub';
  // An explicit user request bypasses the budget *ceiling* (per
  // recovery-routing-engine.ts's own selectRoute rule) but never bypasses
  // deduplication - re-asking for the same still-open offer reuses its id.
  isExplicitRequest: boolean;
  recentWindowMs: number;
  sessionOfferLimit: number;
  nowMs: number;
}

export type RecommendationOfferResult =
  // The exact same offer (same module, still unresolved, within the
  // recency window) was already persisted - its real id is reused, no
  // second decision or counter increment for the one real event.
  | { kind: 'reused'; decisionId: string }
  // A genuinely new offer was persisted and counted.
  | { kind: 'reserved'; decisionId: string }
  // The shared budget was genuinely exhausted at commit time - never
  // fabricated, never confused with an infrastructure failure.
  | { kind: 'budget_exhausted' }
  // The transaction itself failed (a real Firestore/infra problem) -
  // never silently treated as budget_exhausted or as a successful offer.
  | { kind: 'infra_error'; error: unknown };

// The one place either route creates a new, budget-counted recovery
// routing decision. All of "is there already an open offer for this
// module", "does the budget still allow one more", and "persist the
// counter increment + the decision doc" happen as reads-then-writes
// inside a single transaction - never a plain query used as a
// deduplication guard on its own. In real Firestore, a transaction's
// reads (including this query) are part of its consistency check: if
// another transaction commits a document that would change this query's
// result before this one commits, Firestore aborts and retries this
// transaction's function with a fresh read, so two simultaneous callers
// for the same module can never both observe "nothing open yet" and both
// go on to create one - exactly the race Report 28 identified as
// remaining. (The in-memory test fake achieves the same end result by a
// different, equally real mechanism for this purpose: its own
// runTransaction serializes whole transaction bodies on a FIFO queue, so
// the second caller's transactional read already sees the first caller's
// committed write.)
export async function reserveRecommendationOffer(
  db: FirebaseFirestore.Firestore, uid: string, input: RecommendationOfferInput,
): Promise<RecommendationOfferResult> {
  const decisionsCol = db.collection('users').doc(uid).collection('recovery_routing_decisions');
  const sessionRef = db.collection('users').doc(uid).collection('recovery_routing').doc('session_state');
  const newDecisionRef = decisionsCol.doc();
  const recentWindowStart = new Date(input.nowMs - input.recentWindowMs).toISOString();

  try {
    let result: RecommendationOfferResult = { kind: 'infra_error', error: new Error('transaction never ran') };
    await db.runTransaction(async (tx) => {
      // All reads before any writes, per Firestore transaction rules.
      const existingOpenSnap = await tx.get(
        decisionsCol
          .where('selectedModule', '==', input.selectedModule)
          .where('createdAt', '>=', recentWindowStart)
          .orderBy('createdAt', 'desc')
          .limit(1) as any,
      );
      const existingOpen = existingOpenSnap.docs[0];
      if (existingOpen && !(existingOpen.data() as Record<string, any> | undefined)?.outcome) {
        result = { kind: 'reused', decisionId: existingOpen.id };
        return;
      }

      const sessionSnap = await tx.get(sessionRef);
      const today = todayUtcDateKey(input.nowMs);
      const current = sessionSnap.exists && sessionSnap.data()?.day === today ? sessionSnap.data()! : { ...EMPTY_SESSION_COUNTERS };
      if (!input.isExplicitRequest && (current.recommendationsOffered || 0) >= input.sessionOfferLimit) {
        result = { kind: 'budget_exhausted' };
        return;
      }

      tx.set(sessionRef, nextSessionCounterState(current, today, 'recommendationsOffered'), { merge: true });
      tx.set(newDecisionRef, {
        createdAt: new Date(input.nowMs).toISOString(),
        selectedRoute: input.selectedRoute,
        selectedModule: input.selectedModule,
        routingOutcome: input.routingOutcome,
        reasonCodes: input.reasonCodes,
        confidence: input.confidence,
        consideredModules: input.consideredModules,
        bandwidthBand: input.bandwidthBand,
        sourceSurface: input.sourceSurface,
      });
      result = { kind: 'reserved', decisionId: newDecisionRef.id };
    });
    return result;
  } catch (error) {
    // A genuine transaction/infra failure - the caller must never read
    // this as budget_exhausted, and must never fabricate a decisionId.
    return { kind: 'infra_error', error };
  }
}

export type AbandonmentResolutionResult =
  | { kind: 'abandoned' }
  | { kind: 'already_resolved' }
  | { kind: 'not_found' }
  | { kind: 'infra_error'; error: unknown };

// Atomically and idempotently resolves one stale, started-but-never-
// reported-back decision as abandoned: marks the decision doc and
// increments interventionsAbandoned in the same transaction, guarded by
// re-checking at commit time that the decision is still unresolved.
// Concurrent callers (Pulse's GET and the Hub's POST can both call
// loadRoutingHistory moments apart) racing to resolve the *same* stale
// decisionId must result in exactly one abandonment and one counter
// increment, never two - the second caller's transaction observes the
// first's committed outcome and takes the already_resolved branch
// instead.
export async function resolveStaleInterventionAbandonment(
  db: FirebaseFirestore.Firestore, uid: string, decisionId: string, nowMs: number,
): Promise<AbandonmentResolutionResult> {
  const decisionRef = db.collection('users').doc(uid).collection('recovery_routing_decisions').doc(decisionId);
  const sessionRef = db.collection('users').doc(uid).collection('recovery_routing').doc('session_state');
  const nowIso = new Date(nowMs).toISOString();

  try {
    let result: AbandonmentResolutionResult = { kind: 'infra_error', error: new Error('transaction never ran') };
    await db.runTransaction(async (tx) => {
      const decisionSnap = await tx.get(decisionRef);
      if (!decisionSnap.exists) {
        result = { kind: 'not_found' };
        return;
      }
      const data = decisionSnap.data()!;
      if (data.outcome) {
        result = { kind: 'already_resolved' };
        return;
      }

      const sessionSnap = await tx.get(sessionRef);
      const today = todayUtcDateKey(nowMs);
      const current = sessionSnap.exists ? sessionSnap.data() : undefined;

      tx.set(decisionRef, { outcome: 'abandoned', outcomeAt: nowIso }, { merge: true });
      tx.set(sessionRef, nextSessionCounterState(current, today, 'interventionsAbandoned'), { merge: true });
      result = { kind: 'abandoned' };
    });
    return result;
  } catch (error) {
    return { kind: 'infra_error', error };
  }
}
