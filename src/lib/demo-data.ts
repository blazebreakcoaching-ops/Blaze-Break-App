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

import { UserStats, BurnoutFingerprint, SupportContact } from "../types";

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
// Matches EnergyBudgetMatrix.tsx's own Commitment shape (its
// energy_commitments Firestore subcollection). `isSample: true` lets that
// component tell these apart from anything the visitor genuinely typed
// into "Inject into Audit" during the same session - its action buttons
// (Delegate/Boundary/Drop) check this flag and update local state only for
// a sample card, never call updateDoc/setDoc, so a click can never fire a
// Firestore write against a doc that was never created.
export const DEMO_ENERGY_COMMITMENTS: {
  id: string;
  name: string;
  energyDrain: number;
  type: 'professional' | 'social' | 'emotional' | 'logistical';
  status: 'active' | 'dropped' | 'delegated' | 'restructured';
  createdAt: string;
  updatedAt?: string;
  isSample: true;
}[] = [
  { id: "demo-1", name: "Leading the weekly ops stand-up for 3 teams", energyDrain: 70, type: "professional", status: "active", createdAt: "2026-09-22T09:00:00.000Z", isSample: true },
  { id: "demo-2", name: "Covering a direct report's on-call rotation", energyDrain: 55, type: "professional", status: "active", createdAt: "2026-09-20T09:00:00.000Z", isSample: true },
  { id: "demo-3", name: "Smoothing tension between two stakeholders", energyDrain: 60, type: "emotional", status: "active", createdAt: "2026-09-19T09:00:00.000Z", isSample: true },
  { id: "demo-4", name: "Coordinating the offsite logistics", energyDrain: 35, type: "logistical", status: "delegated", createdAt: "2026-09-17T09:00:00.000Z", updatedAt: "2026-09-21T09:00:00.000Z", isSample: true },
];

// Matches RecoveryIntelligenceLayer.tsx's own local DerivedSummary shape
// (its users/{uid}/derived/{type} docs, server-written only). Not imported
// from that component - this module stays free of component/React
// dependencies, and the object below is structurally compatible with that
// interface either way. Consistent with the other demo constants: a
// moderate, improving picture, matching DEMO_PULSE_HISTORY and
// DEMO_VELOCITY_MAP's own narrowing-deficit trend over the same 14-day
// window (Sep 9 - Sep 22, 2026).
export const DEMO_DERIVED_SUMMARIES: Record<string, {
  type: 'recovery_debt' | 'recovery_velocity' | 'energy_trend' | 'mood_trend';
  status: 'available';
  value: number;
  direction: 'rising' | 'falling' | 'stable';
  confidenceLevel: 'medium' | 'high';
  sourceCount: number;
  periodStart: string;
  periodEnd: string;
  formulaVersion: string;
  explanation: string;
  sourcesUsed: string[];
  calculatedAt: string;
}> = {
  recovery_debt: {
    type: 'recovery_debt',
    status: 'available',
    value: 62,
    direction: 'falling',
    confidenceLevel: 'high',
    sourceCount: 24,
    periodStart: '2026-09-08',
    periodEnd: '2026-09-22',
    formulaVersion: 'v1_nonclinical',
    explanation: 'Pressure has been consistently higher than rest input, though the gap has been closing over the last two weeks.',
    sourcesUsed: ['checkins', 'energy_budgets', 'mood_pulses', 'wins'],
    calculatedAt: '2026-09-22T09:00:00.000Z',
  },
  recovery_velocity: {
    type: 'recovery_velocity',
    status: 'available',
    value: 47,
    direction: 'rising',
    confidenceLevel: 'medium',
    sourceCount: 18,
    periodStart: '2026-09-08',
    periodEnd: '2026-09-22',
    formulaVersion: 'v1_nonclinical',
    explanation: 'Boundary and energy recovery progress is trending upward, picking up pace over the most recent check-ins.',
    sourcesUsed: ['checkins', 'wins', 'goals'],
    calculatedAt: '2026-09-22T09:00:00.000Z',
  },
  energy_trend: {
    type: 'energy_trend',
    status: 'available',
    value: 58,
    direction: 'rising',
    confidenceLevel: 'high',
    sourceCount: 20,
    periodStart: '2026-09-08',
    periodEnd: '2026-09-22',
    formulaVersion: 'v1_nonclinical',
    explanation: 'Self-reported recovery capacity has been steadily climbing, matching the pulse history trend on the Home tab.',
    sourcesUsed: ['checkins', 'energy_budgets'],
    calculatedAt: '2026-09-22T09:00:00.000Z',
  },
  mood_trend: {
    type: 'mood_trend',
    status: 'available',
    value: 51,
    direction: 'stable',
    confidenceLevel: 'medium',
    sourceCount: 15,
    periodStart: '2026-09-08',
    periodEnd: '2026-09-22',
    formulaVersion: 'v1_nonclinical',
    explanation: 'Mood has held roughly steady, without the sharp pressure-driven dips seen in a typical high-output week.',
    sourcesUsed: ['mood_pulses'],
    calculatedAt: '2026-09-22T09:00:00.000Z',
  },
};

// Matches DailyVoiceJournal.tsx's own VoiceJournalEntry shape (its
// voice_journal_entries Firestore subcollection) - what an already-analysed
// entry looks like, so a demo visitor can see the payoff without recording
// anything themselves. The real record-and-analyse flow (a live, paid Nova
// call) stays untouched and fully click-triggered - these are never fed
// into it, only rendered.
export const DEMO_VOICE_JOURNAL_ENTRIES: {
  id: string;
  date: string;
  transcription: string;
  themes: string[];
  analysis: string;
  advice: string;
  emotionalTone: string;
}[] = [
  {
    id: "demo-vj-1",
    date: "22 Sep, 09:14",
    transcription: "I said yes to covering the stand-up again this week even though I'd already blocked that time for deep work. I don't think anyone would've minded if I'd said I was busy, but I just... didn't.",
    themes: ["Over-committing", "Boundary avoidance", "Protected time lost"],
    analysis: "This is a familiar pattern for a high-functioning exhausted profile: the cost of saying yes felt smaller in the moment than the discomfort of saying no, even though the actual cost - lost deep-work time - was real and recurring.",
    advice: "Next time this comes up, try naming the trade-off out loud before agreeing: \"If I cover this, I'm giving up my focus block - is that the right call today?\" Making the cost visible to yourself first makes it easier to decline when it isn't.",
    emotionalTone: "Resigned",
  },
  {
    id: "demo-vj-2",
    date: "19 Sep, 18:40",
    transcription: "Actually had a good day. Pushed back on a Friday deadline and it landed fine - nobody pushed back. Small win but it felt big.",
    themes: ["Successful boundary", "Underestimated pushback risk"],
    analysis: "Worth noticing: the anticipated conflict didn't materialise. That's useful evidence against the belief that boundaries always cost something socially - one data point isn't proof, but it's a start.",
    advice: "Write this one down somewhere you'll see it next time you're hesitating to set a boundary - it's easy to forget the wins and only remember the close calls.",
    emotionalTone: "Encouraged",
  },
];

// Matches NovaGuardianRelay.tsx's own SupportContact shape - illustrative
// Guardian Relay cards so a demo visitor can see what a configured support
// network looks like. Both use the +1-202-555-01xx block NANP reserves for
// fiction (never a real subscriber number), and both are tagged isSample -
// NovaGuardianRelay.tsx checks that flag before every real-world send path
// (the Twilio test ping and the Guardian alert dispatch), so a sample card
// can never trigger an actual SMS or phone-based alert. This is a stricter
// version of the isSample write-guard DEMO_ENERGY_COMMITMENTS already uses
// - here the risk isn't a stray Firestore write, it's a real message to a
// real phone number, so the guard has to be airtight, not best-effort.
export const DEMO_GUARDIANS: SupportContact[] = [
  { id: "demo-guardian-1", name: "Jordan (Partner)", role: "primary_guardian", isGuardian: true, contactMethod: "+12025550142", relation: "Partner", notificationPreference: "sms", isSample: true },
  { id: "demo-guardian-2", name: "Sam (Close Friend)", role: "backup_guardian", isGuardian: true, contactMethod: "+12025550187", relation: "Friend", notificationPreference: "sms", isSample: true },
];

export const isDemoUser = (
  isAnonymous: boolean | undefined,
  profileFullName: string | undefined,
): boolean => !!isAnonymous && !profileFullName;
