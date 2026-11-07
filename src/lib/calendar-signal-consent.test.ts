import { describe, expect, it } from 'vitest';
import { hasExplicitCalendarSignalConsent } from './calendar-signal-consent';

describe('explicit Calendar signal aggregation consent', () => {
  it('rejects legacy true values that were previously set by default', () => {
    expect(hasExplicitCalendarSignalConsent({ allowCalendarSignals: true })).toBe(false);
    expect(hasExplicitCalendarSignalConsent({ allowCalendarSignals: true, calendarSignalsExplicitConsentAt: null })).toBe(false);
  });

  it('rejects missing, false, malformed, or future-dated consent', () => {
    for (const input of [
      null, {}, [], { allowCalendarSignals: false, calendarSignalsExplicitConsentAt: new Date().toISOString() },
      { allowCalendarSignals: 'true', calendarSignalsExplicitConsentAt: new Date().toISOString() },
      { allowCalendarSignals: true, calendarSignalsExplicitConsentAt: 'not-a-date' },
      { allowCalendarSignals: true, calendarSignalsExplicitConsentAt: '2099-01-01T00:00:00.000Z' },
    ]) {
      expect(hasExplicitCalendarSignalConsent(input)).toBe(false);
    }
  });

  it('recognises a dated, affirmative choice', () => {
    expect(hasExplicitCalendarSignalConsent({
      allowCalendarSignals: true,
      calendarSignalsExplicitConsentAt: new Date().toISOString(),
    })).toBe(true);
  });

  it('rejects revocation even if the previous opt-in timestamp still exists', () => {
    expect(hasExplicitCalendarSignalConsent({
      allowCalendarSignals: false,
      calendarSignalsExplicitConsentAt: '2026-11-07T10:00:00.000Z',
    })).toBe(false);
  });
});
