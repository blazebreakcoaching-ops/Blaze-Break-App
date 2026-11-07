import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source-only regression assertions. These are NOT a substitute for
// mounting the real screen in a browser or testing API responses.
const ui = readFileSync('src/components/AdminDashboard.tsx', 'utf8');
const api = readFileSync('server.ts', 'utf8');

describe('super-admin workspaces and truthful account metadata', () => {
  it('groups the original 15 admin tools into five clear work areas', () => {
    for (const group of ['Overview', 'People & Companies', 'Operations', 'Security & Release', 'Insights']) {
      expect(ui).toContain(`label: '${group}'`);
    }
    expect(ui).toContain("const ADMIN_SECTIONS = [");
    expect(ui).toContain("const ADMIN_TABS = [");
    expect(ui).toContain('nav aria-label="Platform admin work areas"');
  });

  it('separates demo records from registered identities by default', () => {
    expect(ui).toContain("setAccountCategory] = useState<'all' | 'registered' | 'demo' | 'orphan'>('registered')");
    expect(ui).toContain('Demo / anonymous sessions');
    expect(ui).toContain('Account ID:');
    expect(api).toContain('isAnonymous: !authUser.email && !authUser.phoneNumber && authUser.providerData.length === 0');
  });

  it('shows registered identities, company membership and full latest sign-in timestamp', () => {
    expect(api).toContain('displayName: authUser.displayName || null');
    expect(api).toContain("organisationId: typeof doc.data()?.organisationId === 'string'");
    expect(api).toContain('lastSignIn: authUser.metadata.lastSignInTime');
    expect(ui).toContain('Last Sign-in');
    expect(ui).toContain('formatAdminDateTime(u.lastSignIn)');
    expect(ui).toContain('Last sign-in is not a full activity history.');
  });

  it('never displays a stale company detail response under a different company', () => {
    expect(ui).toContain('const requestId = ++orgDetailRequestId.current');
    expect(ui).toContain('if (requestId === orgDetailRequestId.current)');
    expect(ui).toContain('seatSummary: data.seatSummary');
  });

  it('shows incomplete executive data as unavailable instead of a pretend zero', () => {
    expect(api).toContain('dataAvailability');
    expect(api).toContain('totalUsersCount = null');
    expect(ui).toContain('Unknown values must not be treated as zero.');
  });
});
