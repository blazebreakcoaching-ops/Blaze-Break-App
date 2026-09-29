import { secureApiFetch } from './secure-api';

// Fire-and-forget, privacy-preserving event logging for Faith & Values
// Grounding (section 20 of the Phase 2 brief) - mirrors
// logGuardianSupportEvent's exact shape and reasoning. Never throws into
// the caller: a failed analytics write must never block or visibly break
// the person's actual reflection flow. Event names and the optional
// category/lens are validated server-side against a fixed allowlist -
// there is no field here for free text, by construction.
export type GroundingEventType =
  | 'grounding_session_completed' | 'pattern_explored' | 'pattern_feedback_given'
  | 'community_connection_opened' | 'carrying_exercise_completed' | 'monthly_reflection_viewed'
  | 'aligned_action_created' | 'aligned_action_followed_up'
  | 'routine_completed' | 'routine_created';

export const logGroundingEvent = (
  eventType: GroundingEventType,
  extra?: { category?: string; lens?: string },
): void => {
  secureApiFetch('/api/grounding/analytics-event', {
    method: 'POST',
    data: { eventType, ...extra },
  }).catch(() => {
    // Non-fatal - analytics only.
  });
};
