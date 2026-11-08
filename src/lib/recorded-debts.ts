import type { Debt } from '../types';

// Every account starts with placeholder recovery-debt entries whose value
// is 0 ("not logged yet"). Those placeholders are not evidence of anything,
// so they must never unlock a badge, be named as a customer's "highest
// debt" or be quoted back to them as a percentage. A debt counts as
// recorded only when it holds a real, positive, finite reading - the same
// rule the server applies before using a sleep value (/api/user/weekly-recap).
export function recordedDebts(debts: readonly Debt[] | undefined | null): Debt[] {
  return (debts ?? []).filter((d) =>
    !d.cleared && typeof d.value === 'number' && Number.isFinite(d.value) && d.value > 0 &&
    typeof d.max === 'number' && d.max > 0);
}

export function highestRecordedDebt(debts: readonly Debt[] | undefined | null): Debt | null {
  const real = recordedDebts(debts);
  if (real.length === 0) return null;
  return [...real].sort((a, b) => (b.value / b.max) - (a.value / a.max))[0];
}

// Real, recorded sleep shortfall in hours, or null when none is logged.
export function recordedSleepShortfall(debts: readonly Debt[] | undefined | null): number | null {
  return recordedDebts(debts).find((d) => d.label === 'Sleep Shortfall')?.value ?? null;
}
