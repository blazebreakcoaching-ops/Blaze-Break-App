import { secureApiFetch } from './secure-api';

// Fire-and-forget, privacy-preserving event logging for Movement Snacks
// (section 28) - mirrors grounding-analytics.ts's exact shape and
// reasoning. Never throws into the caller: a failed analytics write must
// never block or visibly break the person's actual movement. Event names
// and the optional movementId/category are validated server-side against a
// fixed allowlist - there is no field here for free text, feedback value,
// or anything that could read as detailed wellbeing data (section 28's
// "avoid attaching unnecessary personal context").
export type MovementEventType =
  | 'movement_started' | 'movement_completed' | 'movement_skipped' | 'movement_feedback_selected';

export const logMovementEvent = (
  eventType: MovementEventType,
  extra?: { movementId?: string; category?: string },
): void => {
  secureApiFetch('/api/movement/analytics-event', {
    method: 'POST',
    data: { eventType, ...extra },
  }).catch(() => {
    // Non-fatal - analytics only.
  });
};
