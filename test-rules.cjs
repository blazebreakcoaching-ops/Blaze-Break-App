const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');

async function runTests() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'blaze-break-test',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync('firestore.rules', 'utf8')
    }
  });

  console.log("Running Security Rules Tests...");

  await testEnv.clearFirestore();

  // 1. Authenticated user A reads their own profile
  const userA = testEnv.authenticatedContext('userA');
  await assertSucceeds(userA.firestore().collection('users').doc('userA').get());

  // 2. Authenticated user A updates permitted own UI preferences
  await assertSucceeds(userA.firestore().collection('users').doc('userA').collection('preferences').doc('ui').set({
    themePreference: 'dark',
    novaTone: 'direct'
  }));

  // 3. Authenticated user A reads their own entitlement status
  await assertSucceeds(userA.firestore().collection('users').doc('userA').collection('entitlements').doc('status').get());

  // 4. Authenticated user reads approved public feature flags
  await assertSucceeds(userA.firestore().collection('public_feature_flags').doc('secure_account_foundation_test_enabled').get());

  console.log("Testing Phase 2B success scenarios...");

  const checkinRef = userA.firestore().collection('users').doc('userA').collection('checkins').doc('c1');
  const moodRef = userA.firestore().collection('users').doc('userA').collection('mood_pulses').doc('m1');
  const bodyRef = userA.firestore().collection('users').doc('userA').collection('body_checkins').doc('b1');
  const winRef = userA.firestore().collection('users').doc('userA').collection('wins').doc('w1');
  const reviewRef = userA.firestore().collection('users').doc('userA').collection('weekly_reviews').doc('r1');
  const scriptRef = userA.firestore().collection('users').doc('userA').collection('boundary_scripts').doc('s1');
  const goalRef = userA.firestore().collection('users').doc('userA').collection('goals').doc('g1');
  const permRef = userA.firestore().collection('users').doc('userA').collection('nova_permissions').doc('current');

  // * user A creates own check-in with valid fields.
  await assertSucceeds(checkinRef.set({ createdAt: '2025', updatedAt: '2025', energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user', note: 'test' }));
  // * user A reads own check-in.
  await assertSucceeds(checkinRef.get());
  // * user A updates allowed own check-in field.
  await assertSucceeds(checkinRef.update({ updatedAt: '2026', energyLevel: 6 }));
  // * user A deletes own check-in.
  await assertSucceeds(checkinRef.delete());

  // * user A creates own mood pulse with valid enum and intensity.
  await assertSucceeds(moodRef.set({ createdAt: '2025', updatedAt: '2025', moodLabel: 'calm', intensity: 5, source: 'user' }));

  // * user A creates own body check-in with approved signals only.
  await assertSucceeds(bodyRef.set({ createdAt: '2025', updatedAt: '2025', signals: ['jaw_tension', 'fatigue'], source: 'user' }));

  // * user A creates own win.
  await assertSucceeds(winRef.set({ createdAt: '2025', updatedAt: '2025', title: 'Win', content: 'Did it', category: 'boundary' }));

  // * user A creates own weekly review.
  await assertSucceeds(reviewRef.set({ createdAt: '2025', updatedAt: '2025', weekStart: 'Mon', weekEnd: 'Sun', helped: 'Rest', drained: 'Work', nextSmallStep: 'Sleep' }));

  // * user A creates own boundary script.
  await assertSucceeds(scriptRef.set({ createdAt: '2025', updatedAt: '2025', title: 'Script', scenarioType: 'workload', scriptText: 'No', status: 'draft' }));

  // * user A creates own goal.
  await assertSucceeds(goalRef.set({ createdAt: '2025', updatedAt: '2025', title: 'Goal', status: 'active', category: 'sleep' }));

  // * user A updates own nova_permissions/current.
  await assertSucceeds(permRef.set({
    allowCheckins: true,
    allowEnergyBudgets: true,
    allowMoodPulses: true,
    allowBodyCheckins: true,
    allowWins: true,
    allowWeeklyReviews: true,
    allowBoundaryScripts: true,
    allowGoals: true,
    allowRecoveryDebt: true,
    allowRecoveryVelocity: true,
    allowEnergyTrend: true,
    allowMoodTrend: true
  }));

  // Failures:

  const budgetRef = userA.firestore().collection('users').doc('userA').collection('energy_budgets').doc('b1');
  const fingerprintRef = userA.firestore().collection('users').doc('userA').collection('recovery').doc('fingerprint');

  await assertSucceeds(budgetRef.set({ createdAt: '2025', updatedAt: '2025', periodType: 'day', totalCapacity: 100, allocatedCapacity: 50, remainingCapacity: 50, categories: ['work'] }));
  await assertSucceeds(budgetRef.get());
  await assertSucceeds(budgetRef.update({ updatedAt: '2026' }));
  await assertSucceeds(budgetRef.delete());

  await assertSucceeds(fingerprintRef.set({ archetype: 'High-Functioning Exhausted', identifiedAt: '2025', version: '1.0', source: 'user' }));
  await assertSucceeds(fingerprintRef.get());
  await assertSucceeds(fingerprintRef.delete());

  console.log("Testing failure scenarios...");

  // 1. Unauthenticated user reads any private user profile
  const unauth = testEnv.unauthenticatedContext();
  await assertFails(unauth.firestore().collection('users').doc('userA').get());

  // 2. User A reads user B profile
  await assertFails(userA.firestore().collection('users').doc('userB').get());

  // 3. User A writes user B profile
  await assertFails(userA.firestore().collection('users').doc('userB').set({ displayName: 'Hacked' }));

  // 4. User A adds protected fields (role) to their editable profile
  await assertFails(userA.firestore().collection('users').doc('userA').set({
    displayName: 'My Name',
    role: 'manager',
    createdAt: '2025-01-01'
  }));

  // 5. User A writes entitlement status
  await assertFails(userA.firestore().collection('users').doc('userA').collection('entitlements').doc('status').set({ role: 'manager' }));

  // 6. User A edits public feature flags
  await assertFails(userA.firestore().collection('public_feature_flags').doc('some_flag').set({ enabled: true }));

  console.log("Testing Phase 2B failure scenarios...");

  const userBCheckinRef = userA.firestore().collection('users').doc('userB').collection('checkins').doc('c1');
  const userBMoodRef = userA.firestore().collection('users').doc('userB').collection('mood_pulses').doc('m1');

  // * unauthenticated user accesses any private recovery record.
  await assertFails(unauth.firestore().collection('users').doc('userA').collection('checkins').doc('c1').get());

  // * user A reads user B check-in.
  await assertFails(userBCheckinRef.get());

  // * user A writes user B mood pulse.
  await assertFails(userBMoodRef.set({ createdAt: '2025', updatedAt: '2025', moodLabel: 'calm', intensity: 5, source: 'user' }));

  // * user A writes unknown field hackData.
  await assertFails(checkinRef.set({ createdAt: '2025', updatedAt: '2025', energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user', hackData: true }));

  // * user A writes role or subscriptionLevel inside recovery record.
  await assertFails(checkinRef.set({ createdAt: '2025', updatedAt: '2025', energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user', role: 'admin' }));

  // * user A writes mood intensity 14.
  await assertFails(moodRef.set({ createdAt: '2025', updatedAt: '2025', moodLabel: 'calm', intensity: 14, source: 'user' }));

  // * user A writes body signal fake_hrv.
  await assertFails(bodyRef.set({ createdAt: '2025', updatedAt: '2025', signals: ['fake_hrv'], source: 'user' }));

  // * user A writes scriptText over max length.
  await assertFails(scriptRef.set({ createdAt: '2025', updatedAt: '2025', title: 'Script', scenarioType: 'workload', scriptText: 'a'.repeat(501), status: 'draft' }));

  // * user A changes createdAt after creation.
  await assertSucceeds(checkinRef.set({ createdAt: '2025', updatedAt: '2025', energyLevel: 5, focusLevel: 5, detachmentLevel: 5, stressLoad: 5, source: 'user' }));
  await assertFails(checkinRef.update({ createdAt: '2026' }));

  // * user A writes recovery_debt or recovery_velocity path.
  await assertFails(userA.firestore().collection('users').doc('userA').collection('recovery_debt').doc('1').set({ value: 1 }));
  await assertFails(userA.firestore().collection('users').doc('userA').collection('recovery_velocity').doc('1').set({ value: 1 }));

  // * user A writes trigger_journal path.
  await assertFails(userA.firestore().collection('users').doc('userA').collection('trigger_journal').doc('1').set({ value: 1 }));

  // * user A writes nutrition_recovery_logs path.
  await assertFails(userA.firestore().collection('users').doc('userA').collection('nutrition_recovery_logs').doc('1').set({ value: 1 }));

  // * user A writes Guardian/Ally/Organisation/Payment paths.
  await assertFails(userA.firestore().collection('users').doc('userA').collection('guardians').doc('1').set({ value: 1 }));

  // ---- DERIVED SUMMARIES SECURITY RULES TESTS ----
  // * user A reads their own derived summary
  const derivedDebtRef = userA.firestore().collection('users').doc('userA').collection('derived').doc('recovery_debt');
  await assertSucceeds(derivedDebtRef.get());

  // * user A cannot write/create derived summary
  await assertFails(derivedDebtRef.set({
    type: 'recovery_debt',
    status: 'available',
    value: 15,
    formulaVersion: 'rd_v1_nonclinical',
    sourceCount: 5,
    calculatedAt: '2026-06-01'
  }));

  // * user A cannot update/modify derived summary
  await assertFails(derivedDebtRef.update({
    formulaVersion: 'hacked_version'
  }));

  // * user A cannot delete derived summary
  await assertFails(derivedDebtRef.delete());

  // * user A cannot read user B's derived summary
  const userBDerivedRef = userA.firestore().collection('users').doc('userB').collection('derived').doc('recovery_debt');
  await assertFails(userBDerivedRef.get());

  // * unauthenticated user cannot read derived summary
  const unauthDerivedRef = unauth.firestore().collection('users').doc('userA').collection('derived').doc('recovery_debt');
  await assertFails(unauthDerivedRef.get());

  // ---- PHASE 6B: NOVA NUDGES TESTS ----
  const nudgePrefsRef = userA.firestore().collection('users').doc('userA').collection('preferences').doc('notifications');
  const nudgeHistoryRef = userA.firestore().collection('users').doc('userA').collection('nudge_history').doc('n1');

  // * user A writes valid nudge preferences
  await assertSucceeds(nudgePrefsRef.set({
    notificationsEnabled: true,
    nudgeFrequency: 'low',
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    allowedNudgeCategories: ['check_in_reminder', 'recovery_action_reminder'],
    maxNudgesPerDay: 2,
    maxNudgesPerWeek: 10,
    weekendNudgesEnabled: false,
    updatedAt: '2026-06-01'
  }));

  // * user A updates nudge preferences with invalid types
  await assertFails(nudgePrefsRef.update({
    nudgeFrequency: 'super_high'
  }));

  // * user A writes valid nudge history
  await assertSucceeds(nudgeHistoryRef.set({
    category: 'check_in_reminder',
    message: 'Test nudge',
    createdAt: '2026-06-01',
    shownAt: '2026-06-01',
    status: 'shown',
    source: 'in_app_nova',
    updatedAt: '2026-06-01'
  }));

  // * user A writes invalid nudge history (wrong source)
  await assertFails(userA.firestore().collection('users').doc('userA').collection('nudge_history').doc('n2').set({
    category: 'check_in_reminder',
    message: 'Test nudge',
    createdAt: '2026-06-01',
    status: 'shown',
    source: 'push_notification',
    updatedAt: '2026-06-01'
  }));

  // * user A reads own nudge history
  await assertSucceeds(nudgeHistoryRef.get());

  // * user A reads user B's nudge history
  await assertFails(userA.firestore().collection('users').doc('userB').collection('nudge_history').doc('n1').get());

  await assertFails(budgetRef.set({ createdAt: '2025', updatedAt: '2025', periodType: 'day', totalCapacity: 101, allocatedCapacity: 50, remainingCapacity: 50, categories: ['work'] })); // over 100
  await assertFails(fingerprintRef.set({ archetype: 'Crisis Sprinter', identifiedAt: '2025', version: '1.0', source: 'user' })); // Parked archetype

  // nova_memories - was previously "allow read, write: if isOwner(uid)"
  // with no field validation at all. These cover the tightened rule,
  // matching the exact 7-field shape nova-brain.ts's persistMemory
  // always writes.
  const novaMemRef = userA.firestore().collection('users').doc('userA').collection('nova_memories').doc('m1');

  // * user A writes a valid memory
  await assertSucceeds(novaMemRef.set({
    type: 'preference',
    content: 'Prefers ending meetings 5 minutes early',
    source: 'Nova Conversation',
    confidence: 'medium',
    createdAt: '2026-06-01',
    updatedAt: '2026-06-01',
    canEdit: true
  }));

  // * user A writes a memory with an extra, unexpected field
  await assertFails(novaMemRef.set({
    type: 'preference', content: 'x', source: 'x', confidence: 'medium',
    createdAt: '2026-06-01', updatedAt: '2026-06-01', canEdit: true,
    unexpectedField: 'should not be allowed'
  }));

  // * user A writes a memory missing a required field (no source)
  await assertFails(novaMemRef.set({
    type: 'preference', content: 'x', confidence: 'medium',
    createdAt: '2026-06-01', updatedAt: '2026-06-01', canEdit: true
  }));

  // * user A writes a memory with a hallucinated/invalid type
  await assertFails(novaMemRef.set({
    type: 'goal', content: 'x', source: 'x', confidence: 'medium',
    createdAt: '2026-06-01', updatedAt: '2026-06-01', canEdit: true
  }));

  // * user A writes a memory with content over the 1000-char cap
  await assertFails(novaMemRef.set({
    type: 'preference', content: 'x'.repeat(1001), source: 'x', confidence: 'medium',
    createdAt: '2026-06-01', updatedAt: '2026-06-01', canEdit: true
  }));

  // * user A writes a memory with an invalid confidence value
  await assertFails(novaMemRef.set({
    type: 'preference', content: 'x', source: 'x', confidence: 'certain',
    createdAt: '2026-06-01', updatedAt: '2026-06-01', canEdit: true
  }));

  // * user A writes a memory with canEdit as a non-boolean
  await assertFails(novaMemRef.set({
    type: 'preference', content: 'x', source: 'x', confidence: 'medium',
    createdAt: '2026-06-01', updatedAt: '2026-06-01', canEdit: 'true'
  }));

  // * user A cannot read user B's nova_memories
  await assertFails(userA.firestore().collection('users').doc('userB').collection('nova_memories').doc('m1').get());

  // * user A cannot write to user B's nova_memories
  await assertFails(userA.firestore().collection('users').doc('userB').collection('nova_memories').doc('m1').set({
    type: 'preference', content: 'x', source: 'x', confidence: 'medium',
    createdAt: '2026-06-01', updatedAt: '2026-06-01', canEdit: true
  }));

  console.log("All rule tests passed successfully!");
  await testEnv.cleanup();
}

runTests().catch(console.error);
