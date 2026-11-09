import { useCallback, useEffect, useRef, useState } from 'react';
import { secureApiFetch } from '../lib/secure-api';
import { moduleDisplayName } from '../../recovery-decision-copy';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n-react';
import { intlLocale } from '../../i18n';

interface FeedbackItem {
  id: string;
  module: string;
  helpfulness: 'better' | 'same' | 'not_really' | 'not_sure';
  date: string | null;
}
export function AdaptiveFeedbackHistory({ onReset }: { onReset?: () => void }) {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const LABELS: Record<FeedbackItem['helpfulness'], string> = {
    better: t('feedback.better'),
    same: t('feedback.same'),
    not_really: t('feedback.notReally'),
    not_sure: t('feedback.unsure'),
  };
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
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setError(t('feedback.error.history'));
    } finally {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setLoadingMore(false);
    }
  }, [uid, t]);
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
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setError(t('feedback.error.correct'));
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
      if (!result.complete) setError(t('feedback.error.incomplete'));
    } catch {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setError(t('feedback.error.reset'));
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
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setError(t('feedback.error.forget'));
    } finally {
      if (auth.currentUser?.uid === uid && generation.current === requestGeneration) setBusyId(null);
    }
  };
  return (
    <section className="rounded-xl border border-border p-4 space-y-3" aria-label={t('feedback.title')}>
      <div>
        <h4 className="text-sm font-semibold text-text-main">{t('feedback.title')}</h4>
        <p className="text-xs text-text-muted mt-1">
          {t('feedback.description')}
        </p>
      </div>
      <div className="space-y-2">
        <button type="button" className="text-xs text-red-600 underline"
          onClick={() => setConfirmReset(value => !value)}>{t('feedback.reset')}</button>
        {confirmReset && (
          <div className="space-y-2 p-3 border border-border rounded-lg">
            <p className="text-xs text-text-muted">
              {t('feedback.resetDetails')}
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={busyId !== null} onClick={() => void resetLearning()}
                className="text-xs text-red-600 underline">{t('feedback.confirmReset')}</button>
              <button type="button" onClick={() => setConfirmReset(false)}
                className="text-xs text-text-muted underline">{t('feedback.cancel')}</button>
            </div>
          </div>
        )}
      </div>
      <button type="button" aria-expanded={expanded}
        className="text-xs text-primary underline" onClick={() => setExpanded(v => !v)}>
        {expanded ? t('feedback.hide') : t('feedback.review')}
      </button>
      {expanded && (
        <div className="space-y-2">
          {loaded && items.length === 0 && !nextCursor && <p className="text-xs text-text-muted">{t('feedback.none')}</p>}
          {!loaded && !error && <p className="text-xs text-text-muted">{t('feedback.loading')}</p>}
          {items.map(item => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2">
              <div>
                <p className="text-xs font-semibold text-text-main">{moduleDisplayName(item.module)}</p>
                <p className="text-xs text-text-muted">
                  {LABELS[item.helpfulness]}
                  {item.date && !Number.isNaN(Date.parse(item.date)) ? ' · ' + new Date(item.date).toLocaleDateString(intlLocale(locale)) : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={busyId !== null} className="text-xs text-primary underline"
                  aria-label={t('feedback.correctAria', { module: moduleDisplayName(item.module) })}
                  onClick={() => { setEditingId(item.id); setEditValue(item.helpfulness); }}>{t('feedback.correct')}</button>
                <button type="button" disabled={busyId !== null} className="text-xs text-primary underline"
                  aria-label={t('feedback.forgetAria', { module: moduleDisplayName(item.module) })}
                  onClick={() => void remove(item.id)}>{t('feedback.forget')}</button>
              </div>
              {editingId === item.id && (
                <div className="w-full flex flex-wrap items-center gap-2">
                  <label htmlFor={`feedback-${item.id}`} className="text-xs text-text-muted">{t('feedback.outcome')}</label>
                  <select id={`feedback-${item.id}`} value={editValue}
                    onChange={event => setEditValue(event.target.value as FeedbackItem['helpfulness'])}
                    className="text-xs rounded border border-border bg-card text-text-main p-2">
                    {Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button type="button" disabled={busyId !== null} onClick={() => void correct(item.id)}
                    className="text-xs text-primary underline">{t('common.save')}</button>
                  <button type="button" onClick={() => setEditingId(null)}
                    className="text-xs text-text-muted underline">{t('feedback.cancel')}</button>
                </div>
              )}
            </div>
          ))}
          {nextCursor && (
            <button type="button" className="text-xs text-primary underline"
              disabled={busyId !== null || loadingMore}
              onClick={() => void load(nextCursor)}>
              {loadingMore ? t('feedback.loadingOlder') : t('feedback.older')}
            </button>
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="text-xs text-red-600">
          {error}{expanded && <button type="button" className="ml-2 underline"
            disabled={loadingMore || busyId !== null} onClick={() => void load()}>
            {t('feedback.reload')}
          </button>}
        </div>
      )}
    </section>
  );
}
