// Flag Debt (Evolution Engine PR11) - computed live from the real
// feature registry's own enforcementState/createdAt fields, never a
// separate stored concept. A "debt candidate" is an entry whose
// enforcement has never been verified as real (enforcementState is
// 'not_wired' or 'unknown') and which hasn't already been formally
// retired (lifecycleState 'removed') - retiring it is the resolution,
// not more debt. Age is computed from the entry's real createdAt
// (when it entered the registry), so this can never drift from the one
// real source of truth the way a separately-tracked "debt list" could.

import { FeatureRegistryEntry } from './feature-registry-v2';

export type FlagDebtInput = Pick<FeatureRegistryEntry, 'featureId' | 'displayName' | 'lifecycleState' | 'enforcementState' | 'createdAt'>;

export interface FlagDebtCandidate {
  featureId: string;
  displayName: string;
  lifecycleState: string;
  enforcementState: string;
  ageDays: number;
  reason: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const computeFlagDebt = (entries: readonly FlagDebtInput[], now: Date = new Date()): FlagDebtCandidate[] => {
  return entries
    .filter((e) => e.enforcementState === 'not_wired' || e.enforcementState === 'unknown')
    .filter((e) => e.lifecycleState !== 'removed')
    .map((e) => {
      const created = new Date(e.createdAt).getTime();
      const ageDays = Number.isFinite(created) ? Math.max(0, Math.floor((now.getTime() - created) / MS_PER_DAY)) : 0;
      return {
        featureId: e.featureId,
        displayName: e.displayName,
        lifecycleState: e.lifecycleState,
        enforcementState: e.enforcementState,
        ageDays,
        reason: e.enforcementState === 'not_wired'
          ? 'This flag is not read anywhere outside the registry display - toggling it has no real effect.'
          : "Enforcement has never been independently verified - it may or may not actually gate anything.",
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
};
