// Pure logic for the Positive Reinforcement Engine - suggests recognition
// prompts to an org admin/manager for the Blaze Bright Moments wall
// (OrgDashboardMoments.tsx / POST /api/org/:orgId/recognition).
//
// Deliberately conservative scope, matching nova-manager-coach.ts's own
// "transparent, explainable, not a trained model" posture. Nothing here
// decides WHO to recognise or posts anything on anyone's behalf - it only
// ever suggests text for a human to review, edit, or discard before the
// existing recognition-wall composer sends it.

// Every input here comes from Lane B (organisation work data: resolved
// debt items, intervention outcomes, the real meeting pressure signal),
// never from reading an individual's mood/body check-ins.
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
