// Pure logic for Blaze Break Enterprise's org-level connector admin - kept
// I/O-free and unit-tested, same pattern as org-rbac.ts and
// org-data-policy.ts. server.ts owns reading/writing the actual
// organisations/{orgId}/connectors/{id} documents; this file only defines
// what a connector type looks like, what a valid creation request looks
// like, and - critically - what status a freshly-created connector starts
// with, so nothing in this codebase can independently invent a fake
// "connected" status for a connector that never completed a real
// handshake.
//
// This deliberately reuses the same service identifiers as the existing
// per-USER OAuth integration registry (OAUTH_PROVIDERS in server.ts:
// slack, jira, asana, calendly, monday) - an org-level connector here is
// the org's own administrative record for one of those same external
// services, distinct from any individual member's personal OAuth
// connection to it. `local` is the one genuinely different type: a
// connector with no external service and therefore nothing to
// authenticate at all.

export interface OrgConnectorTypeConfig {
  displayName: string;
  // True for a connector with no external OAuth handshake to perform at
  // all (e.g. locally uploaded documents) - as opposed to a connector that
  // needs one but simply hasn't completed it yet.
  isLocal: boolean;
}

export const ORG_CONNECTOR_TYPES: Record<string, OrgConnectorTypeConfig> = {
  slack: { displayName: 'Slack', isLocal: false },
  jira: { displayName: 'Jira', isLocal: false },
  asana: { displayName: 'Asana', isLocal: false },
  calendly: { displayName: 'Calendly', isLocal: false },
  monday: { displayName: 'Monday.com', isLocal: false },
  local: { displayName: 'Local document upload', isLocal: true },
};

export const isKnownConnectorType = (type: unknown): type is keyof typeof ORG_CONNECTOR_TYPES =>
  typeof type === 'string' && Object.prototype.hasOwnProperty.call(ORG_CONNECTOR_TYPES, type);

export const CONNECTOR_STATUSES = ['active', 'disabled', 'revoked'] as const;
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export type ConnectorAuthStatus = 'not_connected' | 'connected' | 'error' | 'not_applicable';

// The auth status a brand-new connector starts with, and the only function
// in this codebase that decides it. A `local` connector has nothing to
// authenticate, so it is honestly `not_applicable` - never `connected`,
// since nothing was ever connected. Every other type requires a real OAuth
// handshake this backend does not yet perform at the org level (see
// docs/CONNECTOR_ADMIN.md for what that would take) - so it starts, and
// stays, `not_connected` until that handshake exists. No route anywhere
// should ever set a connector's authStatus to `connected` without that
// real handshake actually happening.
export const initialAuthStatus = (type: string): ConnectorAuthStatus => {
  const config = ORG_CONNECTOR_TYPES[type];
  if (!config) return 'not_connected';
  return config.isLocal ? 'not_applicable' : 'not_connected';
};

export interface ConnectorValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_DISPLAY_NAME_LENGTH = 200;
const MAX_TEAM_LABEL_LENGTH = 100;
const MAX_RESTRICTED_TEAMS = 50;

// Validates a proposed `restrictedToTeams` list (an optional narrowing of
// who can use this connector, expressed as the same free-text team labels
// already used by organisations/{orgId}.memberTeams). An absent or empty
// list means "not restricted" - available to every member with search
// access - which is a distinct, valid state from "restricted to zero
// teams" (which would make the connector unusable and is rejected as
// almost certainly a mistake).
const validateRestrictedTeams = (value: unknown): ConnectorValidationResult => {
  if (value === undefined) return { valid: true };
  if (!Array.isArray(value)) {
    return { valid: false, error: '"restrictedToTeams" must be an array of team names if provided.' };
  }
  if (value.length > MAX_RESTRICTED_TEAMS) {
    return { valid: false, error: `"restrictedToTeams" cannot list more than ${MAX_RESTRICTED_TEAMS} teams.` };
  }
  for (const team of value) {
    if (typeof team !== 'string' || team.trim().length === 0) {
      return { valid: false, error: '"restrictedToTeams" entries must be non-empty strings.' };
    }
    if (team.length > MAX_TEAM_LABEL_LENGTH) {
      return { valid: false, error: `"restrictedToTeams" entries must be ${MAX_TEAM_LABEL_LENGTH} characters or fewer.` };
    }
  }
  return { valid: true };
};

export const validateConnectorCreate = (input: unknown): ConnectorValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A connector object is required.' };
  }
  const candidate = input as Record<string, unknown>;
  if (!isKnownConnectorType(candidate.type)) {
    return { valid: false, error: `"type" must be one of: ${Object.keys(ORG_CONNECTOR_TYPES).join(', ')}.` };
  }
  if (typeof candidate.displayName !== 'string' || candidate.displayName.trim().length === 0) {
    return { valid: false, error: '"displayName" must be a non-empty string.' };
  }
  if (candidate.displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return { valid: false, error: `"displayName" must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.` };
  }
  return validateRestrictedTeams(candidate.restrictedToTeams);
};

// Whether the caller can see auth/config detail (which connector types are
// wired to real credentials, error detail) versus just the redacted
// status every connectors.view holder (including a viewer) can see.
// Nothing here is a secret today - no org-level OAuth handshake exists yet
// to produce one - but this is the seam that keeps it that way once one
// does: a future access-token/error-message field only ever gets attached
// to the object routes serve when this returns true.
export const canSeeConnectorDetail = (hasManagePermission: boolean): boolean => hasManagePermission;
