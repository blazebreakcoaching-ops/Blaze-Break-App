import { useCallback, useEffect, useRef, useState } from 'react';
import { secureApiFetch } from '../lib/secure-api';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';

interface MemoryItem { id: string; text: string; status: 'open' | 'done'; updatedAt: string }
interface MemoryResponse { enabled: boolean; items: MemoryItem[] }

export function SecondMemoryCard({ minimal = false }: { minimal?: boolean }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const requestGeneration = useRef(0);
  const load = useCallback(async () => {
    if (!uid || auth.currentUser?.uid !== uid) return;
    const generation = requestGeneration.current;
    try {
      const response = await secureApiFetch('/api/nova/second-memory');
      const data = await response.json() as MemoryResponse;
      if (auth.currentUser?.uid !== uid || generation !== requestGeneration.current) return;
      setItems(data.items ?? []);
      setEnabled(data.enabled === true);
      setError('');
    } catch {
      if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setError('Your notes could not be loaded.');
    }
  }, [uid]);
  useEffect(() => {
    requestGeneration.current += 1;
    setItems([]); setEnabled(false); setExpanded(false); setNote('');
    setBusy(false); setError(''); setConfirmErase(false);
    void load();
    return () => { requestGeneration.current += 1; };
  }, [load]);
  const save = async () => {
    const text = note.trim();
    if (!text || text.length > 240 || busy) return;
    if (!uid || auth.currentUser?.uid !== uid) return;
    const generation = requestGeneration.current;
    setBusy(true); setError('');
    try {
      await secureApiFetch('/api/nova/second-memory', { method: 'POST', data: { text } });
      if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setNote('');
      if (auth.currentUser?.uid === uid && generation === requestGeneration.current) await load();
    } catch { if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setError('Your note was not saved.'); }
    finally { if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setBusy(false); }
  };
  const change = async (id: string, action: 'done' | 'open' | 'delete') => {
    if (busy) return;
    if (!uid || auth.currentUser?.uid !== uid) return;
    const generation = requestGeneration.current;
    setBusy(true); setError('');
    try {
      await secureApiFetch('/api/nova/second-memory/' + encodeURIComponent(id), action === 'delete'
        ? { method: 'DELETE' }
        : { method: 'PATCH', data: { status: action } });
      if (auth.currentUser?.uid === uid && generation === requestGeneration.current) await load();
    } catch { if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setError('Your change was not saved.'); }
    finally { if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setBusy(false); }
  };
  const eraseAll = async () => {
    if (busy) return;
    if (!uid || auth.currentUser?.uid !== uid) return;
    const generation = requestGeneration.current;
    setBusy(true); setError('');
    try {
      await secureApiFetch('/api/nova/second-memory', { method: 'DELETE' });
      if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setConfirmErase(false);
      if (auth.currentUser?.uid === uid && generation === requestGeneration.current) await load();
    } catch { if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setError('Notes could not be deleted.'); }
    finally { if (auth.currentUser?.uid === uid && generation === requestGeneration.current) setBusy(false); }
  };
  const open = items.filter(item => item.status === 'open');
  const featured = open[0] ?? null;
  return (
    <section aria-label="Second Memory" className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-text-main">Second Memory</h3>
        <p className="text-xs text-text-muted">A place for the things you don't want to hold in your head.</p>
      </div>
      {!enabled ? (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            Nova Memory is off. Nothing here will be used for personalisation.
            {items.length > 0 ? ' You can still erase your saved notes.' : ''}
          </p>
          {items.length > 0 && (
            <div className="space-y-2">
              <button type="button" aria-expanded={expanded}
                onClick={() => setExpanded(value => !value)} className="text-xs text-primary underline">
                {expanded ? 'Hide saved notes' : 'Review saved notes'}
              </button>
              {expanded && (
                <ul className="space-y-2">
                  {items.map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-xs border-b border-border pb-2">
                      <span className="text-text-main break-words">{item.text}</span>
                      <button type="button" disabled={busy} className="text-red-600 underline"
                        onClick={() => void change(item.id, 'delete')}>Delete</button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" disabled={busy} className="text-xs text-red-600 underline"
                onClick={() => setConfirmErase(value => !value)}>
                Delete all {items.length} saved notes
              </button>
              {confirmErase && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-text-muted">Permanently delete these notes?</p>
                  <button type="button" disabled={busy} className="text-xs text-red-600"
                    onClick={() => void eraseAll()}>Delete</button>
                  <button type="button" className="text-xs text-text-muted" onClick={() => setConfirmErase(false)}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {featured ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-text-main break-words">{featured.text}</span>
              <button type="button" disabled={busy} className="text-xs text-primary"
                onClick={() => void change(featured.id, 'done')}>Done</button>
            </div>
          ) : <p className="text-xs text-text-muted">Nothing waiting for you.</p>}
          {!minimal && (
            <>
              <button type="button" className="text-xs text-text-muted underline"
                onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
                {expanded ? 'Hide notes' : 'See or add notes'}
              </button>
              {expanded && (
                <div className="space-y-3">
                  <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="flex gap-2">
                    <input aria-label="Something for Nova to remember" value={note} maxLength={240}
                      placeholder="Something I want to remember..."
                      onChange={event => setNote(event.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-card p-2 text-xs text-text-main" />
                    <button disabled={busy || !note.trim()} type="submit"
                      className="rounded-lg border border-primary px-3 text-xs text-primary">Save</button>
                  </form>
                  <ul className="space-y-2">
                    {items.map(item => (
                      <li key={item.id} className="flex items-center justify-between gap-2 text-xs border-b border-border pb-2">
                        <span className={item.status === 'done' ? 'text-text-muted line-through' : 'text-text-main'}>{item.text}</span>
                        <div className="flex shrink-0 gap-2">
                          <button disabled={busy} type="button" onClick={() => void change(item.id, item.status === 'done' ? 'open' : 'done')}
                            className="text-primary">{item.status === 'done' ? 'Reopen' : 'Done'}</button>
                          <button disabled={busy} type="button" onClick={() => void change(item.id, 'delete')}
                            className="text-text-muted">Delete</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
