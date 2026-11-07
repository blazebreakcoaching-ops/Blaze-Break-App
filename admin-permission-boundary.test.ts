import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static audit contracts only. Live Firebase/Express role tests remain required.
const server = readFileSync('server.ts', 'utf8');
const route = (name: string) => {
  const start = server.indexOf(name);
  if (start < 0) throw new Error('Route missing: ' + name);
  return server.slice(start, server.indexOf('\n});', start));
};

describe('granular Command Centre permission boundaries', () => {
  it('explicit roles cannot inherit full access through stale admin booleans', () => {
    const permission = server.slice(server.indexOf('const requirePermission ='), server.indexOf('// Opportunistic repair runs'));
    expect(permission).toContain('const isRolelessLegacyAdmin = !user.role');
    expect(permission).not.toContain('user.admin === true || isOwnerBootstrapEmail(user.email)');
    expect(permission).toContain('getPermissionsForRole(user.role)');
  });

  it('rejects stale owner flag when explicit non-owner role exists', () => {
    const ownerCheck = server.slice(server.indexOf('const isUserPlatformOwner'), server.indexOf('const requirePlatformOwner'));
    expect(ownerCheck).toContain('(!user.role && user.platformOwner === true)');
  });

  it('incident writes need safety.manage and deny with 403', () => {
    for (const name of [
      'app.post("/api/admin/incidents",',
      'app.post("/api/admin/incidents/:id/update",',
    ]) {
      expect(route(name)).toContain('requirePermission(req, "safety.manage")');
      expect(route(name)).toContain('res.status(403)');
    }
  });

  it('legal publishing needs settings.manage', () => {
    const published = route('app.post("/api/admin/legal/:docType/publish",');
    expect(published).toContain('requirePermission(req, "settings.manage")');
    expect(published).toContain('res.status(403)');
  });

  it('calendar pilot eligibility changes require platform owner', () => {
    const changed = route('app.post("/api/admin/users/:uid/calendar-protection-pilot-eligibility",');
    expect(changed).toContain('requirePlatformOwner(req)');
    expect(changed).toContain('res.status(403)');
  });

  it('admin and platform-owner roles carry safety.manage without granting content editors', () => {
    const roleMap = server.slice(server.indexOf('const getPermissionsForRole'), server.indexOf('const requirePermission'));
    expect(roleMap).toContain('"safety.manage"');
    expect(roleMap).toContain('case \'content_admin\':');
    expect(roleMap).toContain('return ["content.manage", "nova.manage"]');
  });
});
