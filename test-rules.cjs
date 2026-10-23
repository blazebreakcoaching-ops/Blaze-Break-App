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

  // * user A updates own nova_permissions/current. allowNovaMemory/
  // allowNovaUseSavedMemories are also hasAll-required - this assertion was
  // stale against that (missing both), which would have made every
  // "succeeds" case here a false negative for the exact bug that turned
  // out to make this doc uncreatable in the real app (see firestore.rules'
  // comment on this match block).
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
    allowMoodTrend: true,
    allowNovaMemory: true,
    allowNovaUseSavedMemories: true
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

  // weekly_habit_cycles - previously had NO rule at all (silently
  // non-functional in production). Confirms the new rule actually lets
  // the real feature work, not just that it blocks bad writes.
  const habitCycleRef = userA.firestore().collection('users').doc('userA').collection('weekly_habit_cycles').doc('2026-W06');

  // * user A creates this week's cycle.
  await assertSucceeds(habitCycleRef.set({
    weekId: '2026-W06',
    startedAt: '2026-02-02T00:00:00.000Z',
    goals: [{ id: 'focus', category: 'Focus', label: 'Complete 3 Deep Work Focus Zone Blocks', target: 3, progress: 0, xpAwarded: false }]
  }));

  // * user A reads their own cycle.
  await assertSucceeds(habitCycleRef.get());

  // * user A updates progress (a full overwrite, matching persist()).
  await assertSucceeds(habitCycleRef.set({
    weekId: '2026-W06',
    startedAt: '2026-02-02T00:00:00.000Z',
    goals: [{ id: 'focus', category: 'Focus', label: 'Complete 3 Deep Work Focus Zone Blocks', target: 3, progress: 1, xpAwarded: false }]
  }));

  // * user A writes a malformed weekId.
  await assertFails(habitCycleRef.set({
    weekId: 'not-a-week',
    startedAt: '2026-02-02T00:00:00.000Z',
    goals: []
  }));

  // * user A writes an extra, unexpected field.
  await assertFails(habitCycleRef.set({
    weekId: '2026-W06',
    startedAt: '2026-02-02T00:00:00.000Z',
    goals: [],
    hackData: true
  }));

  // * user A writes goals as a non-list.
  await assertFails(habitCycleRef.set({
    weekId: '2026-W06',
    startedAt: '2026-02-02T00:00:00.000Z',
    goals: 'not a list'
  }));

  // * user A cannot read user B's cycle.
  await assertFails(userA.firestore().collection('users').doc('userB').collection('weekly_habit_cycles').doc('2026-W06').get());

  // anxiety_reset_events - server-write-only (no client writer exists;
  // server.ts's POST /api/anxiety-reset is the only legitimate writer).
  const anxietyEventRef = userA.firestore().collection('anxiety_reset_events').doc('e1');

  // * user A reads their own anxiety reset event.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('anxiety_reset_events').doc('e1').set({
      userId: 'userA', mode: 'guided_breath', createdAt: '2026-06-01'
    });
  });
  await assertSucceeds(anxietyEventRef.get());

  // * user A cannot create an anxiety reset event directly (client writes
  //   are entirely server-mediated now, not just field-validated).
  await assertFails(userA.firestore().collection('anxiety_reset_events').doc('e2').set({
    userId: 'userA', mode: 'guided_breath', createdAt: '2026-06-01'
  }));

  // * user A cannot update or delete an existing anxiety reset event either.
  await assertFails(anxietyEventRef.update({ mode: 'hacked' }));
  await assertFails(anxietyEventRef.delete());

  // * user A cannot read user B's anxiety reset event.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('anxiety_reset_events').doc('eB').set({
      userId: 'userB', mode: 'guided_breath', createdAt: '2026-06-01'
    });
  });
  await assertFails(userA.firestore().collection('anxiety_reset_events').doc('eB').get());

  console.log("Testing NHEI Phase 2 rules...");

  // nhei_evidence / nhei_evidence/{id}/corrections / nhei_temporal_relations
  // are server (Admin SDK) only - "if false" for every operation,
  // including read, for the owner themselves. nhei-persistence-service.ts
  // is the only code that ever touches these paths, and it enforces
  // consent server-side before any Firestore call - there is no client
  // write path at all, so a "trusted"/"verified" sourceType can never be
  // created by a client simply naming it.
  const nheiEvidenceRef = userA.firestore().collection('users').doc('userA').collection('nhei_evidence').doc('ev1');

  // * user A cannot read their own NHEI evidence directly.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc('userA').collection('nhei_evidence').doc('ev1').set({
      id: 'ev1', sourceType: 'USER_REPORTED_EVENT', timeUncertainty: 'unknown',
      evidenceQuality: 'medium', confirmationState: 'not_applicable',
      selfSystems: [], dimensions: [], relatedEventIds: [], sourceRef: null,
      createdAt: '2026-06-01', updatedAt: '2026-06-01',
    });
  });
  await assertFails(nheiEvidenceRef.get());

  // * user A cannot create NHEI evidence directly, with a benign sourceType...
  await assertFails(userA.firestore().collection('users').doc('userA').collection('nhei_evidence').doc('ev2').set({
    id: 'ev2', sourceType: 'USER_REPORTED_EVENT', timeUncertainty: 'unknown',
    evidenceQuality: 'medium', confirmationState: 'not_applicable',
    selfSystems: [], dimensions: [], relatedEventIds: [],
  }));

  // * ...or with a "trusted" sourceType a client should never be able to
  //   self-assert - proving the restriction holds at the data layer, not
  //   just via application-code validation.
  await assertFails(userA.firestore().collection('users').doc('userA').collection('nhei_evidence').doc('ev3').set({
    id: 'ev3', sourceType: 'EXTERNALLY_VERIFIED_EVENT', timeUncertainty: 'unknown',
    evidenceQuality: 'high', confirmationState: 'user_confirmed',
    selfSystems: [], dimensions: [], relatedEventIds: [],
  }));

  // * user A cannot update or delete an existing NHEI evidence record either.
  await assertFails(nheiEvidenceRef.update({ confirmationState: 'user_confirmed' }));
  await assertFails(nheiEvidenceRef.delete());

  // * user A cannot read user B's NHEI evidence.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc('userB').collection('nhei_evidence').doc('evB').set({
      id: 'evB', sourceType: 'USER_REPORTED_EVENT', timeUncertainty: 'unknown',
      evidenceQuality: 'medium', confirmationState: 'not_applicable',
      selfSystems: [], dimensions: [], relatedEventIds: [], sourceRef: null,
      createdAt: '2026-06-01', updatedAt: '2026-06-01',
    });
  });
  await assertFails(userA.firestore().collection('users').doc('userB').collection('nhei_evidence').doc('evB').get());

  // * the nested corrections subcollection is equally locked down.
  const correctionRef = userA.firestore().collection('users').doc('userA')
    .collection('nhei_evidence').doc('ev1').collection('corrections').doc('c1');
  await assertFails(correctionRef.set({ previousConfirmationState: null, newConfirmationState: 'user_disputed', changedAt: '2026-06-01' }));
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc('userA').collection('nhei_evidence').doc('ev1')
      .collection('corrections').doc('c1').set({ previousConfirmationState: null, newConfirmationState: 'user_disputed', changedAt: '2026-06-01' });
  });
  await assertFails(correctionRef.get());

  // * nhei_temporal_relations is the same server-only shape.
  const relationRef = userA.firestore().collection('users').doc('userA').collection('nhei_temporal_relations').doc('r1');
  await assertFails(relationRef.set({
    fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE',
    interpretationConfidence: 'high', derivedBy: 'caller_asserted', rationale: 'caller_supplied', createdAt: '2026-06-01',
  }));
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc('userA').collection('nhei_temporal_relations').doc('r1').set({
      fromEventId: 'a', toEventId: 'b', relationType: 'USER_ATTRIBUTED_INFLUENCE',
      interpretationConfidence: 'high', derivedBy: 'caller_asserted', rationale: 'caller_supplied', createdAt: '2026-06-01',
    });
  });
  await assertFails(relationRef.get());

  // * the three new NHEI consent fields on nova_permissions/current
  //   behave like every other optional field there: owner-writable,
  //   bool-only, and additive (not required by hasAll) so an existing
  //   write that has never heard of NHEI still succeeds.
  const nheiPermRef = userA.firestore().collection('users').doc('userA').collection('nova_permissions').doc('current');
  await assertSucceeds(nheiPermRef.set({
    allowCheckins: true, allowEnergyBudgets: true, allowMoodPulses: true, allowBodyCheckins: true,
    allowWins: true, allowWeeklyReviews: true, allowBoundaryScripts: true, allowGoals: true,
    allowRecoveryDebt: true, allowRecoveryVelocity: true, allowEnergyTrend: true, allowMoodTrend: true,
    allowNovaMemory: true, allowNovaUseSavedMemories: true,
    allowNheiReflectionStorage: true, allowNheiLongitudinalTracking: false, allowNheiRoutingInsights: false,
  }));
  await assertFails(nheiPermRef.set({
    allowCheckins: true, allowEnergyBudgets: true, allowMoodPulses: true, allowBodyCheckins: true,
    allowWins: true, allowWeeklyReviews: true, allowBoundaryScripts: true, allowGoals: true,
    allowRecoveryDebt: true, allowRecoveryVelocity: true, allowEnergyTrend: true, allowMoodTrend: true,
    allowNovaMemory: true, allowNovaUseSavedMemories: true,
    allowNheiReflectionStorage: 'yes', // wrong type - must fail, not coerce
  }));

  // ------------------------------------------------------------------
  // Phase 5F, directive §3: real Firestore-emulator rules tests for the
  // server-only secret/action-record collections. Each gets the full
  // three-identity sweep (unauthenticated, an unrelated authenticated
  // user, and the document's own owner) PLUS a proof that the real
  // server's own access path - the Admin SDK, via withSecurityRulesDisabled
  // - still works, since these rules exist specifically to block the
  // CLIENT SDK, never the Admin SDK server.ts actually uses.
  console.log("Testing Phase 5F secret/action-record rules...");

  const userB = testEnv.authenticatedContext('userB');

  async function assertDeniedToEveryoneButAdmin(path, sampleData) {
    const ownerRef = userA.firestore().doc(path);
    const otherRef = userB.firestore().doc(path);
    const unauthRef = unauth.firestore().doc(path);

    // Seed via the Admin SDK first (exactly how the real server writes
    // these) so the read-denial assertions below have a real doc to deny
    // access to, not just an absent one (Firestore denies reads of
    // nonexistent docs too, which would make the assertion meaningless).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(path).set(sampleData);
    });

    await assertFails(ownerRef.get());
    await assertFails(ownerRef.set(sampleData));
    await assertFails(otherRef.get());
    await assertFails(otherRef.set(sampleData));
    await assertFails(unauthRef.get());
    await assertFails(unauthRef.set(sampleData));

    // The real server's own access path must still work - these rules
    // exist to block the client SDK, never the Admin SDK.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await assertSucceeds(ctx.firestore().doc(path).get());
      await assertSucceeds(ctx.firestore().doc(path).set(sampleData));
    });
  }

  // * integration_tokens: raw OAuth access/refresh tokens.
  await assertDeniedToEveryoneButAdmin(
    'users/userA/integration_tokens/slack',
    { accessToken: 'at', refreshToken: 'rt', expiresAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  );

  // * oauth_pkce: a live PKCE code_verifier mid-flow.
  await assertDeniedToEveryoneButAdmin(
    'users/userA/oauth_pkce/google_calendar_actions',
    { codeVerifier: 'verifier-value', createdAt: '2026-01-01T00:00:00.000Z' },
  );

  // * security: the encrypted TOTP secret and hashed recovery codes.
  await assertDeniedToEveryoneButAdmin(
    'users/userA/security/mfa_totp',
    { secretEncrypted: 'enc', enabled: true, enrolledAt: '2026-01-01T00:00:00.000Z', recoveryCodesHashed: [], failedAttempts: 0, lockedUntil: null, updatedAt: '2026-01-01T00:00:00.000Z' },
  );

  // * calendar_protection_proposals: server-authoritative proposal state
  //   (directive's own "secrets AND server-authoritative action records
  //   cannot be modified or accessed directly by ordinary clients").
  await assertDeniedToEveryoneButAdmin(
    'users/userA/calendar_protection_proposals/cpp_test1',
    { proposalId: 'cpp_test1', state: 'awaiting_approval', startIso: '2026-01-01T00:00:00.000Z', endIso: '2026-01-01T01:00:00.000Z', title: 'Protected block', approvalFingerprint: 'fp', failureReason: null, retryCount: 0, approvedAt: null, approvalExpiresAt: null, activeAttemptId: null, externalEventId: null, lastTransitionAt: '2026-01-01T00:00:00.000Z' },
  );

  // * calendar_protection_audit: the append-only audit trail for the above.
  await assertDeniedToEveryoneButAdmin(
    'users/userA/calendar_protection_audit/entry1',
    { proposalId: 'cpp_test1', event: 'prepared', detail: {}, at: '2026-01-01T00:00:00.000Z' },
  );

  // * Calendar action permission (allowCalendarActions, on the shared
  //   nova_permissions/current doc) - explicitly named separately from
  //   the NHEI consent fields above, even though it's the same doc/rule:
  //   owner can set it with the right type, an unrelated user and an
  //   unauthenticated caller cannot read or write it at all, and a wrong
  //   type is rejected rather than coerced.
  const calendarActionsPermRef = userA.firestore().collection('users').doc('userA').collection('nova_permissions').doc('current');
  await assertSucceeds(calendarActionsPermRef.set({
    allowCheckins: true, allowEnergyBudgets: true, allowMoodPulses: true, allowBodyCheckins: true,
    allowWins: true, allowWeeklyReviews: true, allowBoundaryScripts: true, allowGoals: true,
    allowRecoveryDebt: true, allowRecoveryVelocity: true, allowEnergyTrend: true, allowMoodTrend: true,
    allowNovaMemory: true, allowNovaUseSavedMemories: true,
    allowCalendarActions: true, allowCalendarActionsGrantedAt: '2026-01-01T00:00:00.000Z', allowCalendarActionsWithdrawnAt: null,
  }));
  await assertFails(calendarActionsPermRef.set({
    allowCheckins: true, allowEnergyBudgets: true, allowMoodPulses: true, allowBodyCheckins: true,
    allowWins: true, allowWeeklyReviews: true, allowBoundaryScripts: true, allowGoals: true,
    allowRecoveryDebt: true, allowRecoveryVelocity: true, allowEnergyTrend: true, allowMoodTrend: true,
    allowNovaMemory: true, allowNovaUseSavedMemories: true,
    allowCalendarActions: 'yes', // wrong type - must fail, not coerce
  }));
  const otherUserCalendarActionsRef = userB.firestore().collection('users').doc('userA').collection('nova_permissions').doc('current');
  await assertFails(otherUserCalendarActionsRef.get());
  await assertFails(otherUserCalendarActionsRef.set({ allowCalendarActions: true }));
  const unauthCalendarActionsRef = unauth.firestore().collection('users').doc('userA').collection('nova_permissions').doc('current');
  await assertFails(unauthCalendarActionsRef.get());
  await assertFails(unauthCalendarActionsRef.set({ allowCalendarActions: true }));

  console.log("All rule tests passed successfully!");
  await testEnv.cleanup();
}

runTests().catch(console.error);
