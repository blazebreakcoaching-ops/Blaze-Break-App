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
import { CapacityLevel, StressorCategory, StressorSeverity, StressorPersistence, ReductionLevel, StressorAction, RecoveryActionType, RecoveryHelpfulness } from "../../energy-delta-engine";

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
    { id: "0", label: "Sleep Shortfall", value: 1.5, unit: "h", max: 8, color: "text-primary", impact: "Short sleep can make concentration and emotional regulation harder.", novaNote: "Your sleep shortfall is building. Tonight's wind-down matters." },
    { id: "1", label: "Mental Fatigue", value: 8, unit: "", max: 20, color: "text-warning", impact: "You may notice yourself rereading things or losing your train of thought.", novaNote: "Your mental load looks moderate. Protect one more focus block, then stop." },
    { id: "2", label: "Social Load", value: 3, unit: "", max: 10, color: "text-text-main", impact: "Overcommitting while capacity is already low can leave less room for your own priorities.", novaNote: "Your social load is manageable right now - nothing to flag." },
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
// Energy Delta Model v1's demo fixtures (replaces the old pre-v1
// DEMO_ENERGY_COMMITMENTS 0-100-slider shape). `isSample: true` on the
// stressors lets EnergyBudgetMatrix.tsx tell these apart from anything
// the visitor genuinely logs during the same session - its action
// handlers check this flag and only ever update local state for a sample
// entry, never call Firestore.
export const DEMO_CAPACITY_CHECKIN: {
  id: string; physical: CapacityLevel; mental: CapacityLevel; emotional: CapacityLevel; score: number; createdAt: string;
} = {
  id: "demo-capacity-1", physical: "good", mental: "okay", emotional: "okay", score: 58, createdAt: "2026-09-22T08:00:00.000Z",
};

export const DEMO_ENERGY_STRESSORS: {
  id: string;
  name: string;
  category: StressorCategory;
  severity: StressorSeverity;
  persistence: StressorPersistence;
  reduction?: ReductionLevel;
  action?: StressorAction;
  capacityAtLogging?: number | null;
  status: 'active' | 'resolved';
  createdAt: string;
  updatedAt: string;
  isSample: true;
}[] = [
  { id: "demo-s1", name: "Leading the weekly ops stand-up for 3 teams", category: "professional", severity: 4, persistence: "ongoing", action: "accept", status: "active", createdAt: "2026-09-22T09:00:00.000Z", updatedAt: "2026-09-22T09:00:00.000Z", isSample: true },
  { id: "demo-s2", name: "Covering a direct report's on-call rotation", category: "professional", severity: 3, persistence: "repeated", reduction: "a_little", action: "delegate", status: "active", createdAt: "2026-09-20T09:00:00.000Z", updatedAt: "2026-09-21T09:00:00.000Z", isSample: true },
  { id: "demo-s3", name: "Smoothing tension between two stakeholders", category: "emotional", severity: 3, persistence: "ongoing", status: "active", createdAt: "2026-09-19T09:00:00.000Z", updatedAt: "2026-09-19T09:00:00.000Z", isSample: true },
  { id: "demo-s4", name: "Coordinating the offsite logistics", category: "logistical", severity: 2, persistence: "one_off", reduction: "a_lot", action: "delegate", status: "resolved", createdAt: "2026-09-17T09:00:00.000Z", updatedAt: "2026-09-21T09:00:00.000Z", isSample: true },
  { id: "demo-s5", name: "Agreed to host Friday's team dinner", category: "social", severity: 2, persistence: "one_off", capacityAtLogging: 35, status: "active", createdAt: "2026-09-21T09:00:00.000Z", updatedAt: "2026-09-21T09:00:00.000Z", isSample: true },
];

// Six days of history before "today" - the component always computes
// today's own snapshot live from DEMO_CAPACITY_CHECKIN + DEMO_ENERGY_
// STRESSORS rather than trusting a seventh hardcoded entry here, exactly
// like the real (non-demo) data flow. A gap that's been gradually
// closing, consistent with DEMO_DERIVED_SUMMARIES' own "closing over the
// last two weeks" narrative - and deliberately keeps 4 of these 6 days
// below the Sustained Capacity Gap threshold so the demo also shows that
// card, not just a clean dashboard.
export const DEMO_DAILY_SNAPSHOTS: {
  date: string; capacity: number | null; grossLoad: number; netLoad: number; capacityProtected: number; energyDelta: number | null; updatedAt: string;
}[] = [
  { date: "2026-09-16", capacity: 38, grossLoad: 65, netLoad: 60, capacityProtected: 5, energyDelta: -22, updatedAt: "2026-09-16T18:00:00.000Z" },
  { date: "2026-09-17", capacity: 42, grossLoad: 62, netLoad: 60, capacityProtected: 2, energyDelta: -18, updatedAt: "2026-09-17T18:00:00.000Z" },
  { date: "2026-09-18", capacity: 48, grossLoad: 62, netLoad: 60, capacityProtected: 2, energyDelta: -12, updatedAt: "2026-09-18T18:00:00.000Z" },
  { date: "2026-09-19", capacity: 45, grossLoad: 62, netLoad: 60, capacityProtected: 2, energyDelta: -15, updatedAt: "2026-09-19T18:00:00.000Z" },
  { date: "2026-09-20", capacity: 55, grossLoad: 58, netLoad: 52, capacityProtected: 6, energyDelta: 3, updatedAt: "2026-09-20T18:00:00.000Z" },
  { date: "2026-09-21", capacity: 52, grossLoad: 55, netLoad: 50, capacityProtected: 5, energyDelta: 2, updatedAt: "2026-09-21T18:00:00.000Z" },
];

// Today's Capacity Plan's demo task list - a few planned demands for
// today, one already marked delegated, so the demo session shows
// Capacity Protected actually moving rather than a flat empty plan.
const SEVERITY_TO_COST: Record<'High' | 'Medium' | 'Low', number> = { Low: 15, Medium: 30, High: 45 };
const demoTask = (
  id: string, task: string, type: 'Executive' | 'Emotional' | 'Social' | 'Physical', priority: 'High' | 'Medium' | 'Low',
  shipStage: 'Safety' | 'Habits' | 'Identity' | 'Purpose', action?: 'keep' | 'reduce' | 'delegate' | 'defer' | 'drop'
) => ({ id, task, type, priority, cost: SEVERITY_TO_COST[priority], shipStage, action, createdAt: new Date().toISOString() });

export const DEMO_PLANNED_TASKS = [
  demoTask('demo-t1', 'Finish the Q3 board deck', 'Executive', 'High', 'Safety'),
  demoTask('demo-t2', 'Mentor check-in with Priya', 'Social', 'Medium', 'Habits', 'keep'),
  demoTask('demo-t3', 'Reply to the vendor escalation thread', 'Executive', 'Medium', 'Safety', 'delegate'),
];

// Recovery Debt v2's sleep fixtures - three logged nights averaging a
// 1.5h shortfall, matching DEMO_STATS.debts's own Sleep Shortfall value
// above so the demo session tells one consistent story rather than two
// different numbers for the same thing.
export const DEMO_SLEEP_TARGET_HOURS = 8;
export const DEMO_SLEEP_NIGHTS: { date: string; hours: number }[] = [
  { date: "2026-09-19", hours: 6 },
  { date: "2026-09-20", hours: 6.5 },
  { date: "2026-09-21", hours: 7 },
];

// Section 8's optional "did that help?" history - four Somatic Reset
// ratings clearing computePreferredRecoveryAction's 3-rating floor and
// landing solidly above its positive-trend threshold, so the demo session
// shows the learned-preference chip ("Somatic Reset tends to help you")
// rather than leaving that part of the feature looking unfinished.
export const DEMO_RECOVERY_FEEDBACK: {
  id: string; actionType: RecoveryActionType; helpfulness: RecoveryHelpfulness; createdAt: string;
}[] = [
  { id: "demo-rf1", actionType: "somatic_reset", helpfulness: "a_lot", createdAt: "2026-09-18T12:00:00.000Z" },
  { id: "demo-rf2", actionType: "somatic_reset", helpfulness: "noticeably", createdAt: "2026-09-19T12:00:00.000Z" },
  { id: "demo-rf3", actionType: "guardian_ping", helpfulness: "a_little", createdAt: "2026-09-19T15:00:00.000Z" },
  { id: "demo-rf4", actionType: "somatic_reset", helpfulness: "a_lot", createdAt: "2026-09-20T12:00:00.000Z" },
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

// Matches SixtySecondCheckIn.tsx's own CheckInEntry shape (its
// voice_journal_entries Firestore subcollection - unchanged by the PR7
// rename, since existing user data already lives at that path) - what an
// already-analysed entry looks like, so a demo visitor can see the payoff
// without recording anything themselves. The real record-and-analyse flow
// (a live, paid Nova call) stays untouched and fully click-triggered -
// these are never fed into it, only rendered.
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
