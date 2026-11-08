import { useCallback, useEffect, useState } from 'react';
import { secureApiFetch } from '../lib/secure-api';
import { moduleDisplayName } from '../../recovery-decision-copy';
import { auth } from '../lib/firebase';

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
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<FeedbackItem['helpfulness']>('not_sure');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const load = useCallback(async () => {
    if (!auth.currentUser) return;
    setError('');
    try {
      const res = await secureApiFetch('/api/recovery/my-feedback');
      const data = await res.json() as { items?: FeedbackItem[] };
      setItems(data.items ?? []);
      setLoaded(true);
    } catch {
      setError('Feedback history is unavailable. Please try again.');
    }
  }, []);
  useEffect(() => { if (expanded && !loaded) void load(); }, [expanded, loaded, load]);
  const correct = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setError('');
    try {
      await secureApiFetch('/api/recovery/routing-outcome', {
        method: 'POST', data: { decisionId: id, action: 'completed', helpfulness: editValue },
      });
      setItems(previous => previous.map(item => item.id === id
        ? { ...item, helpfulness: editValue } : item));
      setEditingId(null);
    } catch {
      setError('Your correction could not be saved.');
    } finally {
      setBusyId(null);
    }
  };
  const resetLearning = async () => {
    if (busyId) return;
    setBusyId('reset');
    setError('');
    try {
      const res = await secureApiFetch('/api/recovery/reset-adaptive-learning', {
        method: 'POST', data: { confirm: 'RESET_MY_LEARNING' },
      });
      const result = await res.json() as { complete: boolean };
      setConfirmReset(false);
      setItems([]);
      onReset?.();
      if (!result.complete) setError('Learning is off, but some older ratings still need clearing. You can run reset again.');
    } catch {
      setError('Reset could not finish. Please try again.');
    } finally {
      setBusyId(null);
    }
  };
  const remove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setError('');
    try {
      await secureApiFetch('/api/recovery/my-feedback/' + encodeURIComponent(id), { method: 'DELETE' });
      setItems(previous => previous.filter(item => item.id !== id));
    } catch {
      setError('Could not forget that rating. Please try again.');
    } finally {
      setBusyId(null);
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
          onClick={() => setConfirmReset(value => !value)}>Reset what Nova has learned</button>
        {confirmReset && (
          <div className="space-y-2 p-3 border border-border rounded-lg">
            <p className="text-xs text-text-muted">
              This turns Adaptive Intelligence off, clears your saved module preferences,
              and removes past helpfulness ratings. Your recovery activities stay recorded.
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
          {loaded && items.length === 0 && <p className="text-xs text-text-muted">No recent ratings to review.</p>}
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
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
