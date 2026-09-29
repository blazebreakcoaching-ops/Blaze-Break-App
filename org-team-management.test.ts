import { describe, it, expect } from 'vitest';
import {
  managedTeamsFor,
  isTeamManager,
  isHrViewer,
  validateTeamAssignment,
  validateHrViewerList,
  computeQualifyingTeamGroups,
} from './org-team-management';

describe('managedTeamsFor / isTeamManager', () => {
  const teamManagers = { manager_1: ['Engineering', 'Design'], manager_2: ['Sales'] };

  it('returns the teams a manager is assigned, or an empty array for anyone else', () => {
    expect(managedTeamsFor(teamManagers, 'manager_1')).toEqual(['Engineering', 'Design']);
    expect(managedTeamsFor(teamManagers, 'stranger')).toEqual([]);
    expect(managedTeamsFor(null, 'manager_1')).toEqual([]);
    expect(managedTeamsFor(undefined, 'manager_1')).toEqual([]);
  });

  it('isTeamManager checks a specific team, not just any assignment', () => {
    expect(isTeamManager(teamManagers, 'manager_1', 'Engineering')).toBe(true);
    expect(isTeamManager(teamManagers, 'manager_1', 'Sales')).toBe(false);
    expect(isTeamManager(teamManagers, 'manager_2', 'Sales')).toBe(true);
    expect(isTeamManager(teamManagers, 'stranger', 'Engineering')).toBe(false);
  });
});

describe('isHrViewer', () => {
  it('checks membership in the allow-list', () => {
    expect(isHrViewer(['hr_1', 'hr_2'], 'hr_1')).toBe(true);
    expect(isHrViewer(['hr_1', 'hr_2'], 'someone_else')).toBe(false);
  });

  it('treats a missing or malformed list as nobody being an HR viewer', () => {
    expect(isHrViewer(null, 'hr_1')).toBe(false);
    expect(isHrViewer(undefined, 'hr_1')).toBe(false);
  });
});

describe('validateTeamAssignment', () => {
  const existingTeams = ['Engineering', 'Sales', 'Design'];

  it('accepts an assignment to teams that already exist', () => {
    expect(validateTeamAssignment({ teams: ['Engineering', 'Design'] }, existingTeams)).toEqual({ valid: true });
  });

  it('accepts an empty list (removing all managed-team assignments)', () => {
    expect(validateTeamAssignment({ teams: [] }, existingTeams)).toEqual({ valid: true });
  });

  it('rejects null, undefined, and non-object input', () => {
    expect(validateTeamAssignment(null, existingTeams).valid).toBe(false);
    expect(validateTeamAssignment(undefined, existingTeams).valid).toBe(false);
    expect(validateTeamAssignment('nope', existingTeams).valid).toBe(false);
  });

  it('rejects a non-array teams field', () => {
    expect(validateTeamAssignment({ teams: 'Engineering' }, existingTeams).valid).toBe(false);
  });

  it('rejects a team that no member is currently assigned to - there is no team-creation flow', () => {
    const res = validateTeamAssignment({ teams: ['Marketing'] }, existingTeams);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/Marketing/);
  });

  it('rejects an empty-string team entry', () => {
    expect(validateTeamAssignment({ teams: [''] }, existingTeams).valid).toBe(false);
  });

  it('rejects an implausibly long team list', () => {
    const many = Array.from({ length: 21 }, () => 'Engineering');
    expect(validateTeamAssignment({ teams: many }, existingTeams).valid).toBe(false);
  });
});

describe('validateHrViewerList', () => {
  it('accepts a valid list of uids', () => {
    expect(validateHrViewerList({ uids: ['hr_1', 'hr_2'] })).toEqual({ valid: true });
  });

  it('accepts an empty list', () => {
    expect(validateHrViewerList({ uids: [] })).toEqual({ valid: true });
  });

  it('rejects null, undefined, and non-object input', () => {
    expect(validateHrViewerList(null).valid).toBe(false);
    expect(validateHrViewerList(undefined).valid).toBe(false);
  });

  it('rejects a non-array uids field', () => {
    expect(validateHrViewerList({ uids: 'hr_1' }).valid).toBe(false);
  });

  it('rejects an empty-string uid entry', () => {
    expect(validateHrViewerList({ uids: [''] }).valid).toBe(false);
  });

  it('rejects an implausibly long list', () => {
    const many = Array.from({ length: 51 }, (_, i) => `hr_${i}`);
    expect(validateHrViewerList({ uids: many }).valid).toBe(false);
  });
});

describe('computeQualifyingTeamGroups', () => {
  it('groups consenting uids by team and keeps a team whose complement also clears the threshold', () => {
    // 6 total, team A has 3 (threshold), complement is the other 3 - also
    // clears the threshold, so team A is genuinely safe to show.
    const memberTeams = { u1: 'A', u2: 'A', u3: 'A', u4: 'B', u5: 'B', u6: 'B' };
    const result = computeQualifyingTeamGroups(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'], memberTeams, 3);
    expect(result.qualifying).toEqual({ A: ['u1', 'u2', 'u3'], B: ['u4', 'u5', 'u6'] });
  });

  it('a team below threshold is silently absent, not present with a locked flag', () => {
    const memberTeams = { u1: 'A', u2: 'B' };
    const result = computeQualifyingTeamGroups(['u1', 'u2'], memberTeams, 5);
    expect(Object.keys(result.qualifying)).toEqual([]);
  });

  // Re-identification-by-subtraction: a team that clears the threshold on
  // its own is still excluded if the rest of the org (its complement)
  // would fall below threshold - otherwise the excluded remainder's own
  // aggregate could be recovered by subtracting this team's snapshot from
  // the org-wide one, which any caller of this helper can also see.
  it('excludes a team whose complement would fall below threshold, even though the team itself clears it', () => {
    const memberTeams = { u1: 'A', u2: 'A', u3: 'A', u4: 'B' };
    const result = computeQualifyingTeamGroups(['u1', 'u2', 'u3', 'u4'], memberTeams, 3);
    expect(result.qualifying).toEqual({});
  });

  it('still includes a team that is the entire consenting population - no residual group to isolate', () => {
    const memberTeams = { u1: 'A', u2: 'A', u3: 'A' };
    const result = computeQualifyingTeamGroups(['u1', 'u2', 'u3'], memberTeams, 3);
    expect(result.qualifying).toEqual({ A: ['u1', 'u2', 'u3'] });
  });

  it('a consenting uid with no team label is simply not counted toward any team', () => {
    const memberTeams = { u1: 'A', u2: 'A' };
    const result = computeQualifyingTeamGroups(['u1', 'u2', 'u3_no_team'], memberTeams, 2);
    // Team A (2) clears the threshold, but its complement is the other 1
    // consenting member (the untagged u3_no_team) - below threshold, so A
    // is excluded too.
    expect(result.qualifying).toEqual({});
  });

  it('handles a missing memberTeams map without throwing', () => {
    expect(computeQualifyingTeamGroups(['u1', 'u2'], null, 2).qualifying).toEqual({});
    expect(computeQualifyingTeamGroups(['u1', 'u2'], undefined, 2).qualifying).toEqual({});
  });

  it('a non-consenting uid never appears, since only consentingUids is ever passed in', () => {
    // This is enforced by the caller (only consenting uids are ever passed),
    // but confirm the function itself does no additional filtering that
    // would hide the caller's mistake if it accidentally included one.
    const memberTeams = { u1: 'A', u2: 'A', not_consenting: 'A' };
    const result = computeQualifyingTeamGroups(['u1', 'u2'], memberTeams, 3);
    expect(result.qualifying.A).toBeUndefined(); // only 2 passed in, below threshold 3
  });
});
