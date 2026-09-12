// Pure logic for the team-welfare escalation acknowledgment log - kept
// I/O-free and unit-tested, same pattern as org-team-management.ts.
// server.ts owns reading/writing organisations/{orgId}/team_escalation_acks;
// this file only defines what a valid acknowledgment looks like and how to
// honestly describe a team's follow-up status from its ack history.
//
// This is deliberately a factual record, not a score. HR sees "acknowledged
// on [date]" or "no acknowledgment in the last N days" - never a computed
// grade on the manager. A manager clicking "log that I addressed this" is
// not independently verified (there's no way to confirm a real
// conversation happened), and this file makes no attempt to pretend
// otherwise - it just gives HR a real, checkable trail instead of nothing.

export interface AckValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_NOTE_LENGTH = 500;

export const validateAckInput = (input: unknown): AckValidationResult => {
  if (input === null || input === undefined) return { valid: true }; // note is optional
  if (typeof input !== 'object') {
    return { valid: false, error: 'If provided, the acknowledgment body must be an object.' };
  }
  const candidate = input as Record<string, unknown>;
  if (candidate.note !== undefined && candidate.note !== null) {
    if (typeof candidate.note !== 'string') {
      return { valid: false, error: '"note" must be a string if provided.' };
    }
    if (candidate.note.length > MAX_NOTE_LENGTH) {
      return { valid: false, error: `"note" must be ${MAX_NOTE_LENGTH} characters or fewer.` };
    }
  }
  return { valid: true };
};

export interface EscalationAck {
  team: string;
  acknowledgedBy: string;
  acknowledgedByEmail?: string | null;
  note?: string | null;
  createdAt: string;
}

export type FollowUpStatus = 'acknowledged' | 'no_recent_acknowledgment';

export interface FollowUpDescription {
  status: FollowUpStatus;
  lastAcknowledgedAt: string | null;
  lastAcknowledgedBy: string | null;
  note: string | null;
}

const DEFAULT_WINDOW_DAYS = 14;

// Given a team's ack history (any order) and "now", decides whether the
// most recent one counts as recent enough to call the team "acknowledged".
// This is the ONLY function that makes that call, so HR and any future
// caller always agree on what "acknowledged" means.
export const describeFollowUp = (
  acks: EscalationAck[],
  now: Date,
  windowDays: number = DEFAULT_WINDOW_DAYS
): FollowUpDescription => {
  const valid = acks.filter((a) => a && typeof a.createdAt === 'string' && !Number.isNaN(Date.parse(a.createdAt)));
  if (valid.length === 0) {
    return { status: 'no_recent_acknowledgment', lastAcknowledgedAt: null, lastAcknowledgedBy: null, note: null };
  }
  const mostRecent = valid.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const ageMs = now.getTime() - Date.parse(mostRecent.createdAt);
  const withinWindow = ageMs >= 0 && ageMs <= windowDays * 24 * 60 * 60 * 1000;
  return {
    status: withinWindow ? 'acknowledged' : 'no_recent_acknowledgment',
    lastAcknowledgedAt: mostRecent.createdAt,
    lastAcknowledgedBy: mostRecent.acknowledgedBy,
    note: mostRecent.note || null,
  };
};
