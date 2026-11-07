import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Architectural source guard only. Must also pass real emulator/API tests. */
const server = readFileSync('server.ts', 'utf8');
const rules = readFileSync('firestore.rules', 'utf8');
const post = server.split('app.post("/api/signals/calendar"')[1]?.split('app.get("/api/signals/calendar"')[0] || '';
const get = server.split('app.get("/api/signals/calendar"')[1]?.split('Nova Take the Load')[0] || '';

describe('Calendar signals cannot bypass consent via direct backend requests', () => {
  it('checks explicit permission inside the same transaction as the POST write', () => {
    expect(post).toContain('db.runTransaction(');
    expect(post).toContain('hasExplicitCalendarSignalConsent(consent.data())');
    expect(post).toContain('tx.set(signalRef');
    expect(post).toContain('res.status(403)');
    expect(post).not.toContain('await signalRef.set(');
  });

  it('does not return persisted signal data after the person withdraws permission', () => {
    expect(get).toContain('hasExplicitCalendarSignalConsent(consent.data())');
    expect(get).toContain('return res.json({ state: null })');
  });

  it('blocks legacy default-true accounts from organisation calendar coverage', () => {
    expect(server).toContain("if (!permDoc.exists || !hasExplicitCalendarSignalConsent(permDoc.data())) return 'not_connected';");
  });

  it('allows the dated consent marker while retaining existing rule validation', () => {
    const section = rules.split('match /nova_permissions/current {')[1]?.split('match /', 1)[0] || '';
    expect(section).toContain("'calendarSignalsExplicitConsentAt'");
    expect(section).toContain("isStringWithMax(request.resource.data.calendarSignalsExplicitConsentAt, 40)");
    expect(section).toContain('request.resource.data.allowNovaMemory is bool');
  });
});
