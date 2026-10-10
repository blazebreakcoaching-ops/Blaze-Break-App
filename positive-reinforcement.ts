// Pure logic for the Positive Reinforcement Engine - suggests recognition
// prompts to an org admin/manager for the Blaze Bright Moments wall
// (OrgDashboardMoments.tsx / POST /api/org/:orgId/recognition).
//
// Deliberately conservative scope, matching org-risk-trend.ts's own
// "transparent, explainable, not a trained model" posture. Nothing here
// decides WHO to recognise or posts anything on anyone's behalf - it only
// ever suggests text for a human to review, edit, or discard before the
// existing recognition-wall composer sends it.

// Legacy, engagement-rate-based variant. Deprecated: engagementRate was
// derived by reading mood_pulses/body_checkins across members, which the
// Work Design Pulse privacy architecture no longer permits from an
// organisation-scoped route (Lane A - the Private Recovery Vault - must be
// server-side unreachable by organisation code, not just aggregated).
// Kept only for GET /api/org/:orgId/manager-coach/chat's
// get_engagement_and_recognition_signal tool until that tool is replaced;
// GET /api/org/:orgId/recognition-suggestions itself now calls
// suggestStructuralRecognitionPrompts below instead.
export interface EngagementSnapshot {
  engagementRate: number; // 0-100
}

// A change smaller than this is treated as noise, not a real shift -
// same reasoning and threshold as org-risk-trend.ts's STABLE_THRESHOLD.
const NOTABLE_DELTA = 5;
const HIGH_ENGAGEMENT = 70;

export const suggestRecognitionPrompts = (
  current: EngagementSnapshot,
  previous: EngagementSnapshot | null
): string[] => {
  const suggestions: string[] = [];
  const delta = previous ? current.engagementRate - previous.engagementRate : null;

  if (delta !== null && delta >= NOTABLE_DELTA) {
    suggestions.push(
      `More of your team showed up for themselves this week — engagement is up ${delta} points. A good moment to say so.`
    );
  }

  if (current.engagementRate >= HIGH_ENGAGEMENT) {
    suggestions.push(
      "Engagement is solid across the team right now. A specific, genuine thank-you lands better than a general one — call out something real."
    );
  }

  if (delta !== null && delta <= -NOTABLE_DELTA) {
    suggestions.push(
      "Engagement has dipped a little this week. Recognition works best alongside lowering pressure, not instead of it — worth considering both."
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Consistent small wins are easy to miss precisely because they're consistent. Worth noticing one out loud this week."
    );
  }

  return suggestions.slice(0, 3);
};

// Work Design Pulse variant - the real replacement for the engagement-rate
// version above. Every input here comes from Lane B (organisation work
// data: resolved debt items, intervention outcomes, the real meeting
// pressure signal), never from reading an individual's mood/body check-ins.
export interface StructuralRecognitionSignals {
  // Work Design Debt items that moved to 'resolved' in roughly the last
  // 7 days - a real structural change, not a wellbeing score.
  debtResolvedThisWeek: number;
  // Intervention trials whose outcome was rated 'useful' or
  // 'partly_useful' in roughly the last 7 days.
  usefulInterventionOutcomesThisWeek: number;
  // The org-wide Meeting Pressure band right now, or null when the
  // calendar-connected cohort isn't big enough to say.
  meetingPressureBand: 'low' | 'typical' | 'elevated' | 'sustained' | null;
}

export const suggestStructuralRecognitionPrompts = (
  signals: StructuralRecognitionSignals
): string[] => {
  const suggestions: string[] = [];

  if (signals.debtResolvedThisWeek > 0) {
    suggestions.push(
      signals.debtResolvedThisWeek === 1
        ? "A Work Design Debt item was resolved this week. Worth telling the team what actually changed, not just that it's closed."
        : `${signals.debtResolvedThisWeek} Work Design Debt items were resolved this week. Worth telling the team what actually changed.`
    );
  }

  if (signals.usefulInterventionOutcomesThisWeek > 0) {
    suggestions.push(
      "A structural change trial was rated genuinely useful this week. Worth recognising the manager and team who tried it, specifically."
    );
  }

  if (signals.meetingPressureBand === 'low') {
    suggestions.push(
      "Meeting load is reading low for the team right now. A good moment to name something specific that's going well, rather than a general thank-you."
    );
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Consistent small wins are easy to miss precisely because they're consistent. Worth noticing one out loud this week."
    );
  }

  return suggestions.slice(0, 3);
};
