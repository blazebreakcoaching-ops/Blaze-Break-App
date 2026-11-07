// Firestore emulator integration tests for Recovery Routing Persistence
// (Report 28 - "genuine Firebase emulator concurrency tests where
// feasible, not only the in-memory fake that serializes transaction
// callbacks").
//
// Same reasoning as nova-task-deferral-service.emulator.test.ts's own
// header: the in-memory fake (test/fake-firestore.ts) proves this
// module's logic correct against a hand-written, single-threaded
// FIFO-queued runTransaction - useful, but it cannot exercise real
// Firestore's actual optimistic-concurrency-with-retry behaviour, which
// is the real mechanism this module's dedup/budget guarantee depends on
// in production. This file proves the same operations against a REAL
// Firestore emulator, with real network-call ordering and genuinely
// concurrent transaction attempts.
//
// HOW TO RUN THIS FILE FOR REAL:
//   1. Start the Firestore emulator (needs Java):
//        npx firebase-tools@latest emulators:start --only firestore --project demo-blaze-break-test
//   2. In a second terminal, with the emulator still running:
//        npm run test:emulator
//
// IF THE EMULATOR IS NOT RUNNING: every test in this file is SKIPPED, not
// passed or failed - same beforeAll reachability probe + ctx.skip()
// pattern as the other emulator suites in this repo.
//
// NO PRODUCTION CREDENTIALS OR DATABASE: FIRESTORE_EMULATOR_HOST is set
// before initializing a dedicated, separately named firebase-admin app
// against a synthetic "demo-" project id.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { reserveRecommendationOffer, resolveStaleInterventionAbandonment, todayUtcDateKey } from './recovery-routing-persistence';

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'demo-blaze-break-test';

let emulatorAvailable = false;
let db: any;
let app: any;

async function clearEmulatorFirestore(): Promise<void> {
  await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
}

beforeAll(async () => {
  try {
    const probe = await fetch(`http://${EMULATOR_HOST}/`, { signal: AbortSignal.timeout(2_000) });
    emulatorAvailable = probe.ok;
  } catch {
    emulatorAvailable = false;
  }
  if (!emulatorAvailable) {
    // eslint-disable-next-line no-console
    console.warn(
      `\n[recovery-routing-persistence.emulator.test.ts] Firestore emulator not reachable at ${EMULATOR_HOST} - ` +
      'every test in this file will be SKIPPED, not passed or failed. See this file\'s own header for how to run it for real.\n',
    );
    return;
  }
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  const { initializeApp, getApps, deleteApp } = await import('firebase-admin/app');
  const existing = getApps().find((a) => a.name === 'recovery-routing-persistence-emulator-test');
  if (existing) await deleteApp(existing);
  app = initializeApp({ projectId: PROJECT_ID }, 'recovery-routing-persistence-emulator-test');
  const { getFirestore } = await import('firebase-admin/firestore');
  db = getFirestore(app);
});

afterAll(async () => {
  if (!emulatorAvailable || !app) return;
  const { deleteApp } = await import('firebase-admin/app');
  await deleteApp(app);
});

beforeEach(async (ctx) => {
  if (!emulatorAvailable) {
    ctx.skip();
    return;
  }
  await clearEmulatorFirestore();
});

const baseOffer = (overrides: Partial<Parameters<typeof reserveRecommendationOffer>[2]> = {}) => ({
  selectedRoute: 'RECOVER',
  selectedModule: 'energy_delta',
  routingOutcome: 'selected',
  reasonCodes: ['recovery_foundation_low'],
  confidence: 'medium',
  consideredModules: ['energy_delta'],
  bandwidthBand: 'low_bandwidth',
  sourceSurface: 'pulse_home_recommendation' as const,
  isExplicitRequest: false,
  recentWindowMs: 6 * 60 * 60 * 1000,
  sessionOfferLimit: 3,
  nowMs: Date.now(),
  ...overrides,
});

describe('Firestore emulator: reserveRecommendationOffer concurrency', () => {
  it('two simultaneous first-time requests for the same module, budget available, produce exactly one reserved decision', async () => {
    const uid = 'emu_concurrent_2';
    const input = baseOffer();
    const [a, b] = await Promise.all([
      reserveRecommendationOffer(db, uid, input),
      reserveRecommendationOffer(db, uid, input),
    ]);
    const kinds = [a.kind, b.kind].sort();
    expect(kinds).toEqual(['reserved', 'reused']);
    const decisionIds = [a, b].filter((r) => r.kind === 'reserved' || r.kind === 'reused').map((r: any) => r.decisionId);
    expect(decisionIds[0]).toBe(decisionIds[1]);

    const decisionsSnap = await db.collection(`users/${uid}/recovery_routing_decisions`).get();
    expect(decisionsSnap.docs).toHaveLength(1);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(1);
  });

  it('five simultaneous first-time requests for the same module produce exactly one reserved decision', async () => {
    const uid = 'emu_concurrent_5';
    const input = baseOffer();
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveRecommendationOffer(db, uid, input)));
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'reused')).toHaveLength(4);
    const decisionsSnap = await db.collection(`users/${uid}/recovery_routing_decisions`).get();
    expect(decisionsSnap.docs).toHaveLength(1);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(1);
  });

  it('ten simultaneous first-time requests for the same module produce exactly one reserved decision', async () => {
    const uid = 'emu_concurrent_10';
    const input = baseOffer();
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveRecommendationOffer(db, uid, input)));
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'reused')).toHaveLength(9);
    const decisionsSnap = await db.collection(`users/${uid}/recovery_routing_decisions`).get();
    expect(decisionsSnap.docs).toHaveLength(1);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(1);
  });

  it('cross-surface: Pulse and the Hub racing the same module simultaneously still produce exactly one decision', async () => {
    const uid = 'emu_cross_surface';
    const [pulse, hub] = await Promise.all([
      reserveRecommendationOffer(db, uid, baseOffer({ sourceSurface: 'pulse_home_recommendation' })),
      reserveRecommendationOffer(db, uid, baseOffer({ sourceSurface: 'recovery_hub' })),
    ]);
    const kinds = [pulse.kind, hub.kind].sort();
    expect(kinds).toEqual(['reserved', 'reused']);
    const decisionsSnap = await db.collection(`users/${uid}/recovery_routing_decisions`).get();
    expect(decisionsSnap.docs).toHaveLength(1);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(1);
  });

  it('concurrent requests for genuinely different modules never exceed the shared budget ceiling', async () => {
    const uid = 'emu_budget_ceiling';
    // sessionOfferLimit: 3, five *different* modules racing simultaneously -
    // dedup cannot collapse these (different selectedModule each), so this
    // isolates the budget-ceiling race specifically.
    const modules = ['energy_delta', 'guided_reset', 'one_less_thing', 'capacity_firewall', 'my_patterns'];
    const results = await Promise.all(
      modules.map((m) => reserveRecommendationOffer(db, uid, baseOffer({ selectedModule: m, sessionOfferLimit: 3 }))),
    );
    const reserved = results.filter((r) => r.kind === 'reserved');
    const exhausted = results.filter((r) => r.kind === 'budget_exhausted');
    expect(reserved).toHaveLength(3);
    expect(exhausted).toHaveLength(2);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(3);
    const decisionsSnap = await db.collection(`users/${uid}/recovery_routing_decisions`).get();
    expect(decisionsSnap.docs).toHaveLength(3);
  });

  it('one remaining slot: concurrent requests for different modules let exactly one through', async () => {
    const uid = 'emu_one_slot_left';
    await db.collection(`users/${uid}/recovery_routing`).doc('session_state').set({
      day: todayUtcDateKey(), recommendationsOffered: 2, recommendationsDeclined: 0,
      interventionsStarted: 0, interventionsCompleted: 0, interventionsAbandoned: 0,
    });
    const results = await Promise.all([
      reserveRecommendationOffer(db, uid, baseOffer({ selectedModule: 'energy_delta', sessionOfferLimit: 3 })),
      reserveRecommendationOffer(db, uid, baseOffer({ selectedModule: 'guided_reset', sessionOfferLimit: 3 })),
      reserveRecommendationOffer(db, uid, baseOffer({ selectedModule: 'one_less_thing', sessionOfferLimit: 3 })),
    ]);
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'budget_exhausted')).toHaveLength(2);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(3);
  });

  it('account isolation: two accounts racing simultaneously never affect each other\'s budget or decisions', async () => {
    const uidA = 'emu_isolation_a';
    const uidB = 'emu_isolation_b';
    const input = baseOffer();
    await Promise.all([
      ...Array.from({ length: 5 }, () => reserveRecommendationOffer(db, uidA, input)),
      ...Array.from({ length: 5 }, () => reserveRecommendationOffer(db, uidB, input)),
    ]);
    const sessionA = await db.collection(`users/${uidA}/recovery_routing`).doc('session_state').get();
    const sessionB = await db.collection(`users/${uidB}/recovery_routing`).doc('session_state').get();
    expect(sessionA.data()!.recommendationsOffered).toBe(1);
    expect(sessionB.data()!.recommendationsOffered).toBe(1);
  });

  it('an explicit request bypasses the budget ceiling but still deduplicates against an open offer', async () => {
    const uid = 'emu_explicit_bypass';
    await db.collection(`users/${uid}/recovery_routing`).doc('session_state').set({
      day: todayUtcDateKey(), recommendationsOffered: 3, recommendationsDeclined: 0,
      interventionsStarted: 0, interventionsCompleted: 0, interventionsAbandoned: 0,
    });
    const explicitInput = baseOffer({ isExplicitRequest: true, sessionOfferLimit: 3 });
    const first = await reserveRecommendationOffer(db, uid, explicitInput);
    expect(first.kind).toBe('reserved');
    const [second, third] = await Promise.all([
      reserveRecommendationOffer(db, uid, explicitInput),
      reserveRecommendationOffer(db, uid, explicitInput),
    ]);
    expect(second.kind).toBe('reused');
    expect(third.kind).toBe('reused');
    const decisionsSnap = await db.collection(`users/${uid}/recovery_routing_decisions`).get();
    expect(decisionsSnap.docs).toHaveLength(1);
  });

  it('a stale previous-day session_state resets rather than carrying the old count forward', async () => {
    const uid = 'emu_daily_reset';
    await db.collection(`users/${uid}/recovery_routing`).doc('session_state').set({
      day: '2000-01-01', recommendationsOffered: 99, recommendationsDeclined: 0,
      interventionsStarted: 0, interventionsCompleted: 0, interventionsAbandoned: 0,
    });
    const result = await reserveRecommendationOffer(db, uid, baseOffer());
    expect(result.kind).toBe('reserved');
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(1);
    expect(sessionSnap.data()!.day).not.toBe('2000-01-01');
  });
});

describe('Firestore emulator: null-module (needs_clarification) concurrency', () => {
  it('ten simultaneous clarification requests produce exactly one counted, reused decision', async () => {
    const uid = 'emu_clarification_concurrent';
    const input = baseOffer({ selectedModule: null, routingOutcome: 'needs_clarification', selectedRoute: 'NONE' });
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveRecommendationOffer(db, uid, input)));
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'reused')).toHaveLength(9);
    const decisionsSnap = await db.collection(`users/${uid}/recovery_routing_decisions`).get();
    expect(decisionsSnap.docs).toHaveLength(1);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(1);
  });

  it('a null-module clarification request and a real-module offer never collide with each other', async () => {
    const uid = 'emu_clarification_vs_module';
    const [clarification, moduleOffer] = await Promise.all([
      reserveRecommendationOffer(db, uid, baseOffer({ selectedModule: null, routingOutcome: 'needs_clarification', selectedRoute: 'NONE' })),
      reserveRecommendationOffer(db, uid, baseOffer({ selectedModule: 'energy_delta' })),
    ]);
    expect(clarification.kind).toBe('reserved');
    expect(moduleOffer.kind).toBe('reserved');
    const decisionsSnap = await db.collection(`users/${uid}/recovery_routing_decisions`).get();
    expect(decisionsSnap.docs).toHaveLength(2);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.recommendationsOffered).toBe(2);
  });
});

describe('Firestore emulator: resolveStaleInterventionAbandonment concurrency', () => {
  it('concurrent abandonment resolution of the same stale decision counts it exactly once', async () => {
    const uid = 'emu_abandon_concurrent';
    const decisionRef = db.collection(`users/${uid}/recovery_routing_decisions`).doc();
    await decisionRef.set({
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      selectedModule: 'guided_reset',
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => resolveStaleInterventionAbandonment(db, uid, decisionRef.id, Date.now())),
    );
    expect(results.filter((r) => r.kind === 'abandoned')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'already_resolved')).toHaveLength(4);
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.data()!.interventionsAbandoned).toBe(1);
    const decisionSnap = await decisionRef.get();
    expect(decisionSnap.data()!.outcome).toBe('abandoned');
  });

  it('an unknown decision id resolves as not_found without touching the session counter', async () => {
    const uid = 'emu_abandon_missing';
    const result = await resolveStaleInterventionAbandonment(db, uid, 'does-not-exist', Date.now());
    expect(result.kind).toBe('not_found');
    const sessionSnap = await db.collection(`users/${uid}/recovery_routing`).doc('session_state').get();
    expect(sessionSnap.exists).toBe(false);
  });
});
