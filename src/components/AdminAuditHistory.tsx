import React, { useEffect, useRef, useState } from 'react';
import { secureApiFetch } from '../lib/secure-api';

type AuditEvent = {
  id: string;
  actorUid: string | null; actorEmail: string | null; actorRole: string | null;
  targetUid: string | null; targetEmail: string | null;
  action: string; createdAt: string | null;
  outcome: 'succeeded' | 'failed' | 'unrecorded';
  metadata: Record<string, string | number | boolean>;
};
type AuditPage = { logs: AuditEvent[]; nextCursor: string | null; complete: boolean };
type HistoryFilter = { kind: 'action' | 'actor'; value: string } | null;
const filterQuery = (filter: HistoryFilter) => filter
  ? (filter.kind === 'action' ? 'action=' : 'actor=') + encodeURIComponent(filter.value) : '';
const displayDate = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString() : 'Time not recorded';

export function AdminAuditHistory({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [category, setCategory] = useState('all');
  // Exact search over the FULL history, enforced server-side.
  const [filter, setFilter] = useState<HistoryFilter>(null);
  const [filterKind, setFilterKind] = useState<'action' | 'actor'>('actor');
  const [filterInput, setFilterInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refreshMarker = useRef(refreshRevision);

  const load = async (next: string | null = null, previous: (string | null)[] = [], activeFilter: HistoryFilter = filter) => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const params = [next ? 'cursor=' + encodeURIComponent(next) : '', filterQuery(activeFilter)].filter(Boolean);
      const response = await secureApiFetch('/api/admin/audit-logs' + (params.length ? '?' + params.join('&') : ''));
      if (!response.ok) throw new Error(response.status === 429
        ? 'Audit requests are temporarily rate limited.' :
          response.status === 403 ? 'You do not have access to this audit trail.' :
          'Could not load audit records.');
      const page = await response.json() as AuditPage;
      if (request !== generation.current) return;
      setEvents(page.logs);
      setNextCursor(page.nextCursor);
      setCursor(next);
      setHistory(previous);
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Audit unavailable.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, []);
  useEffect(() => {
    if (refreshMarker.current === refreshRevision) return;
    refreshMarker.current = refreshRevision;
    void load();
  }, [refreshRevision]);

  const matching = category === 'all' ? events : events.filter(event =>
    category === 'access' ? /role|suspend|admin|member/.test(event.action) :
    category === 'plans' ? /entitlement|billing/.test(event.action) :
    category === 'company' ? /org|company|invite/.test(event.action) :
    /incident|release|flag|legal|privacy/.test(event.action));

  return <section aria-label="Administrative audit history" className="card p-5 sm:p-6 bg-surface border border-border rounded-2xl space-y-4">
    <div className="flex flex-wrap gap-3 items-start justify-between">
      <div>
        <h3 className="font-bold text-text-main">Audit Event Trail</h3>
        <p className="text-xs text-text-muted">Operational events, newest first. History is paginated. An unrecorded outcome does not establish success.</p>
      </div>
      <select aria-label="Filter audit page by category" value={category} onChange={event => setCategory(event.target.value)}
        className="border border-border rounded-lg bg-background px-3 py-2 text-sm">
        <option value="all">All on this page</option>
        <option value="access">Role and access</option>
        <option value="plans">Plans and billing</option>
        <option value="company">Companies and invitations</option>
        <option value="operations">Other operations</option>
      </select>
    </div>
    <form className="flex flex-wrap gap-2 items-end" onSubmit={event => {
      event.preventDefault();
      const value = filterInput.trim();
      if (!value) return;
      const next: HistoryFilter = { kind: filterKind, value: filterKind === 'action' ? value.toLowerCase().replace(/\s+/g, '_') : value };
      setFilter(next);
      void load(null, [], next);
    }}>
      <label className="text-xs text-text-muted flex flex-col gap-1">Search full history by
        <select aria-label="Search full history by" value={filterKind} onChange={event => setFilterKind(event.target.value as 'action' | 'actor')}
          className="border border-border rounded-lg bg-background px-3 py-2 text-sm">
          <option value="actor">Administrator (email or UID)</option>
          <option value="action">Exact action (e.g. suspend_user)</option>
        </select>
      </label>
      <input aria-label="Audit search value" value={filterInput} onChange={event => setFilterInput(event.target.value)}
        placeholder={filterKind === 'actor' ? 'admin@example.com' : 'update_user_role'}
        className="border border-border rounded-lg bg-background px-3 py-2 text-sm min-w-[14rem]" />
      <button type="submit" className="border border-border rounded-lg px-3 py-2 text-xs font-bold">Search</button>
      {filter && <button type="button" className="underline text-xs" onClick={() => { setFilter(null); setFilterInput(''); void load(null, [], null); }}>Clear search</button>}
    </form>
    {filter && <p role="status" className="text-xs text-text-main">Showing all history where {filter.kind === 'actor' ? 'the administrator is' : 'the action is'} <strong>{filter.value}</strong>.</p>}
    <p className="text-xs text-text-muted">Category filters apply only to this page of results; use Search for the full history.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => void load(cursor, history)}>Retry</button></p>}
    {loading ? <p role="status" className="text-sm text-text-muted">Loading audit records…</p> : <>
      <p className="text-xs text-text-muted">Showing {matching.length} matching events from {events.length} records on this page.</p>
      <ol className="space-y-2">
        {matching.map(event => <li key={event.id} className="rounded-xl border border-border bg-background p-3 text-sm space-y-1">
          <div className="flex justify-between gap-3 flex-wrap">
            <strong className="text-text-main">{event.action.replace(/_/g, ' ')}</strong>
            <span className="text-xs text-text-muted">{displayDate(event.createdAt)}</span>
          </div>
          <p className="text-xs text-text-muted">By: {event.actorEmail || event.actorUid || 'Actor not recorded'} ({event.actorRole || 'role unknown'})</p>
          <p className="text-xs text-text-muted">Target: {event.targetEmail || event.targetUid || 'not specified'}</p>
          <p className="text-xs text-text-muted">Recorded outcome: {event.outcome === 'unrecorded' ? 'Unknown (legacy event)' : event.outcome}</p>
          {Object.keys(event.metadata || {}).length > 0 && <p className="text-xs text-text-muted">Details: {Object.entries(event.metadata).map(([key, value]) => key + ': ' + String(value)).join(', ')}</p>}
        </li>)}
      </ol>
      {!matching.length && <p role="status" className="text-sm text-text-muted">{filter && category === 'all' && !nextCursor && !history.length
        ? 'No events match this search in the full history.'
        : 'No matching events on this page. Other pages may contain results.'}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="border border-border rounded-lg px-3 py-2 text-xs disabled:opacity-40" disabled={!history.length} onClick={() => void load(history[history.length - 1], history.slice(0, -1))}>Previous</button>
        <button type="button" className="border border-border rounded-lg px-3 py-2 text-xs disabled:opacity-40" disabled={!nextCursor} onClick={() => void load(nextCursor, [...history, cursor])}>Next</button>
      </div>
    </>}
    <p className="text-xs text-text-muted">An audit write may fail after an action succeeds; this ledger alone cannot prove completeness. Contact operations when a required event is missing.</p>
  </section>;
}
