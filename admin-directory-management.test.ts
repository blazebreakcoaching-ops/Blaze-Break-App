import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Source-contract tests for the migration seam. They do not exercise React,
// Firebase emulator, live token refresh or the full end-to-end user journey.
const dashboard = readFileSync('src/components/AdminDashboard.tsx', 'utf8');
const directory = readFileSync('src/components/AdminPeopleDirectory.tsx', 'utf8');
const api = readFileSync('server.ts', 'utf8');

describe('People Directory account management integration — source checks', () => {
  it('reuses the existing account drawer and existing role, plan, suspend actions', () => {
    expect(dashboard).toContain('onManageAccount={(account: DirectoryUser) => openAccountDrawer(account as AdminUser)}');
    expect(dashboard).toContain('const openAccountDrawer = (u: AdminUser) =>');
    expect(dashboard).toContain('handleUpdateRole(selectedUser.uid)');
    expect(dashboard).toContain('handleGrantEntitlement(selectedUser.uid');
    expect(dashboard).toContain('handleToggleSuspend(pendingAction.uid');
    expect(directory).toContain('onClick={() => onManageAccount(account)}');
  });

  it('refreshes an out-of-page account by exact Auth lookup after every successful change', () => {
    expect(dashboard).toContain('const refreshManagedAccount = async (uid: string) =>');
    expect(dashboard).toContain('setDirectoryRefreshRevision(value => value + 1)');
    expect(dashboard).toContain('setSelectedUser(previous => previous?.uid === uid ? updated : previous)');
    const scope = dashboard.slice(dashboard.indexOf('const handleUpdateRole ='), dashboard.indexOf('const handleAddAdmin ='));
    expect(scope.match(/await refreshManagedAccount\(uid\)/g)).toHaveLength(3);
    expect(directory).toContain('void load(cursor, activeLookup, history)');
  });

  it('uses per-user account-switch isolation for drawer and directory', () => {
    expect(dashboard).toContain("key={authUser?.uid || 'signed-out'}");
    expect(dashboard).toContain('previousAdminUid.current !== currentUid');
    expect(dashboard).toContain('setSelectedUser(null)');
    expect(dashboard).toContain('setPendingAction(null)');
    expect(directory).toContain('generation.current += 1');
  });

  it('drives People and Plans tables from the current Auth directory page', () => {
    expect(dashboard).toContain('const filteredUsers = directoryPageUsers.filter(u =>');
    expect(dashboard).toContain('const rolesInView = Array.from(new Set(directoryPageUsers.map');
    expect(dashboard).toContain('onAccountsChange={receiveDirectoryPage}');
    expect(dashboard).toContain('of {directoryPageUsers.length} current-page accounts');
    expect(dashboard).toContain('Current Firebase page:');
    expect(dashboard).toContain('The access timeline uses a separately limited audit-log query');
    expect(directory).toContain('onAccountsChange?.(data.users)');
    expect(directory).toContain('compact = false');
  });

  it('does not preserve old directory rows across platform admin account changes', () => {
    expect(dashboard).toContain('previousAdminUid.current !== currentUid');
    expect(dashboard).toContain('setDirectoryPageUsers([])');
    expect(dashboard).toContain("key={authUser?.uid || 'signed-out'}");
  });

  it('does not fetch recovery fields or use unfounded global totals', () => {
    const route = api.slice(api.indexOf('app.get("/api/admin/directory"'), api.indexOf('app.get("/api/admin/users/:uid"'));
    expect(route).not.toContain('collection("recovery")');
    expect(route).toContain('total: null');
    expect(route).toContain('getUserByEmail(lookup)');
    expect(directory).toContain('No global total is inferred.');
  });
});
