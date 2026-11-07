/**
 * Historical permissions documents could contain allowCalendarSignals=true
 * from an old default, without the person ever opting in. Require BOTH the
 * current positive choice and a valid explicit opt-in timestamp.
 */
export function hasExplicitCalendarSignalConsent(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  if (value.allowCalendarSignals !== true ||
      typeof value.calendarSignalsExplicitConsentAt !== 'string') return false;
  const timestamp = Date.parse(value.calendarSignalsExplicitConsentAt);
  return Number.isFinite(timestamp) &&
    timestamp <= Date.now() + 60_000;
}
