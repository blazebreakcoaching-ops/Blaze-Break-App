import { describe, it, expect } from 'vitest';
import {
  canAccessResource,
  searchOrgResources,
  validateResourceCreate,
  SearchableResource,
  SearchRequester,
} from './org-search';

const baseResource: SearchableResource = {
  id: 'r1',
  title: 'Q3 Burnout Risk Report',
  contentType: 'document',
  sourceConnectorId: 'slack_conn_1',
  chunkText: 'This report covers Q3 burnout risk trends across the engineering org.',
  keywords: ['burnout', 'risk', 'q3'],
  aclUids: [],
  aclRoles: [],
  aclTeams: [],
  indexedAt: '2026-07-01T00:00:00.000Z',
  indexStatus: 'indexed',
};

const requester = (overrides: Partial<SearchRequester> = {}): SearchRequester => ({
  uid: 'user_1',
  role: 'member',
  team: null,
  ...overrides,
});

describe('canAccessResource — the actual security boundary', () => {
  it('an unrestricted resource (no ACL entries at all) is visible to anyone', () => {
    expect(canAccessResource(baseResource, requester())).toBe(true);
    expect(canAccessResource(baseResource, requester({ role: 'viewer' }))).toBe(true);
  });

  it('a viewer never sees a security_admin-only resource', () => {
    const restricted: SearchableResource = { ...baseResource, aclRoles: ['security_admin'] };
    expect(canAccessResource(restricted, requester({ role: 'viewer' }))).toBe(false);
    expect(canAccessResource(restricted, requester({ role: 'security_admin' }))).toBe(true);
  });

  it('a Team A member never sees a Team B-only resource', () => {
    const restricted: SearchableResource = { ...baseResource, aclTeams: ['Team B'] };
    expect(canAccessResource(restricted, requester({ team: 'Team A' }))).toBe(false);
    expect(canAccessResource(restricted, requester({ team: 'Team B' }))).toBe(true);
  });

  it('a requester with no team assigned cannot see a team-restricted resource', () => {
    const restricted: SearchableResource = { ...baseResource, aclTeams: ['Team B'] };
    expect(canAccessResource(restricted, requester({ team: null }))).toBe(false);
  });

  it('a specific uid grant overrides role/team restrictions being absent for that user', () => {
    const restricted: SearchableResource = { ...baseResource, aclUids: ['user_1'], aclRoles: ['owner'] };
    expect(canAccessResource(restricted, requester({ uid: 'user_1', role: 'viewer' }))).toBe(true);
  });

  it('a user matching none of the specified grants is denied even if some ACL dimensions are set', () => {
    const restricted: SearchableResource = { ...baseResource, aclUids: ['someone_else'], aclRoles: ['owner'], aclTeams: ['Team X'] };
    expect(canAccessResource(restricted, requester({ uid: 'user_1', role: 'member', team: 'Team Y' }))).toBe(false);
  });

  it('matching ANY one specified grant is sufficient (inclusive OR across dimensions)', () => {
    const restricted: SearchableResource = { ...baseResource, aclUids: ['someone_else'], aclRoles: ['owner'], aclTeams: ['Team Y'] };
    expect(canAccessResource(restricted, requester({ uid: 'user_1', role: 'member', team: 'Team Y' }))).toBe(true);
  });
});

describe('searchOrgResources — ACL is enforced unconditionally before query matching', () => {
  it('a matching resource the requester cannot access is excluded, not just deprioritized', () => {
    const restricted: SearchableResource = { ...baseResource, aclRoles: ['owner'] };
    const results = searchOrgResources([restricted], requester({ role: 'viewer' }), 'burnout');
    expect(results).toEqual([]);
  });

  it('a matching, permitted resource is returned', () => {
    const results = searchOrgResources([baseResource], requester(), 'burnout');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('r1');
  });

  it('only indexed resources are ever searchable - pending or errored resources are excluded', () => {
    const pending: SearchableResource = { ...baseResource, id: 'r2', indexStatus: 'pending' };
    const errored: SearchableResource = { ...baseResource, id: 'r3', indexStatus: 'error' };
    const results = searchOrgResources([baseResource, pending, errored], requester(), 'burnout');
    expect(results.map((r) => r.id)).toEqual(['r1']);
  });

  it('an org B resource is simply never present in the input - this function has no cross-org logic to bypass', () => {
    // Simulates the caller (server.ts) correctly scoping resources to one org's
    // Firestore subcollection - this function only ever sees what it's handed.
    const orgBResource: SearchableResource = { ...baseResource, id: 'org_b_r1', title: 'Org B secret doc' };
    const results = searchOrgResources([orgBResource], requester(), 'Org B secret');
    // Access is still governed by ACL, not orgId, since this function has none -
    // this documents that org-scoping is the CALLER's responsibility.
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('org_b_r1');
  });

  it('an empty query returns every permitted, indexed resource', () => {
    const second: SearchableResource = { ...baseResource, id: 'r2', title: 'Unrelated doc', keywords: [], chunkText: 'nothing to do with the first one' };
    const results = searchOrgResources([baseResource, second], requester(), '');
    expect(results.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('requires every query token to match (AND across tokens)', () => {
    expect(searchOrgResources([baseResource], requester(), 'burnout engineering').length).toBe(1);
    expect(searchOrgResources([baseResource], requester(), 'burnout nonexistentword').length).toBe(0);
  });

  it('matches case-insensitively', () => {
    expect(searchOrgResources([baseResource], requester(), 'BURNOUT').length).toBe(1);
  });

  it('matches against keywords even if the exact phrase is not in the title or body', () => {
    const kw: SearchableResource = { ...baseResource, id: 'r4', title: 'Weekly sync notes', chunkText: 'General notes.', keywords: ['confidential-project-x'] };
    expect(searchOrgResources([kw], requester(), 'confidential-project-x').length).toBe(1);
  });

  it('filters by sourceConnectorId', () => {
    const other: SearchableResource = { ...baseResource, id: 'r5', sourceConnectorId: 'jira_conn_1' };
    const results = searchOrgResources([baseResource, other], requester(), 'burnout', { sourceConnectorId: 'jira_conn_1' });
    expect(results.map((r) => r.id)).toEqual(['r5']);
  });

  it('filters by contentType', () => {
    const other: SearchableResource = { ...baseResource, id: 'r6', contentType: 'ticket' };
    const results = searchOrgResources([baseResource, other], requester(), 'burnout', { contentType: 'ticket' });
    expect(results.map((r) => r.id)).toEqual(['r6']);
  });

  it('filters by date range on indexedAt', () => {
    const older: SearchableResource = { ...baseResource, id: 'r7', indexedAt: '2026-01-01T00:00:00.000Z' };
    const results = searchOrgResources([baseResource, older], requester(), 'burnout', { dateFrom: '2026-06-01T00:00:00.000Z' });
    expect(results.map((r) => r.id)).toEqual(['r1']);
  });

  it('never includes raw chunkText beyond the truncated snippet length', () => {
    const long: SearchableResource = { ...baseResource, id: 'r8', chunkText: 'x'.repeat(1000) };
    const results = searchOrgResources([long], requester(), '');
    const item = results.find((r) => r.id === 'r8')!;
    expect(item.snippet.length).toBeLessThanOrEqual(501);
  });
});

describe('validateResourceCreate', () => {
  const valid = { title: 'Doc', contentType: 'document', chunkText: 'Some content here.' };

  it('accepts a minimal valid resource', () => {
    expect(validateResourceCreate(valid)).toEqual({ valid: true });
  });

  it('accepts a fully-specified resource', () => {
    expect(validateResourceCreate({
      ...valid,
      keywords: ['a', 'b'],
      aclUids: ['u1'],
      aclRoles: ['owner', 'viewer'],
      aclTeams: ['Team A'],
      sourceConnectorId: 'conn_1',
    })).toEqual({ valid: true });
  });

  it('rejects null, undefined, and non-object input', () => {
    expect(validateResourceCreate(null).valid).toBe(false);
    expect(validateResourceCreate(undefined).valid).toBe(false);
    expect(validateResourceCreate('nope').valid).toBe(false);
  });

  it('rejects a missing or empty title/contentType/chunkText', () => {
    expect(validateResourceCreate({ contentType: 'document', chunkText: 'x' }).valid).toBe(false);
    expect(validateResourceCreate({ title: '  ', contentType: 'document', chunkText: 'x' }).valid).toBe(false);
    expect(validateResourceCreate({ title: 'Doc', chunkText: 'x' }).valid).toBe(false);
    expect(validateResourceCreate({ title: 'Doc', contentType: 'document', chunkText: '' }).valid).toBe(false);
  });

  it('rejects an overlong title or chunkText', () => {
    expect(validateResourceCreate({ ...valid, title: 'x'.repeat(301) }).valid).toBe(false);
    expect(validateResourceCreate({ ...valid, chunkText: 'x'.repeat(20001) }).valid).toBe(false);
  });

  it('rejects a non-array keywords/aclUids/aclTeams', () => {
    expect(validateResourceCreate({ ...valid, keywords: 'not-array' }).valid).toBe(false);
    expect(validateResourceCreate({ ...valid, aclUids: 'not-array' }).valid).toBe(false);
    expect(validateResourceCreate({ ...valid, aclTeams: 'not-array' }).valid).toBe(false);
  });

  it('rejects an invalid aclRoles entry', () => {
    expect(validateResourceCreate({ ...valid, aclRoles: ['not_a_role'] }).valid).toBe(false);
  });

  it('rejects a non-string, non-null sourceConnectorId', () => {
    expect(validateResourceCreate({ ...valid, sourceConnectorId: 42 }).valid).toBe(false);
  });

  it('accepts a null sourceConnectorId', () => {
    expect(validateResourceCreate({ ...valid, sourceConnectorId: null }).valid).toBe(true);
  });
});
