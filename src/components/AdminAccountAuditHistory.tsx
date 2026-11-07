import React, { useEffect, useRef, useState } from 'react';
import { secureApiFetch } from '../lib/secure-api';

type AccountAuditEvent = {
  id: string;
  action: string;
  actorEmail: string | null;
  actorRole: string | null;
  createdAt: string | null;
  outcome: 'succeeded' | 'failed' | 'unrecorded';
  metadata: Record<string, string | number | boolean>;
};
type AccountAuditPage = { logs: AccountAuditEvent[]; nextCursor: string | null };

export function AdminAccountAuditHistory({ uid, revision = 0 }: { uid: string; revision?: number }) {
  const [events, setEvents] = useState<AccountAuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const generation = useRef(0);
  const lastRevision = useRef(revision);

  const load = async (page: string | null = null, previous: (string | null)[] = []) => {
    const current = ++generation.current;
    setPending(true);
    setError(null);
    try {
      const url = '/api/admin/accounts/' + encodeURIComponent(uid) + '/audit-history'
        + (page ? '?cursor=' + encodeURIComponent(page) : '');
      const res = await secureApiFetch(url);
      if (!res.ok) throw new Error(res.status === 403 ? 'Audit history access denied.'
        : 'Could not load account history.');
      const result = await res.json() as AccountAuditPage;
      if (generation.current !== current) return;
      setEvents(result.logs);
      setCursor(page);
      setNextCursor(result.nextCursor);
      setHistory(previous);
    } catch (cause) {
      if (generation.current === current) setError(cause instanceof Error ? cause.message : 'History unavailable.');
    } finally {
      if (generation.current === current) setPending(false);
    }
  };

  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, [uid]);
  useEffect(() => {
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    void load();
  }, [revision]);

  return <section aria-label="Account audit history" className="space-y-3 rounded-lg bg-surface p-3">
    <h5 className="text-sm font-semibold">Recorded account history</h5>
    <p className="text-xs text-text-muted">Administrative actions targeting this account, newest first. An empty ledger is not proof that no changes were made.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error} <button className="underline" type="button" onClick={() => void load(cursor, history)}>Retry</button></p>}
    {pending ? <p role="status" className="text-xs text-text-muted">Loading history…</p> : <>
      {!events.length && <p role="status" className="text-xs text-text-muted">No recorded actions on this page.</p>}
      <ol className="space-y-2">{events.map(event => <li key={event.id} className="border-b border-border pb-2 text-xs">
        <strong className="block">{event.action.replace(/_/g, ' ')}</strong>
        <span className="block text-text-muted">{event.actorEmail || 'Actor unavailable'} · {event.createdAt && Number.isFinite(Date.parse(event.createdAt)) ? new Date(event.createdAt).toLocaleString() : 'Time unavailable'}</span>
        <span className="block text-text-muted">Outcome: {event.outcome === 'unrecorded' ? 'Unknown' : event.outcome}</span>
        {Object.keys(event.metadata || {}).length > 0 && <span className="block text-text-muted">{Object.entries(event.metadata).map(([key, value]) => key + ': ' + value).join(', ')}</span>}
      </li>)}</ol>
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded border border-border px-3 py-1 text-xs disabled:opacity-40" disabled={!history.length} onClick={() => void load(history[history.length - 1], history.slice(0, -1))}>Previous</button>
        <button type="button" className="rounded border border-border px-3 py-1 text-xs disabled:opacity-40" disabled={!nextCursor} onClick={() => void load(nextCursor, [...history, cursor])}>Next</button>
      </div>
    </>}
  </section>;
}
