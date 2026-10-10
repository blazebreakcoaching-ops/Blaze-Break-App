// Work Design Drift Detector (Work Design Pulse PR9) - regression
// monitoring for a signal the organisation has already promoted to a
// Local Operating Principle (evidence-ladder.ts). Promoting a pattern is
// a point-in-time human endorsement; it says nothing about whether the
// practice is still actually happening. This checks the signal's own
// real, currently-computed band (work-design-signals.ts) against that
// past endorsement and flags it when the organisation's real current
// behaviour has drifted back to elevated/sustained - never a one-time
// check baked into the promotion itself, since drift by definition only
// shows up later. Pure logic only (no Firestore, no React).

import type { SignalBand } from './work-design-signals';

export interface LocalOperatingPrinciple {
  signalKey: string;
  label: string;
  promotedAt: string;
}

export interface DriftFinding {
  signalKey: string;
  message: string;
}

// Only an elevated or sustained band counts as drift - a band that's
// merely unknown (insufficient data right now) is never treated as
// regression, since that would punish a cohort that temporarily dropped
// below the privacy threshold rather than one that actually backslid.
const isRegressedBand = (band: SignalBand | null): boolean => band === 'elevated' || band === 'sustained';

export const checkWorkDesignDrift = (
  principle: LocalOperatingPrinciple,
  currentBand: SignalBand | null,
): DriftFinding | null => {
  if (!isRegressedBand(currentBand)) return null;
  return {
    signalKey: principle.signalKey,
    message: `"${principle.label}" was established as a Local Operating Principle, but the current signal is back to ${currentBand === 'sustained' ? 'Sustained' : 'Elevated'}. Worth checking whether the practice has lapsed.`,
  };
};
