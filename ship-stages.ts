// Pure data extracted from src/components/ShipJourney.tsx: the quest ids
// that define each SHIP stage, and the order stages progress in. Kept
// completely free of React/motion/lucide-react (that file's own
// display-only imports) so this one definition can be shared by both the
// frontend (ShipJourney's own render, App.tsx's badge-completion checks)
// and the backend (the resume-prompt route in server.ts, deriving which
// SHIP stage someone is genuinely mid-way through from their real
// committed quest ids) - never two lists that could silently drift apart.
//
// If a quest id ever changes in ShipJourney.tsx's SHIP_STAGES, it must be
// changed here too - this is the only place ids are duplicated rather than
// derived, a deliberate tradeoff to avoid pulling frontend-only
// dependencies into the server bundle. ship-stages.test.ts pins the exact
// expected ids as a tripwire against drift.

export type ShipStage = 'Safety' | 'Habits' | 'Identity' | 'Purpose';

export const SHIP_STAGE_ORDER: ShipStage[] = ['Safety', 'Habits', 'Identity', 'Purpose'];

export const SHIP_QUEST_IDS_BY_STAGE: Record<ShipStage, string[]> = {
  Safety: ['ship_safety_boundary_script', 'ship_safety_blame_reset', 'ship_safety_digital_blackout'],
  Habits: ['ship_habits_sleep_debt', 'ship_habits_movement_snack', 'ship_habits_checkin_streak'],
  Identity: ['ship_identity_reflect_action', 'ship_identity_fingerprint_recheck', 'ship_identity_resentment_log'],
  Purpose: ['ship_purpose_reality_check', 'ship_purpose_weekly_goal', 'ship_purpose_support_circle'],
};

// The single stage someone has genuinely started but not finished, if any -
// used by the resume-prompt route to decide whether "pick up your SHIP
// Journey" is honest to offer. Deliberately requires at least one quest
// already committed in that stage, not just "not all done": every stage
// always exists structurally, so a stage with zero progress isn't
// something to "resume" - flagging it as if it were would nag someone
// who's never engaged with that stage at all, which is exactly the kind of
// pressure this app's copy is built to avoid (see server.ts's resume-
// prompt route and its own "whenever you're ready" convention).
export const findInProgressShipStage = (committedActionIds: string[]): ShipStage | null => {
  for (const stage of SHIP_STAGE_ORDER) {
    const questIds = SHIP_QUEST_IDS_BY_STAGE[stage];
    const committedCount = questIds.filter((id) => committedActionIds.includes(id)).length;
    if (committedCount > 0 && committedCount < questIds.length) {
      return stage;
    }
  }
  return null;
};
