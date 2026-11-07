import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static contracts only: emulator, Auth SDK and browser tests are still needed.
const server = readFileSync('server.ts', 'utf8');
const ui = readFileSync('src/components/AdminDashboard.tsx', 'utf8');
const audit = server.slice(server.indexOf('// Idempotent operational audit events.'), server.indexOf('// Account security:'));
const summary = server.slice(server.indexOf('app.get("/api/admin/summary"'), server.indexOf('app.get("/api/admin/users"',server.indexOf('app.get("/api/admin/summary"')));
const paths = [
  ['app.post("/api/admin/admin-users"', 'app.post("/api/admin/admin-users/:uid/role"'],
  ['app.post("/api/admin/admin-users/:uid/role"', 'app.delete("/api/admin/admin-users/:uid"'],
  ['app.delete("/api/admin/admin-users/:uid"', '// Scoped per-account operational audit history.'],
  ['app.post("/api/admin/users/:uid/role"', 'app.post("/api/admin/users/:uid/entitlement"'],
];

describe('administrative governance follow-up source checks', () => {
  it('revokes old tokens whenever admin privileges or account roles change', () => {
    expect(server).toContain('verifyIdToken(token, true)');
    for (const [start, end] of paths) {
      const block = server.slice(server.indexOf(start), server.indexOf(end));
      expect(block).toContain('getAuth().revokeRefreshTokens(targetUid)');
    }
  });

  it('replaces the first 100 profiles figure with exact count aggregation', () => {
    expect(summary).toContain('db.collection("users").count().get()');
    expect(summary).toContain('usersCountSource: "firestore_profiles"');
    expect(ui).toContain('Firestore Profiles</span>');
    expect(ui).toContain("firestoreProfileCount === null ? 'Unavailable'");
    expect(ui).toContain('Firebase Auth-only accounts are excluded');
  });

  it('uses a stable ID for audit write and recovery replay', () => {
    expect(audit).toContain('const eventRef = db.collection("admin_audit_logs").doc()');
    expect(audit).toContain('await eventRef.set(entry)');
    expect(audit).toContain('.doc(eventRef.id).set({');
    expect(audit).toContain('const original = db.collection("admin_audit_logs").doc(doc.id)');
    expect(audit).toContain('if (!existing.exists) await original.set(entry)');
    expect(audit).toContain('await doc.ref.delete()');
  });

  it('restricts repair to platform owner and bounds the batch', () => {
    expect(audit).toContain('requirePlatformOwner(req)');
    expect(audit).toContain('.limit(25).get()');
    expect(audit).toContain('return res.status(403)');
    expect(audit).toContain('failed, inspected: pending.size');
    expect(audit).toContain('AUDIT LOSS RISK');
  });
});
