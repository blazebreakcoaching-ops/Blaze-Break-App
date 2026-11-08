import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firestore';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';

interface StoredMemory { id: string; type: string; content: string; canEdit: boolean; }

// This deliberately does NOT feed the coaching context cache.
// A member can exercise access/correction/erasure rights after switching
// learning off, without reactivating Nova's memory or saving any new data.
export function PastNovaMemoriesReview() {
  const { user } = useAuth();
  const accountUid = user?.uid ?? null;
  const [opened, setOpened] = useState(false);
  const [entries, setEntries] = useState<StoredMemory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    setOpened(false); setEntries([]); setEditing(null); setDraft(''); setError('');
  }, [accountUid]);
  const load = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setBusy(true); setError('');
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'nova_memories'));
      if (auth.currentUser?.uid !== uid) return;
      setEntries(snap.docs.map(d => ({
        id: d.id, type: String(d.data().type ?? 'memory'),
        content: String(d.data().content ?? ''), canEdit: d.data().canEdit === true,
      })));
      setOpened(true);
    } catch {
      setError('Saved memories could not be loaded.');
    } finally { setBusy(false); }
  };
  const change = async (id: string, action: 'delete' | 'edit') => {
    const uid = auth.currentUser?.uid;
    const target = entries.find(e => e.id === id);
    if (!uid || !target?.canEdit || busy) return;
    if (action === 'edit' && (!draft.trim() || draft.length > 1000)) return;
    setBusy(true); setError('');
    try {
      const ref = doc(db, 'users', uid, 'nova_memories', id);
      if (action === 'delete') await deleteDoc(ref);
      else await updateDoc(ref, { content: draft.trim(), updatedAt: new Date().toISOString() });
      setEntries(previous => action === 'delete'
        ? previous.filter(e => e.id !== id)
        : previous.map(e => e.id === id ? { ...e, content: draft.trim() } : e));
      setEditing(null);
    } catch {
      setError('This memory could not be changed. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl border border-border p-4 space-y-3" aria-label="Review previous Nova memories">
      <h3 className="text-sm font-semibold text-text-main">Review all saved memories</h3>
      <p className="text-xs text-text-muted">
        You can inspect, correct and erase previously saved memories even with Nova learning switched off.
        Reviewing them does not give Nova permission to use them.
      </p>
      <button type="button" disabled={busy} className="text-xs text-primary underline"
        onClick={() => opened ? setOpened(false) : void load()}>
        {opened ? 'Hide saved memories' : 'Review saved memories'}
      </button>
      {opened && (
        <div className="space-y-2">
          {entries.length === 0 && <p className="text-xs text-text-muted">No saved memories found.</p>}
          {entries.map(entry => (
            <div key={entry.id} className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs text-text-muted capitalize">{entry.type.replace(/_/g, ' ')}</p>
              <p className="text-sm text-text-main break-words">{entry.content}</p>
              {entry.canEdit ? (
                <div className="flex flex-wrap gap-3 items-center">
                  <button disabled={busy} type="button" className="text-xs text-primary underline"
                    onClick={() => { setEditing(entry.id); setDraft(entry.content); }}>Correct</button>
                  <button disabled={busy} type="button" className="text-xs text-red-600 underline"
                    onClick={() => void change(entry.id, 'delete')}>Forget</button>
                  {editing === entry.id && (
                    <div className="w-full space-y-2">
                      <label className="text-xs text-text-muted" htmlFor={'stored-memory-' + entry.id}>Correct memory</label>
                      <input id={'stored-memory-' + entry.id} className="block w-full border border-border rounded-lg bg-card p-2 text-sm text-text-main"
                        maxLength={1000} value={draft} onChange={e => setDraft(e.target.value)} />
                      <button disabled={busy || !draft.trim()} type="button" onClick={() => void change(entry.id, 'edit')}
                        className="text-xs text-primary underline">Save correction</button>
                      <button type="button" onClick={() => setEditing(null)}
                        className="ml-3 text-xs text-text-muted underline">Cancel</button>
                    </div>
                  )}
                </div>
              ) : <p className="text-xs text-text-muted">System-managed record. Contact support to request a review.</p>}
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
