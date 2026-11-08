// Dedicated adaptive-consent rules suite. Requires an emulator; never touches production.
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const suite = host ? describe : describe.skip;
let env: RulesTestEnvironment;

const permissions = {
  allowCheckins: true, allowEnergyBudgets: true, allowMoodPulses: true,
  allowBodyCheckins: true, allowWins: true, allowWeeklyReviews: true,
  allowBoundaryScripts: true, allowGoals: true, allowRecoveryDebt: true,
  allowRecoveryVelocity: true, allowEnergyTrend: true, allowMoodTrend: true,
  allowNovaMemory: true, allowNovaUseSavedMemories: true,
  updatedAt: '2026-11-08T00:00:00.000Z',
};
suite('adaptive intelligence opt-in and owner-only Firestore permissions', () => {
  beforeAll(async () => {
    const [hostname = '127.0.0.1', port = '8080'] = host!.split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-nhei-multilingual-consent',
      firestore: { host: hostname, port: Number(port), rules: readFileSync('firestore.rules', 'utf8') },
    });
  });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => { await env.clearFirestore(); });

  it('allows owner to set or withdraw explicit adaptive consent', async () => {
    const ref = env.authenticatedContext('alice').firestore().doc('users/alice/nova_permissions/current');
    await assertSucceeds(ref.set({ ...permissions, allowAdaptiveIntelligence: false }));
    await assertSucceeds(ref.update({ allowAdaptiveIntelligence: true }));
    await assertSucceeds(ref.update({ allowAdaptiveIntelligence: false }));
  });

  it('requires a Boolean and bounded known module preferences', async () => {
    const ref = env.authenticatedContext('alice').firestore().doc('users/alice/nova_permissions/current');
    await assertSucceeds(ref.set({ ...permissions, allowAdaptiveIntelligence: true }));
    await assertSucceeds(ref.update({ adaptivePreferredModules: ['guided_reset', 'recovery_fuel'] }));
    await assertFails(ref.update({ allowAdaptiveIntelligence: 'yes' }));
    await assertFails(ref.update({ adaptiveAvoidedModules: ['a made-up tool'] }));
    await assertFails(ref.update({ adaptivePreferredModules: Array(15).fill('guided_reset') }));
  });

  it('does not allow another account to read or change adaptive permissions', async () => {
    const alice = env.authenticatedContext('alice').firestore().doc('users/alice/nova_permissions/current');
    const bob = env.authenticatedContext('bob').firestore().doc('users/alice/nova_permissions/current');
    await assertSucceeds(alice.set({ ...permissions, allowAdaptiveIntelligence: true }));
    await assertFails(bob.get());
    await assertFails(bob.update({ allowAdaptiveIntelligence: false }));
  });
});
