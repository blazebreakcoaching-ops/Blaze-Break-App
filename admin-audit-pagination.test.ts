import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source-boundary checks only. Firestore emulator and mounted React tests
// remain mandatory before staging; do not count these as runtime QA.
const server = readFileSync('server.ts', 'utf8');
const dashboard = readFileSync('src/components/AdminDashboard.tsx', 'utf8');
const view = readFileSync('src/components/AdminAuditHistory.tsx', 'utf8');
const route = server.slice(server.indexOf('const ADMIN_AUDIT_PAGE_SIZE ='), server.indexOf('app.get("/api/admin/feedback"'));

describe('platform audit history pagination and data boundaries', () => {
  it('requires existing audit.read permission and rejects unsafe cursors', () => {
    expect(route).toContain('requirePermission(req, "audit.read")');
    expect(route).toContain('Invalid audit cursor.');
    expect(route).toContain('res.status(403)');
  });
  it('paginates in bounded snapshot order and returns honest continuation', () => {
    expect(route).toContain('orderBy("createdAt", "desc")');
    expect(route).toContain('query.startAfter(anchor)');
    expect(route).toContain('ADMIN_AUDIT_PAGE_SIZE + 1');
    expect(route).toContain('nextCursor: hasMore ? page[page.length - 1].id : null');
    expect(route).toContain('complete: !hasMore');
    expect(route).toContain('Audit cursor is no longer valid.');
  });
  it('does not return unbounded raw metadata, IP or user-agent', () => {
    expect(route).toContain('const safeKeys = [');
    expect(route).not.toContain('...data');
    expect(route).not.toContain('ipAddress:');
    expect(route).not.toContain('userAgent:');
    expect(route).toContain("outcome: data.outcome === 'failed'");
    expect(route).toContain("'unrecorded'");
  });
  it('gives the Audit Trail independent page navigation and explicit missing-proof semantics', () => {
    expect(dashboard).toContain('<AdminAuditHistory key={authUser?.uid');
    expect(view).toContain('onClick={() => void load(nextCursor, [...history, cursor])}');
    expect(view).toContain('onClick={() => void load(history[history.length - 1], history.slice(0, -1))}');
    expect(view).toContain('Category filters apply only to this page');
    expect(view).toContain('this ledger alone cannot prove completeness');
    expect(view).toContain('generation.current++');
  });
});
