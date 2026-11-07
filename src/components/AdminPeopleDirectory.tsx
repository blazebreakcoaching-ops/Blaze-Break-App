import React, { useEffect, useRef, useState } from 'react';
import { secureApiFetch } from '../lib/secure-api';

export type DirectoryUser = {
  uid: string; email: string | null; displayName: string | null;
  organisationId: string | null; emailVerified: boolean; isAnonymous: boolean;
  createdAt: string | null; lastSignIn: string | null; accessStatus: string;
  role: string; plan: string; profilePresent: boolean;
  entitlementStatus?: 'active' | 'trial' | 'grace' | 'past_due' | 'cancelled' | 'expired';
  storedPlan?: 'free' | 'core' | 'performance' | 'executive' | 'legacy_premium';
  billingSource?: 'stripe' | 'apple' | 'google' | 'organisation' | 'admin' | null;
  entitlementEnd?: string | null; cancelAtPeriodEnd?: boolean; lastVerifiedAt?: string | null;
};
type DirectoryResponse = {
  users: DirectoryUser[]; nextCursor: string | null; pageSize: number;
  lookup: boolean; total: null;
};
const dateOrUnknown = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString() : 'Not recorded';

/** Auth-authoritative account browser. Never uses customer wellbeing fields. */
export function AdminPeopleDirectory({ onManageAccount, refreshRevision = 0 }: {
  onManageAccount: (account: DirectoryUser) => void;
  refreshRevision?: number;
}) {
  const [accounts, setAccounts] = useState<DirectoryUser[]>([]);
  const [lookupInput, setLookupInput] = useState('');
  const [activeLookup, setActiveLookup] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const lastRefreshRevision = useRef(refreshRevision);
  const load = async (page: string | null = null, exact = '', previous: (string | null)[] = []) => {
    const current = ++generation.current;
    setPending(true);
    setError(null);
    try {
      const parameters = new URLSearchParams();
      if (exact) parameters.set('lookup', exact);
      else if (page) parameters.set('cursor', page);
      const url = '/api/admin/directory' + (parameters.toString() ? '?' + parameters.toString() : '');
      const response = await secureApiFetch(url);
      if (!response.ok) throw new Error(response.status === 429
        ? 'Too many requests. Try again shortly.' : 'Account directory unavailable.');
      const data = await response.json() as DirectoryResponse;
      if (current !== generation.current) return;
      setAccounts(data.users);
      setNextCursor(data.nextCursor);
      setCursor(page);
      setHistory(previous);
      setActiveLookup(exact);
    } catch (err) {
      if (current === generation.current) setError(err instanceof Error ? err.message : 'Directory unavailable.');
    } finally {
      if (current === generation.current) setPending(false);
    }
  };
  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, []);
  useEffect(() => {
    if (lastRefreshRevision.current === refreshRevision) return;
    lastRefreshRevision.current = refreshRevision;
    void load(cursor, activeLookup, history);
  }, [refreshRevision]);
  return <section aria-label="Full account directory" className="rounded-2xl border border-border bg-surface p-4 sm:p-6 space-y-4">
    <div className="space-y-1">
      <h3 className="font-bold text-text-main">Account Directory — Firebase</h3>
      <p className="text-xs text-text-muted">Browse every account page by page, including accounts without a Firestore profile. For a person not on this page, search their complete email or account ID. Counts below are page-only.</p>
    </div>
    <form className="flex flex-wrap gap-2" onSubmit={event => {
      event.preventDefault(); if (lookupInput.trim()) void load(null, lookupInput.trim());
    }}>
      <input aria-label="Exact account email or UID" className="flex-1 min-w-[210px] rounded-lg border border-border bg-background px-3 py-2 text-sm"
        placeholder="Exact email or account ID" value={lookupInput} onChange={e => setLookupInput(e.target.value)} />
      <button type="submit" disabled={pending || !lookupInput.trim()} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Find account</button>
      <button type="button" disabled={pending} onClick={() => { setLookupInput(''); void load(); }} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">Clear</button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" onClick={() => void load(cursor, activeLookup, history)} className="underline">Retry</button></p>}
    {pending ? <p role="status" className="text-sm text-text-muted">Loading accounts…</p> : <>
      <p className="text-xs text-text-muted">{activeLookup ? 'Exact lookup' : 'Current page'}: {accounts.length} account(s). No global total is inferred.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3">Account</th><th scope="col" className="py-2 pr-3">Company</th>
            <th scope="col" className="py-2 pr-3">Access</th><th scope="col" className="py-2 pr-3">Created</th><th scope="col" className="py-2 pr-3">Last sign-in</th><th scope="col" className="py-2">Manage</th>
          </tr></thead>
          <tbody>{accounts.map(account => <tr key={account.uid} className="border-b border-border">
            <td className="py-3 pr-3">
              <span className="block font-semibold">{account.displayName || account.email || (account.isAnonymous ? 'Demo account' : 'No linked email')}</span>
              <span className="block text-xs text-text-muted">{account.email || 'No email'} · {account.uid}</span>
              {!account.profilePresent && <span className="block text-xs text-warning">Profile missing — reconcile</span>}
              {account.email && !account.emailVerified && <span className="block text-xs text-warning">Unverified email</span>}
            </td><td className="py-3 pr-3">{account.organisationId || 'None'}</td>
            <td className="py-3 pr-3">{account.accessStatus} · {account.role} · {account.plan}</td>
            <td className="py-3 pr-3 whitespace-nowrap">{dateOrUnknown(account.createdAt)}</td>
            <td className="py-3 pr-3 whitespace-nowrap">{dateOrUnknown(account.lastSignIn)}</td>
            <td className="py-3"><button type="button" aria-label={`Manage ${account.email || account.uid}`}
              onClick={() => onManageAccount(account)} className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20">
              Manage
            </button></td>
          </tr>)}</tbody>
        </table>
        {!accounts.length && <p role="status" className="py-5 text-sm text-text-muted">No account found in this result.</p>}
      </div>
      {!activeLookup && <div className="flex justify-end gap-2">
        <button type="button" disabled={!history.length} onClick={() => void load(history[history.length - 1], '', history.slice(0, -1))} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Previous</button>
        <button type="button" disabled={!nextCursor} onClick={() => void load(nextCursor, '', [...history, cursor])} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40">Next</button>
      </div>}
    </>}
    <p className="text-xs text-text-muted">Manage opens the existing account controls for this Firebase account, even if it is beyond the first 100 Firestore records. The legacy list below still has its own limit.</p>
  </section>;
}
