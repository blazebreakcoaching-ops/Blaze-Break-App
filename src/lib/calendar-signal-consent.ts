/**
 * Historical permissions documents could contain allowCalendarSignals=true
 * from an old default, without the person ever opting in. Require BOTH a
 * current positive choice and a canonical timestamp from an explicit action.
 */
export function hasExplicitCalendarSignalConsent(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  if (value.allowCalendarSignals !== true ||
      typeof value.calendarSignalsExplicitConsentAt !== 'string') return false;
  const raw = value.calendarSignalsExplicitConsentAt;
  // Date.parse accepts ambiguous inputs like "0" and year-only strings.
  // Only the exact UTC ISO format written by the consent UI is valid.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) return false;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString() === raw &&
    timestamp <= Date.now() + 60_000;
}
