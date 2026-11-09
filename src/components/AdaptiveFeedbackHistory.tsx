import { useCallback, useEffect, useRef, useState } from 'react';
import { secureApiFetch } from '../lib/secure-api';
import { moduleDisplayName } from '../../recovery-decision-copy';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';

interface FeedbackItem {
  id: string;
  module: string;
  helpfulness: 'better' | 'same' | 'not_really' | 'not_sure';
  date: string | null;
}
const LABELS: Record<FeedbackItem['helpfulness'], string> = {
  better: 'Helped',
  same: 'About the same',
  not_really: 'Did not help',
  not_sure: 'Not sure',
};

export function AdaptiveFeedbackHistory({ onReset }: { onReset?: () => void }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const generation = useRef(0);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<FeedbackItem['helpfulness']>('not_sure');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const load = useCallback(async (cursor?: string) => {
    if (!uid || auth.currentUser?.uid !== uid) return;
    const requestGeneration = generation.current;
    setError('');
    if (cursor) setLoadingMore(true);
    try {
      const path = '/api/recovery/my-feedback' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
      const res = await secureApiFetch(path);
      const data = await res.json() as { items?: FeedbackItem[]; nextCursor?: string | null };
      if (auth.currentUser?.uid !== uid || generation.current !== requestGeneration) return;
      if (cursor) {
        // Defensive dedup in case data changed between page requests.
        setItems(previous => {
          const seen = new Set(previous.map(item => item.id));
          return [...previous, ...(data.items ?? []).filter(item => !seen.has(item.id))];
        });
      } else {
        setItems(data.items ?? []);
      }
      setNextCursor(data.nextCursor ?? null);
      setLoaded(true);
    } catch {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setError('Feedback history is unavailable. Please try again.');
    } finally {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setLoadingMore(false);
    }
  }, [uid]);
  useEffect(() => {
    generation.current += 1;
    setItems([]); setLoaded(false); setNextCursor(null); setLoadingMore(false);
    setExpanded(false); setEditingId(null); setConfirmReset(false);
    setBusyId(null); setError('');
    return () => { generation.current += 1; };
  }, [uid]);
  useEffect(() => { if (expanded && !loaded) void load(); }, [expanded, loaded, load]);
  const correct = async (id: string) => {
    if (busyId || !uid || auth.currentUser?.uid !== uid) return;
    const requestGeneration = generation.current;
    setBusyId(id);
    setError('');
    try {
      await secureApiFetch('/api/recovery/routing-outcome', {
        method: 'POST', data: { decisionId: id, action: 'completed', helpfulness: editValue },
      });
      if (auth.currentUser?.uid !== uid || generation.current !== requestGeneration) return;
      setItems(previous => previous.map(item => item.id === id
        ? { ...item, helpfulness: editValue } : item));
      setEditingId(null);
    } catch {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setError('Your correction could not be saved.');
    } finally {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setBusyId(null);
    }
  };
  const resetLearning = async () => {
    if (busyId || !uid || auth.currentUser?.uid !== uid) return;
    const requestGeneration = generation.current;
    setBusyId('reset');
    setError('');
    try {
      const res = await secureApiFetch('/api/recovery/reset-adaptive-learning', {
        method: 'POST', data: { confirm: 'RESET_MY_LEARNING' },
      });
      const result = await res.json() as { complete: boolean };
      if (auth.currentUser?.uid !== uid || generation.current !== requestGeneration) return;
      setConfirmReset(false);
      setItems([]);
      setNextCursor(null);
      onReset?.();
      if (!result.complete) setError('Learning is off, but some older ratings still need clearing. You can run reset again.');
    } catch {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setError('Reset could not finish. Please try again.');
    } finally {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setBusyId(null);
    }
  };
  const remove = async (id: string) => {
    if (busyId || !uid || auth.currentUser?.uid !== uid) return;
    const requestGeneration = generation.current;
    setBusyId(id);
    setError('');
    try {
      await secureApiFetch('/api/recovery/my-feedback/' + encodeURIComponent(id), { method: 'DELETE' });
      if (auth.currentUser?.uid !== uid || generation.current !== requestGeneration) return;
      setItems(previous => previous.filter(item => item.id !== id));
    } catch {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setError('Could not forget that rating. Please try again.');
    } finally {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setBusyId(null);
    }
  };
  return (
    <section className="rounded-xl border border-border p-4 space-y-3" aria-label="Your Nova feedback">
      <div>
        <h4 className="text-sm font-semibold text-text-main">What Nova has learned from</h4>
        <p className="text-xs text-text-muted mt-1">
          Review recent recovery ratings. Forgetting a rating stops it being used for future adaptive suggestions.
          Your activity record remains, but the personal helpfulness answer is removed.
        </p>
      </div>
      <div className="space-y-2">
        <button type="button" className="text-xs text-red-600 underline"
          onClick={() => setConfirmReset(value => !value)}>Reset adaptive feedback</button>
        {confirmReset && (
          <div className="space-y-2 p-3 border border-border rounded-lg">
            <p className="text-xs text-text-muted">
              This turns Adaptive Intelligence off, clears your saved module preferences,
              and removes past helpfulness ratings. Your recovery activities stay recorded.
              Nova's separate saved memories and Second Memory notes are not erased here; you can manage them in Memory Centre.
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busyId !== null} onClick={() => void resetLearning()}
                className="text-xs text-red-600 underline">Confirm reset</button>
              <button type="button" onClick={() => setConfirmReset(false)}
                className="text-xs text-text-muted underline">Cancel</button>
            </div>
          </div>
        )}
      </div>
      <button type="button" aria-expanded={expanded}
        className="text-xs text-primary underline" onClick={() => setExpanded(v => !v)}>
        {expanded ? 'Hide feedback' : 'Review my feedback'}
      </button>
      {expanded && (
        <div className="space-y-2">
          {loaded && items.length === 0 && !nextCursor && <p className="text-xs text-text-muted">No ratings to review.</p>}
          {!loaded && !error && <p className="text-xs text-text-muted">Loading feedback…</p>}
          {items.map(item => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
              <div>
                <p className="text-xs font-semibold text-text-main">{moduleDisplayName(item.module)}</p>
                <p className="text-xs text-text-muted">
                  {LABELS[item.helpfulness]}
                  {item.date && !Number.isNaN(Date.parse(item.date)) ? ' · ' + new Date(item.date).toLocaleDateString() : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busyId !== null} className="text-xs text-primary underline"
                  aria-label={`Correct feedback for ${moduleDisplayName(item.module)}`}
                  onClick={() => { setEditingId(item.id); setEditValue(item.helpfulness); }}>Correct</button>
                <button type="button" disabled={busyId !== null} className="text-xs text-primary underline"
                  aria-label={`Forget feedback for ${moduleDisplayName(item.module)}`}
                  onClick={() => void remove(item.id)}>Forget rating</button>
              </div>
              {editingId === item.id && (
                <div className="w-full flex flex-wrap items-center gap-2">
                  <label htmlFor={`feedback-${item.id}`} className="text-xs text-text-muted">What was the outcome?</label>
                  <select id={`feedback-${item.id}`} value={editValue}
                    onChange={event => setEditValue(event.target.value as FeedbackItem['helpfulness'])}
                    className="text-xs rounded border border-border bg-card text-text-main p-2">
                    {Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" disabled={busyId !== null} onClick={() => void correct(item.id)}
                    className="text-xs text-primary underline">Save</button>
                  <button type="button" onClick={() => setEditingId(null)}
                    className="text-xs text-text-muted underline">Cancel</button>
                </div>
              )}
            </div>
          ))}
          {nextCursor && (
            <button type="button" className="text-xs text-primary underline"
              disabled={busyId !== null || loadingMore}
              onClick={() => void load(nextCursor)}>
              {loadingMore ? 'Loading older ratings…' : 'Show older ratings'}
            </button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="text-xs text-red-600">
          {error}{expanded && <button type="button" className="ml-2 underline"
            disabled={loadingMore || busyId !== null} onClick={() => void load()}>
            Reload feedback
          </button>}
        </div>
      )}
    </section>
  );
}
