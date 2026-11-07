import type { UserStats } from '../types';

/**
 * The profile's old subscription field is neither customer-editable nor
 * authorised by Firestore rules. Billing entitlement lives in the
 * server-controlled entitlements/status document, not user_stats/core.
 * supportCircle is stored in its separately validated subcollection.
 */
export function statsForSafeWrite(stats: UserStats): Record<string, unknown> {
  const { supportCircle: _legacyContacts, profile, ...rest } = stats;
  const cleaned: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );

  if (profile) {
    const { subscription: _oldUntrustedTier, ...withoutTier } = profile;
    cleaned.profile = Object.fromEntries(
      Object.entries(withoutTier).filter(([, value]) => value !== undefined),
    );
  }
  return cleaned;
}
