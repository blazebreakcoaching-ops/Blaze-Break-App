import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Machine verification for the real Protected Core invariants
// (protected-core.ts's seed set) - the spec's "critical governance rules
// must not exist only as natural-language notes" requirement made real.
// Each describe block below proves ONE invariant's cited evidence still
// holds against the actual source files, not just that the claim was
// once true at the time it was written.
process.env.TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

vi.mock('express-rate-limit', () => ({ default: () => (_req: any, _res: any, next: any) => next() }));
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: vi.fn() }) }));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (t: string) => ({ uid: t, email: `${t}@test.dev` }),
    getUser: async (uid: string) => ({ uid, email: `${uid}@test.dev`, displayName: `Name ${uid}` }),
  }),
}));
vi.mock('firebase-admin/firestore', async () => {
  const fake = await import('./test/fake-firestore');
  return { getFirestore: () => fake.fakeDb, FieldValue: fake.FakeFieldValue };
});
vi.mock('twilio', () => ({ default: () => ({ messages: { create: vi.fn() } }) }));

import request from 'supertest';
import { app } from './server';
import { seedDoc, resetStore } from './test/fake-firestore';
import { buildFinancialRangeEstimate } from './executive-work-design';

const serverSource = readFileSync(join(__dirname, 'server.ts'), 'utf-8');
const entitlementsSource = readFileSync(join(__dirname, 'entitlements.ts'), 'utf-8');
const firestoreRules = readFileSync(join(__dirname, 'firestore.rules'), 'utf-8');

const auth = (uid: string) => ({ Authorization: `Bearer ${uid}` });
beforeEach(() => resetStore());

describe('organisation_privacy_isolation', () => {
  it('firestore.rules grants users/{uid} read only to the owner, with no org-staff carve-out', () => {
    const startIdx = firestoreRules.indexOf('match /users/{uid} {');
    expect(startIdx).toBeGreaterThan(-1);
    // Bounded by the first subcollection match under this doc (e.g.
    // users/{uid}/preferences/...) - everything before that is the
    // top-level users/{uid} doc's own create/read/update rules, not a
    // deeply nested subcollection block a brace-matching regex would
    // otherwise have to parse.
    const nextSubcollection = firestoreRules.indexOf('users/{uid}/', startIdx + 10);
    expect(nextSubcollection).toBeGreaterThan(startIdx);
    const block = firestoreRules.slice(startIdx, nextSubcollection);
    expect(block).toMatch(/allow read: if isOwner\(uid\);/);
    // Nothing in this rule block should grant read access based on an
    // organisation/manager/admin role - that would reintroduce exactly
    // the leak this invariant exists to prevent.
    expect(block).not.toMatch(/organisation_admin|manager|isOrgAdmin|org\.adminUids/);
  });

  it("GET /api/org/:orgId/members returns only safe account fields, never personal recovery content", async () => {
    seedDoc('organisations/org_1', { name: 'Test Org', adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'] });
    seedDoc('organisations/org_1/members/owner_1', { role: 'owner', status: 'active', email: 'owner_1@test.dev' });
    seedDoc('organisations/org_1/members/member_1', { role: 'member', status: 'active', email: 'member_1@test.dev' });

    const res = await request(app).get('/api/org/org_1/members').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.members.length).toBeGreaterThan(0);
    const allowedKeys = new Set(['uid', 'email', 'displayName', 'isAdmin', 'team', 'managesTeams']);
    for (const member of res.body.members) {
      for (const key of Object.keys(member)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    }
  });
});

describe('guardian_alert_explicit_trigger_only', () => {
  it("'guardian_alert' is passed to sendTwilioMessage from exactly one call site", () => {
    const matches = serverSource.match(/sendTwilioMessage\([^)]*'guardian_alert'/g) || [];
    expect(matches).toHaveLength(1);
  });

  it('that one call site sits inside the authenticated POST /api/guardian/alert handler, with uid sourced only from the verified token', () => {
    const routeStart = serverSource.indexOf('app.post("/api/guardian/alert"');
    expect(routeStart).toBeGreaterThan(-1);
    const callSite = serverSource.indexOf("sendTwilioMessage(uid, contact.contactMethod, message, contact.notificationPreference === \"whatsapp\", 'guardian_alert')");
    expect(callSite).toBeGreaterThan(routeStart);
    // Bounded by the start of the NEXT route declaration (app.get/app.post/
    // etc.) after this one - proves the call site is still inside this same
    // handler's body, not some unrelated later route, without guessing a
    // fixed character count for how long a handler "should" be.
    const nextRouteStart = serverSource.slice(routeStart + 10).search(/\bapp\.(get|post|put|delete|patch)\(/);
    expect(nextRouteStart).toBeGreaterThan(-1);
    const nextRouteAbsolute = routeStart + 10 + nextRouteStart;
    expect(callSite).toBeLessThan(nextRouteAbsolute);
    const handlerSlice = serverSource.slice(routeStart, callSite);
    expect(handlerSlice).toMatch(/authenticateFirebaseUser/);
    expect(handlerSlice).toMatch(/requireAuth\(req\)\.uid/);
    expect(handlerSlice).toMatch(/triggerSource: "manual_button"|triggerSource:"manual_button"/);
  });
});

describe('admin_role_grant_requires_platform_owner', () => {
  it('requirePlatformOwner guards both admin-user creation and role-change routes', () => {
    const createRouteStart = serverSource.indexOf('app.post("/api/admin/admin-users"');
    const roleRouteStart = serverSource.indexOf('app.post("/api/admin/admin-users/:uid/role"');
    expect(createRouteStart).toBeGreaterThan(-1);
    expect(roleRouteStart).toBeGreaterThan(-1);
    expect(serverSource.slice(createRouteStart, createRouteStart + 300)).toMatch(/requirePlatformOwner\(req\)/);
    expect(serverSource.slice(roleRouteStart, roleRouteStart + 300)).toMatch(/requirePlatformOwner\(req\)/);
  });

  it('a non-owner cannot create an admin user (behavioural confirmation, not just text)', async () => {
    const res = await request(app).post('/api/admin/admin-users').set(auth('random_person')).send({ email: 'x@y.com', role: 'support_admin', reason: 'test' });
    expect(res.status).toBe(500);
  });
});

describe('admin_audit_log_write_integrity', () => {
  it('firestore.rules denies all client writes to admin_audit_logs', () => {
    const match = firestoreRules.match(/match \/admin_audit_logs\/\{logId\}\s*\{([\s\S]*?)\}/);
    expect(match).toBeTruthy();
    expect(match![1]).toMatch(/allow write: if false;/);
  });

  it('server.ts writes to admin_audit_logs from exactly one place - inside logAdminAction', () => {
    const writeCalls = serverSource.match(/collection\("admin_audit_logs"\)\.add\(/g) || [];
    expect(writeCalls).toHaveLength(1);
    const logAdminActionStart = serverSource.indexOf('const logAdminAction =');
    const writeCallIndex = serverSource.indexOf('collection("admin_audit_logs").add(');
    expect(writeCallIndex).toBeGreaterThan(logAdminActionStart);
    expect(writeCallIndex - logAdminActionStart).toBeLessThan(1000);
  });
});

describe('entitlement_independent_of_feature_flags', () => {
  it('entitlements.ts has zero import statements - no coupling to feature-flag/registry state is even possible', () => {
    const importLines = entitlementsSource.match(/^\s*import .*/gm) || [];
    expect(importLines).toHaveLength(0);
  });
});

describe('private_data_default_deny', () => {
  it('the top-level wildcard default-deny block exists and precedes every specific collection rule', () => {
    const wildcardIndex = firestoreRules.indexOf('match /{document=**}');
    expect(wildcardIndex).toBeGreaterThan(-1);
    const block = firestoreRules.slice(wildcardIndex, wildcardIndex + 150);
    expect(block).toMatch(/allow read, write: if false;/);

    const firstSpecificRule = firestoreRules.indexOf('match /users/{uid}');
    expect(firstSpecificRule).toBeGreaterThan(wildcardIndex);
  });
});

describe('organisation_aggregate_cohort_threshold', () => {
  it('GET /api/org/:orgId/dashboard calls the shared checkCohortSufficiency function rather than its own inline comparison', () => {
    const routeStart = serverSource.indexOf('app.get("/api/org/:orgId/dashboard"');
    expect(routeStart).toBeGreaterThan(-1);
    const nextRouteStart = serverSource.slice(routeStart + 10).search(/\bapp\.(get|post|put|delete|patch)\(/);
    expect(nextRouteStart).toBeGreaterThan(-1);
    const handlerSlice = serverSource.slice(routeStart, routeStart + 10 + nextRouteStart);
    expect(handlerSlice).toMatch(/checkCohortSufficiency\(/);
    expect(handlerSlice).toMatch(/buildLockedAggregateResponse\(/);
    // The old ad hoc inline comparison this migration replaced must not
    // have simply been left in place alongside the new call.
    expect(handlerSlice).not.toMatch(/consentingUids\.length < threshold/);
  });

  it('a cohort below the organisation privacy threshold receives a locked response with no numeric wellbeing figures, never a real aggregate', async () => {
    seedDoc('organisations/org_1', { name: 'Test Org', adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'], privacyThreshold: 5 });
    seedDoc('users/owner_1', { shareAnonymizedDataWithOrg: true });
    seedDoc('users/member_1', { shareAnonymizedDataWithOrg: true });

    const res = await request(app).get('/api/org/org_1/dashboard').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locked: true, cohortSize: 2, threshold: 5 });
    expect(res.body.moodDistribution).toBeUndefined();
    expect(res.body.engagementRate).toBeUndefined();
  });

  it('a cohort meeting the threshold receives the real aggregate, not a locked response', async () => {
    const memberUids = Array.from({ length: 5 }, (_, i) => `member_${i}`);
    seedDoc('organisations/org_1', { name: 'Test Org', adminUids: ['owner_1'], memberUids, privacyThreshold: 5 });
    for (const uid of memberUids) {
      seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
    }

    const res = await request(app).get('/api/org/org_1/dashboard').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(false);
    expect(res.body.cohortSize).toBe(5);
  });

  it('GET /api/org/:orgId/hr-dashboard calls the shared checkCohortSufficiency function rather than its own inline comparison', () => {
    const routeStart = serverSource.indexOf('app.get("/api/org/:orgId/hr-dashboard"');
    expect(routeStart).toBeGreaterThan(-1);
    const nextRouteStart = serverSource.slice(routeStart + 10).search(/\bapp\.(get|post|put|delete|patch)\(/);
    expect(nextRouteStart).toBeGreaterThan(-1);
    const handlerSlice = serverSource.slice(routeStart, routeStart + 10 + nextRouteStart);
    expect(handlerSlice).toMatch(/checkCohortSufficiency\(/);
    expect(handlerSlice).toMatch(/buildLockedAggregateResponse\(/);
    expect(handlerSlice).not.toMatch(/consentingUids\.length < threshold/);
  });

  it('a cohort below the organisation privacy threshold receives a locked hr-dashboard response with no team figures', async () => {
    seedDoc('organisations/org_1', { name: 'Test Org', adminUids: ['owner_1'], hrViewerUids: ['owner_1'], memberUids: ['owner_1', 'member_1'], privacyThreshold: 5 });
    seedDoc('users/owner_1', { shareAnonymizedDataWithOrg: true });
    seedDoc('users/member_1', { shareAnonymizedDataWithOrg: true });

    const res = await request(app).get('/api/org/org_1/hr-dashboard').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locked: true, cohortSize: 2, threshold: 5, teams: [] });
  });

  it('GET /api/org/:orgId/suggestions calls the shared checkCohortSufficiency function rather than its own inline comparison', () => {
    const routeStart = serverSource.indexOf('app.get("/api/org/:orgId/suggestions"');
    expect(routeStart).toBeGreaterThan(-1);
    const nextRouteStart = serverSource.slice(routeStart + 10).search(/\bapp\.(get|post|put|delete|patch)\(/);
    expect(nextRouteStart).toBeGreaterThan(-1);
    const handlerSlice = serverSource.slice(routeStart, routeStart + 10 + nextRouteStart);
    expect(handlerSlice).toMatch(/checkCohortSufficiency\(/);
    expect(handlerSlice).toMatch(/buildLockedAggregateResponse\(/);
  });

  it('a cohort below the organisation privacy threshold receives a locked suggestions response, never the real free-text content', async () => {
    seedDoc('organisations/org_1', { name: 'Test Org', adminUids: ['owner_1'], memberUids: ['owner_1', 'member_1'], privacyThreshold: 5 });
    seedDoc('users/owner_1', { shareAnonymizedDataWithOrg: true });
    seedDoc('users/member_1', { shareAnonymizedDataWithOrg: true });

    const res = await request(app).get('/api/org/org_1/suggestions').set(auth('owner_1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locked: true, cohortSize: 2, threshold: 5, suggestions: [] });
  });
});

describe('executive_financial_estimate_is_a_range', () => {
  it('buildFinancialRangeEstimate never returns a single figure - low and high are always distinct when not null', () => {
    const costInputs = { annualSicknessDays: 240, avgDailyCostPerEmployee: 180, headcount: 45 };
    const result = buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'sustained');
    expect(result).not.toBeNull();
    expect(typeof result!.lowEstimate).toBe('number');
    expect(typeof result!.highEstimate).toBe('number');
    expect(result!.lowEstimate).toBeLessThan(result!.highEstimate);
    expect(result!.assumptionNote).toBeTruthy();
  });

  it('buildFinancialRangeEstimate never fabricates an estimate for a low/typical/null band', () => {
    const costInputs = { annualSicknessDays: 240, avgDailyCostPerEmployee: 180, headcount: 45 };
    expect(buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'low')).toBeNull();
    expect(buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', 'typical')).toBeNull();
    expect(buildFinancialRangeEstimate(costInputs, 'Meeting Pressure', null)).toBeNull();
  });

  it('GET /api/org/:orgId/executive-work-design calls buildFinancialRangeEstimate rather than computing its own cost figure', () => {
    const routeStart = serverSource.indexOf('app.get("/api/org/:orgId/executive-work-design"');
    expect(routeStart).toBeGreaterThan(-1);
    const nextRouteStart = serverSource.slice(routeStart + 10).search(/\bapp\.(get|post|put|delete|patch)\(/);
    expect(nextRouteStart).toBeGreaterThan(-1);
    const handlerSlice = serverSource.slice(routeStart, routeStart + 10 + nextRouteStart);
    expect(handlerSlice).toMatch(/buildFinancialRangeEstimate\(/);
  });

  it('a sufficient org-wide cohort with cost inputs and a sustained signal gets a real range, never a single number', async () => {
    seedDoc('organisations/org_1', {
      name: 'Test Org', adminUids: ['owner_1'], memberUids: ['owner_1', 'a1', 'a2', 'a3'], privacyThreshold: 3,
      costInputs: { annualSicknessDays: 240, avgDailyCostPerEmployee: 180, headcount: 45 },
    });
    const nowIso = new Date().toISOString();
    for (const uid of ['a1', 'a2', 'a3']) {
      seedDoc(`users/${uid}`, { shareAnonymizedDataWithOrg: true });
      seedDoc(`users/${uid}/nova_permissions/current`, { allowCalendarSignals: true });
      seedDoc(`users/${uid}/live_signals/calendar`, {
        updatedAt: nowIso, totalMeetingHours: 30, backToBackCount: 10, eveningMeetingCount: 2, weekendMeetingCount: 0,
      });
    }

    const res = await request(app).get('/api/org/org_1/executive-work-design').set(auth('owner_1'));
    expect(res.body.financialEstimate.lowEstimate).toBeLessThan(res.body.financialEstimate.highEstimate);
  });
});
