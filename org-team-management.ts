// Pure logic for team-manager and HR-viewer designation - kept I/O-free and
// unit-tested, same pattern as org-rbac.ts. server.ts owns reading/writing
// the actual organisations/{orgId}.teamManagers and .hrViewerUids fields;
// this file only defines validation and the lookups every route needs.
//
// Deliberately NOT part of org-rbac.ts's OrgRole/ORG_PERMISSIONS table.
// "Manages team X" and "is an HR viewer" are orthogonal to a member's
// org-wide role - a plain `member` can manage a team, and being `admin`
// doesn't automatically make someone an HR viewer. Bolting either concept
// onto the flat, already-tested org-wide role table would mean fighting
// its shape (that table has no notion of per-team scope at all) rather
// than fitting genuinely different data: a small, explicit allow-list
// each org owner/admin curates by hand.

// Keyed by manager uid (not by team) so "what can this caller see" - the
// operation every dashboard request performs - is an O(1) lookup rather
// than a scan over every team.
export type TeamManagers = Record<string, string[]>;

export const managedTeamsFor = (teamManagers: TeamManagers | null | undefined, uid: string): string[] =>
  teamManagers?.[uid] || [];

export const isTeamManager = (teamManagers: TeamManagers | null | undefined, uid: string, team: string): boolean =>
  managedTeamsFor(teamManagers, uid).includes(team);

export const isHrViewer = (hrViewerUids: string[] | null | undefined, uid: string): boolean =>
  Array.isArray(hrViewerUids) && hrViewerUids.includes(uid);

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const MAX_TEAMS_PER_MANAGER = 20;
const MAX_HR_VIEWERS = 50;

// A member can only be designated manager of a team that actual members
// are already assigned to (via memberTeams) - there's no separate
// team-creation flow in this app (memberTeams is genuinely the only place
// "team" exists at all), so `existingTeams` is the full set of team
// labels currently in use, and every requested team must be one of them.
export const validateTeamAssignment = (input: unknown, existingTeams: readonly string[]): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'A team assignment object is required.' };
  }
  const candidate = input as Record<string, unknown>;
  if (!Array.isArray(candidate.teams)) {
    return { valid: false, error: '"teams" must be an array of team names.' };
  }
  if (candidate.teams.length > MAX_TEAMS_PER_MANAGER) {
    return { valid: false, error: `A manager cannot be assigned more than ${MAX_TEAMS_PER_MANAGER} teams.` };
  }
  const existingSet = new Set(existingTeams);
  for (const team of candidate.teams) {
    if (typeof team !== 'string' || team.trim().length === 0) {
      return { valid: false, error: '"teams" entries must be non-empty strings.' };
    }
    if (!existingSet.has(team)) {
      return { valid: false, error: `"${team}" is not a team any member is currently assigned to.` };
    }
  }
  return { valid: true };
};

export const validateHrViewerList = (input: unknown): ValidationResult => {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'An HR viewer list object is required.' };
  }
  const candidate = input as Record<string, unknown>;
  if (!Array.isArray(candidate.uids)) {
    return { valid: false, error: '"uids" must be an array of user ids.' };
  }
  if (candidate.uids.length > MAX_HR_VIEWERS) {
    return { valid: false, error: `Cannot list more than ${MAX_HR_VIEWERS} HR viewers.` };
  }
  if (candidate.uids.some((uid) => typeof uid !== 'string' || uid.trim().length === 0)) {
    return { valid: false, error: '"uids" entries must be non-empty strings.' };
  }
  return { valid: true };
};

// ---- Shared k-anonymity helper, extracted from the existing risk-trend
// route so both it and the new team-dashboard/hr-dashboard routes apply
// the identical rule rather than two copies drifting apart. ----

export interface QualifyingTeamGroups {
  // Every team with at least `threshold` consenting members - the only
  // teams any aggregate view is ever allowed to expose.
  qualifying: Record<string, string[]>;
}

// Groups already-consenting uids by their memberTeams label, then keeps
// only the teams that independently clear the same k-anonymity threshold
// the org as a whole is held to. A team under threshold is simply absent
// from the result - never returned as "locked", since naming a small team
// as locked would itself reveal more about its size than this feature
// should ever expose (the same reasoning the original risk-trend route
// was built on).
export const computeQualifyingTeamGroups = (
  consentingUids: string[],
  memberTeams: Record<string, string> | null | undefined,
  threshold: number
): QualifyingTeamGroups => {
  const teams = memberTeams || {};
  const groups: Record<string, string[]> = {};
  consentingUids.forEach((uid) => {
    const team = teams[uid];
    if (team) {
      if (!groups[team]) groups[team] = [];
      groups[team].push(uid);
    }
  });
  const qualifying: Record<string, string[]> = {};
  Object.entries(groups).forEach(([team, uids]) => {
    if (uids.length >= threshold) qualifying[team] = uids;
  });
  return { qualifying };
};
