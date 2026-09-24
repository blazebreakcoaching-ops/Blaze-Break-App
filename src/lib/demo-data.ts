// Pure sample-dashboard content for a fresh anonymous visitor ("demo
// session") - kept free of React/Firebase so it's genuinely unit-testable,
// same reasoning as this app's other extracted-logic modules
// (home-widget-tiers.ts, paletteMatch.ts).
//
// Why this exists: every visitor is auto-signed-in anonymously the moment
// they land (see src/lib/auth.tsx), and previously saw the exact same
// honest, all-zero starting state a real Free account gets - giving away
// the same value with zero marketing recourse (no email, no way to ever
// re-contact them). This module is the sample content shown instead, so a
// visitor can see the product's payoff immediately.
//
// This EXACT app used to fabricate demo data for anonymous users (a fake
// "Test User", 450 points, invented numbers) presented AS IF it were the
// visitor's own real progress, with no way back to honest data - that was
// found and removed as a bug (see the comment in App.tsx's loadStats()).
// This module must never repeat that mistake: these constants are used
// ONLY as swapped-in render props (never written into real stats/
// fingerprint state, never persisted to Firestore) - see App.tsx's
// `isDemoSession` usage at the <HomeSection> call site.

import { UserStats, BurnoutFingerprint } from "../types";

export const DEMO_STATS: UserStats = {
  points: 1450,
  streak: 6,
  rehearsalCount: 4,
  lastEngagementDate: "2026-09-22",
  unlockedBadges: ["first_step", "consistency_3"],
  // Never seeded with sample contacts - a nonempty supportCircle here
  // would flow into migrateSupportCircleIfNeeded's Firestore write, a
  // second persistence path this module is not involved in and must not
  // need to guard.
  supportCircle: [],
  committedActionIds: [],
  debts: [
    { id: "0", label: "Sleep Debt", value: 4, unit: "h", max: 15, color: "text-primary", impact: "Reduced emotional regulation.", novaNote: "Prefrontal fatigue detected. Unplug now." },
    { id: "1", label: "Neural Fatigue", value: 7, unit: "cr", max: 20, color: "text-warning", impact: "Cognitive tunnel vision.", novaNote: "Neural de-escalation is needed. Pause planning." },
    { id: "2", label: "Social Overlap", value: 2, unit: "h", max: 10, color: "text-text-main", impact: "Identity erosion from fawning.", novaNote: "Return to your baseline frame." },
  ],
  profile: {
    // A clearly-fake, self-labeling placeholder - never a real-sounding
    // invented name (the removed "Test User" precedent this module is
    // deliberately not repeating).
    fullName: "Sample Account",
    role: "Director of Operations",
    organization: "",
    managerEmail: "",
    authRole: "individual",
  },
};

// One of the real, established archetypes (src/types.ts's BurnoutProfile
// union) - never an invented one.
export const DEMO_FINGERPRINT: BurnoutFingerprint = {
  profile: "High-Functioning Exhausted",
  description: "Keeps performing at a high level while running on fumes - the classic pattern this sample account illustrates.",
  priorities: ["Protect sleep", "Rebuild boundaries", "Reduce always-on load"],
  scores: {
    workload: 78,
    boundaries: 35,
    peoplePleasing: 55,
    guilt: 40,
    sleep: 30,
    emotionalOverload: 60,
    meaning: 65,
  },
};

// A gently upward 14-day trend, dates formatted exactly as
// handleCheckInComplete formats real entries (App.tsx) so it renders
// identically to a real chart.
export const DEMO_PULSE_HISTORY: { date: string; score: number }[] = [
  { date: "Sep 9", score: 38 },
  { date: "Sep 10", score: 41 },
  { date: "Sep 11", score: 40 },
  { date: "Sep 12", score: 45 },
  { date: "Sep 13", score: 48 },
  { date: "Sep 14", score: 47 },
  { date: "Sep 15", score: 52 },
  { date: "Sep 16", score: 55 },
  { date: "Sep 17", score: 54 },
  { date: "Sep 18", score: 58 },
  { date: "Sep 19", score: 61 },
  { date: "Sep 20", score: 60 },
  { date: "Sep 21", score: 64 },
  { date: "Sep 22", score: 66 },
];

export const DEMO_ENERGY_LEVEL = 66;
export const DEMO_BURNOUT_RISK = "Moderate";

// Matches RecoveryVelocityMap.tsx's own /api/recovery/velocity-map response
// shape (date + the two raw inputs it derives balance/notes from itself via
// annotateDay) - same 14-day window and narrowing trend as
// DEMO_PULSE_HISTORY above, so the two charts tell one consistent story: a
// high-output, low-recovery start that's gradually closing the gap.
export const DEMO_VELOCITY_MAP: { date: string; energyOutput: number; recoveryInput: number }[] = [
  { date: "Sep 9", energyOutput: 82, recoveryInput: 38 },
  { date: "Sep 10", energyOutput: 80, recoveryInput: 40 },
  { date: "Sep 11", energyOutput: 79, recoveryInput: 42 },
  { date: "Sep 12", energyOutput: 78, recoveryInput: 45 },
  { date: "Sep 13", energyOutput: 76, recoveryInput: 48 },
  { date: "Sep 14", energyOutput: 75, recoveryInput: 50 },
  { date: "Sep 15", energyOutput: 74, recoveryInput: 52 },
  { date: "Sep 16", energyOutput: 73, recoveryInput: 55 },
  { date: "Sep 17", energyOutput: 71, recoveryInput: 58 },
  { date: "Sep 18", energyOutput: 70, recoveryInput: 60 },
  { date: "Sep 19", energyOutput: 68, recoveryInput: 62 },
  { date: "Sep 20", energyOutput: 67, recoveryInput: 64 },
  { date: "Sep 21", energyOutput: 66, recoveryInput: 66 },
  { date: "Sep 22", energyOutput: 65, recoveryInput: 68 },
];

// The single source of truth for "is this a demo session" - App.tsx
// derives isDemoSession from this on every render (not stored as
// separate state), so it flips back to false automatically the instant
// a real profile.fullName is saved (real onboarding completed, or a
// linked real account's saved profile loads).
export const isDemoUser = (
  isAnonymous: boolean | undefined,
  profileFullName: string | undefined,
): boolean => !!isAnonymous && !profileFullName;
