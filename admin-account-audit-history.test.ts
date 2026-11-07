import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source assertions. Not proof of Firebase permissions, index readiness,
// browser interactions, component render or real audit persistence.
const server = readFileSync('server.ts', 'utf8');
const ui = readFileSync('src/components/AdminDashboard.tsx', 'utf8');
const timeline = readFileSync('src/components/AdminAccountAuditHistory.tsx', 'utf8');
const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
const route = server.slice(
  server.indexOf('const ADMIN_ACCOUNT_AUDIT_PAGE_SIZE ='),
  server.indexOf('// Audit history is paginated by a Firestore document snapshot'),
);

describe('per-account audit isolation and history contract', () => {
  it('requires audit.read and filters by exact target UID on server', () => {
    expect(route).toContain('requirePermission(req, "audit.read")');
    expect(route).toContain('.where("targetUid", "==", uid)');
    expect(route).toContain('anchor.data()?.targetUid !== uid');
    expect(route).toContain('res.status(403)');
  });

  it('validates account and cursor and limits read page', () => {
    expect(route).toContain('Invalid account or audit cursor.');
    expect(route).toContain('Invalid account audit cursor. Start again.');
    expect(route).toContain('ADMIN_ACCOUNT_AUDIT_PAGE_SIZE + 1');
    expect(route).toContain('query.startAfter(anchor)');
    expect(route).toContain('complete: !hasMore');
  });

  it('returns only allowed operational fields, never sensitive profile or recovery content', () => {
    expect(route).toContain("['role', 'plan', 'previousPlan', 'status', 'planChange', 'durationDays', 'suspend']");
    expect(route).not.toContain('...data');
    expect(route).not.toContain('collection("recovery")');
    expect(route).not.toContain('ipAddress:');
    expect(route).toContain('data.outcome === "succeeded"');
  });

  it('signals audit persistence failures for successful account mutations', () => {
    expect(server).toContain('return true;\n  } catch (err: any) {');
    expect(server).toContain('logger.error("Failed to write admin audit log"');
    expect(server).toContain('res.json({ success: true, auditRecorded })');
    expect(ui).toContain("auditResult?.auditRecorded === false");
    expect(ui).toContain('The account change succeeded, but the audit event was NOT saved.');
  });

  it('declares the required Firestore composite index', () => {
    expect(indexes.indexes).toContainEqual({
      collectionGroup: 'admin_audit_logs',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'targetUid', order: 'ASCENDING' },
        { fieldPath: 'createdAt', order: 'DESCENDING' },
      ],
    });
  });

  it('replaces legacy capped plan timeline with scoped paged component', () => {
    expect(ui).not.toContain("const timeline = auditLogs.filter((log) => log.action === 'grant_entitlement'");
    expect(ui).toContain('<AdminAccountAuditHistory key={u.uid} uid={u.uid} revision={directoryRefreshRevision} />');
    expect(timeline).toContain("encodeURIComponent(uid) + '/audit-history'");
    expect(timeline).toContain('generation.current++');
    expect(timeline).toContain('An empty ledger is not proof that no changes were made.');
    expect(timeline).toContain("nextCursor, [...history, cursor]");
  });
});
