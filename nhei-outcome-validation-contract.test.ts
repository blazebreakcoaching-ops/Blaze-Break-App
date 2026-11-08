import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Source-boundary regression checks. These do not replace authenticated HTTP,
// Firestore emulator, concurrency or staging tests.
const server = readFileSync('server.ts', 'utf8');
const start = server.indexOf('app.post("/api/recovery/routing-outcome"');
const end = server.indexOf('// Recovery Outcomes Intelligence', start);
const handler = server.slice(start, end);

describe('recovery outcome feedback validation', () => {
  it('finds the authenticated App Check-protected outcome endpoint', () => {
    expect(start).toBeGreaterThan(-1);
    expect(handler).toContain('verifyAppCheck, authenticateFirebaseUser');
  });

  it('rejects completed outcomes with missing or invalid helpfulness before any transaction', () => {
    const guard = handler.indexOf("action === 'completed' && validHelpfulness === null");
    const rejection = handler.indexOf('return res.status(400)', guard);
    const transaction = handler.indexOf('await db.runTransaction');
    expect(guard).toBeGreaterThan(-1);
    expect(rejection).toBeGreaterThan(guard);
    expect(transaction).toBeGreaterThan(rejection);
    expect(handler).toContain('ROUTING_OUTCOME_HELPFULNESS.includes(helpfulness)');
  });

  it('preserves owner-scoped decisions, idempotency and forgotten-rating protection', () => {
    expect(handler).toContain("db.collection('users').doc(user.uid).collection('recovery_routing_decisions')");
    expect(handler).toContain("typedAction === 'completed' && data.feedbackWithdrawnAt");
    expect(handler).toContain("outcomeResult = 'already_recorded'");
    expect(handler).toContain('await db.runTransaction');
  });
});
