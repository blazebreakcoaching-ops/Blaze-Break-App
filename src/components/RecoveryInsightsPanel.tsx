import { useI18n } from '../lib/i18n-react';
import type { TranslationKey } from '../../i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { secureApiFetch, SecureApiError } from '../lib/secure-api';

// Customer-facing insights (the approved customer Intelligence Layer).
// Everything shown comes from GET /api/recovery/insights, which reads only
// the signed-in person's own server-calculated summaries. No figure is
// computed or guessed here: when a value is unavailable the panel says why.
type Tone = 'better' | 'worse' | 'steady' | 'unknown';
interface Insight {
  type: string;
  label: string;
  state: 'available' | 'not_enough_data' | 'stale' | 'not_calculated';
  value: number | null;
  direction: string;
  tone: Tone;
  confidence: 'low' | 'medium' | 'high' | null;
  sourceCount: number;
  explanation: string;
}

const TONE_KEY: Record<Tone, TranslationKey> = {
  better: 'insights.helpful',
  worse: 'insights.attention',
  steady: 'insights.steady',
  unknown: 'insights.noDirection',
};
const LABEL_KEYS: Record<string, TranslationKey> = {
  energy_trend: 'insights.label.energy_trend',
  mood_trend: 'insights.label.mood_trend',
  recovery_debt: 'insights.label.recovery_debt',
};

const reasonOf = (e: unknown, fallback: string) => (e instanceof SecureApiError ? e.message : fallback);

export const RecoveryInsightsPanel = () => {
  const { user } = useAuth();
  const { t, number } = useI18n();
  const requestGeneration = useRef(0);
  const newestLoad = useRef(0);
  const toneText = (tone: Tone) => t(TONE_KEY[tone]);
  const labelOf = (i: { type: string; label: string }) => (LABEL_KEYS[i.type] ? t(LABEL_KEYS[i.type]) : i.label);
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainNote, setExplainNote] = useState('');

  const load = useCallback(async () => {
    const session = user;
    if (!session || auth.currentUser !== session) return;
    const generation = requestGeneration.current;
    const loadId = ++newestLoad.current;
    setLoading(true);
    setError('');
    try {
      const res = await secureApiFetch('/api/recovery/insights');
      const data = await res.json();
      if (auth.currentUser !== session || requestGeneration.current !== generation
        || newestLoad.current !== loadId) return;
      setInsights(Array.isArray(data.insights) ? data.insights : []);
    } catch (e) {
      if (auth.currentUser === session && requestGeneration.current === generation
        && newestLoad.current === loadId) setError(reasonOf(e, t('insights.loadError')));
    } finally {
      if (auth.currentUser === session && requestGeneration.current === generation
        && newestLoad.current === loadId) setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    requestGeneration.current += 1;
    newestLoad.current += 1;
    setInsights(null); setExplanation(null); setExplainNote('');
    setError(''); setUpdating(false); setExplaining(false);
    setLoading(!!user && auth.currentUser === user);
    if (user && auth.currentUser === user) void load();
    return () => {
      requestGeneration.current += 1;
      newestLoad.current += 1;
    };
  }, [user, load]);

  const update = async () => {
    const session = user;
    if (!session || auth.currentUser !== session || updating) return;
    const generation = requestGeneration.current;
    setUpdating(true);
    setError('');
    setExplanation(null);
    setExplainNote('');
    try {
      await secureApiFetch('/api/recovery/recalculate', { method: 'POST', data: {} });
      if (auth.currentUser !== session || requestGeneration.current !== generation) return;
      await load();
    } catch (e) {
      if (auth.currentUser === session && requestGeneration.current === generation)
        setError(reasonOf(e, t('insights.updateError')));
    } finally {
      if (auth.currentUser === session && requestGeneration.current === generation) setUpdating(false);
    }
  };

  const explain = async () => {
    const session = user;
    if (!session || auth.currentUser !== session || explaining) return;
    const generation = requestGeneration.current;
    setExplaining(true);
    setExplanation(null);
    setExplainNote('');
    try {
      const res = await secureApiFetch('/api/recovery/insights/explain', { method: 'POST', data: {} });
      const data = await res.json();
      if (auth.currentUser !== session || requestGeneration.current !== generation) return;
      if (data.explanation) setExplanation(data.explanation);
      else if (data.reason === 'no_consent') setExplainNote(t('insights.noConsent'));
      else setExplainNote(t('insights.notEnough'));
    } catch (e) {
      if (auth.currentUser === session && requestGeneration.current === generation)
        setExplainNote(reasonOf(e, t('insights.explainError')));
    } finally {
      if (auth.currentUser === session && requestGeneration.current === generation) setExplaining(false);
    }
  };

  const anyAvailable = (insights || []).some((i) => i.state === 'available');

  return (
    <section aria-labelledby="your-insights-heading" data-nova-guide-target="insights-content" tabIndex={-1} className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="your-insights-heading" className="text-[11px] font-bold uppercase tracking-widest text-text-muted">{t('insights.heading')}</h3>
          <p className="text-xs text-text-muted mt-1">{t('insights.sub')}</p>
        </div>
        <button
          type="button"
          onClick={update}
          disabled={!user || auth.currentUser !== user || updating || loading}
          className="shrink-0 py-2 px-3 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          {updating ? t('insights.updating') : t('insights.update')}
        </button>
      </div>

      {loading && <p role="status" className="text-xs text-text-muted">{t('insights.loading')}</p>}
      {!loading && error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {!loading && insights && (
        <ul className="space-y-4">
          {insights.map((insight) => (
            <li key={insight.type} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold text-text-main">{labelOf(insight)}</span>
                <span className="text-xs text-text-muted">
                  {insight.state === 'available' ? toneText(insight.tone) : t('insights.notAvailable')}
                </span>
              </div>
              {insight.state === 'available' && insight.value !== null && (
                <div
                  role="img"
                  aria-label={t('insights.valueLabel', { label: labelOf(insight), value: number(insight.value ?? 0), tone: toneText(insight.tone).toLocaleLowerCase() })}
                  className="h-2 rounded-full bg-border overflow-hidden"
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${insight.value}%` }} />
                </div>
              )}
              <p className="text-xs text-text-muted">{insight.explanation}</p>
            </li>
          ))}
        </ul>
      )}

      {!loading && insights && (
        <div className="pt-2 border-t border-border space-y-2">
          <button
            type="button"
            onClick={explain}
            disabled={!user || auth.currentUser !== user || explaining || !anyAvailable}
            className="py-2 px-3 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {explaining ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
            {explaining ? t('insights.thinking') : t('insights.ask')}
          </button>
          {!anyAvailable && <p className="text-xs text-text-muted">{t('insights.askDisabled')}</p>}
          {explanation && (
            <div role="status" className="text-sm text-text-main space-y-1">
              <p>{explanation}</p>
              <p className="text-[11px] text-text-muted">{t('insights.novaNote')}</p>
            </div>
          )}
          {explainNote && <p role="status" className="text-xs text-text-muted">{explainNote}</p>}
        </div>
      )}
    </section>
  );
};
