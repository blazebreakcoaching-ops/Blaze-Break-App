// Pure logic for the Positive Reinforcement Engine - suggests recognition
// prompts to an org admin/manager for the Blaze Bright Moments wall
// (OrgDashboardMoments.tsx / POST /api/org/:orgId/recognition).
//
// Deliberately conservative scope, matching org-risk-trend.ts's own
// "transparent, explainable, not a trained model" posture: the only
// input is an already k-anonymity-gated engagement-rate percentage (see
// GET /api/org/:orgId/recognition-suggestions in server.ts), never a
// named individual or anything below the org's configured cohort
// threshold. Nothing here decides WHO to recognise or posts anything on
// anyone's behalf - it only ever suggests text for a human to review,
// edit, or discard before the existing recognition-wall composer sends it.

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
