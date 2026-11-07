/**
 * A pulse/energy history is personal recovery information. Browser-local
 * records must be tied to the current Firebase UID, never shared across
 * users of one browser or imported from ambiguous legacy global keys.
 */
export interface PulseHistoryEntry {
  date: string;
  score: number;
}
export const pulseHistoryKey = (uid: string): string =>
  `blaze_break_pulse_history_v2:${encodeURIComponent(uid)}`;

export const pulseAlertKey = (uid: string): string =>
  `blaze_break_last_pulse_alert_v2:${encodeURIComponent(uid)}`;

export const lastCheckInKey = (uid: string): string =>
  `blaze_break_last_checkin_v2:${encodeURIComponent(uid)}`;

export function parsePulseHistory(raw: string | null): PulseHistoryEntry[] {
  if (!raw) return [];
  try {
    const records: unknown = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    return records.filter((entry): entry is PulseHistoryEntry =>
      entry !== null && typeof entry === 'object' &&
      typeof (entry as PulseHistoryEntry).date === 'string' &&
      (entry as PulseHistoryEntry).date.length > 0 &&
      (entry as PulseHistoryEntry).date.length <= 60 &&
      typeof (entry as PulseHistoryEntry).score === 'number' &&
      Number.isFinite((entry as PulseHistoryEntry).score) &&
      (entry as PulseHistoryEntry).score >= 0 &&
      (entry as PulseHistoryEntry).score <= 100,
    ).slice(-30);
  } catch {
    return [];
  }
}

/** Asynchronous account A loads must never update state for account B. */
export function mayApplyAccountLoad(
  loadedForUid: string | null,
  currentUid: string | null,
  cancelled: boolean,
): boolean {
  return !cancelled && loadedForUid === currentUid;
}
