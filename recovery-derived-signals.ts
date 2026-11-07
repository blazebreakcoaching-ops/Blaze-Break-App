// Shared, deterministic trust boundary for Recovery Intelligence's derived
// summaries. Both Pulse and Recovery Routing consume these same documents;
// neither may treat missing, provisional or stale calculations as evidence.
// Pure module: no model calls, data writes, Firestore access or personal text.
export const RECOVERY_DERIVED_MAX_AGE_DAYS = 14;

export interface RecoveryDerivedSummary {
  status: 'available';
  calculatedAt: string;
  direction?: string;
  value?: number | null;
}

export function isUsableRecoveryDerivedSummary(
  value: unknown,
  nowMs: number,
): value is RecoveryDerivedSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Record<string, unknown>;
  if (summary.status !== 'available' || typeof summary.calculatedAt !== 'string') return false;
  const calculatedAtMs = Date.parse(summary.calculatedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(calculatedAtMs)) return false;
  const ageMs = nowMs - calculatedAtMs;
  return ageMs >= 0 && ageMs <= RECOVERY_DERIVED_MAX_AGE_DAYS * 86400000;
}

// This is a non-clinical, user-reported trend indicator rather than a
// diagnosis or independent reason to contact another person.
export function isHighRisingRecoveryDebt(value: unknown, nowMs: number): boolean {
  return isUsableRecoveryDerivedSummary(value, nowMs)
    && value.direction === 'rising'
    && typeof value.value === 'number'
    && Number.isFinite(value.value)
    && value.value >= 65 && value.value <= 100;
}
