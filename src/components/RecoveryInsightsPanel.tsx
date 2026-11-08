import { useCallback, useEffect, useState } from 'react';
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

const TONE_TEXT: Record<Tone, string> = {
  better: 'Helpful direction',
  worse: 'Worth some attention',
  steady: 'Steady',
  unknown: 'No clear direction yet',
};

const reasonOf = (e: unknown, fallback: string) => (e instanceof SecureApiError ? e.message : fallback);

export const RecoveryInsightsPanel = () => {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainNote, setExplainNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await secureApiFetch('/api/recovery/insights');
      const data = await res.json();
      setInsights(Array.isArray(data.insights) ? data.insights : []);
    } catch (e) {
      setError(reasonOf(e, 'Your insights could not be loaded right now. Please try again.'));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async () => {
    setUpdating(true);
    setError('');
    setExplanation(null);
    setExplainNote('');
    try {
      await secureApiFetch('/api/recovery/recalculate', { method: 'POST', data: {} });
      await load();
    } catch (e) {
      setError(reasonOf(e, 'Your insights could not be updated right now. Nothing was changed.'));
    }
    setUpdating(false);
  };

  const explain = async () => {
    setExplaining(true);
    setExplanation(null);
    setExplainNote('');
    try {
      const res = await secureApiFetch('/api/recovery/insights/explain', { method: 'POST', data: {} });
      const data = await res.json();
      if (data.explanation) setExplanation(data.explanation);
      else if (data.reason === 'no_consent') setExplainNote("Nova can't see these insights because you haven't allowed it. You can change this in Privacy Centre under Nova permissions.");
      else setExplainNote("There isn't enough data yet for Nova to explain a trend. Keep logging for a few more days.");
    } catch (e) {
      setExplainNote(reasonOf(e, "Nova couldn't explain your insights right now. Your insights above are still accurate."));
    }
    setExplaining(false);
  };

  const anyAvailable = (insights || []).some((i) => i.state === 'available');

  return (
    <section aria-labelledby="your-insights-heading" data-nova-guide-target="insights-content" tabIndex={-1} className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="your-insights-heading" className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Your insights</h3>
          <p className="text-xs text-text-muted mt-1">From what you have logged in the last 30 days. Only you can see these.</p>
        </div>
        <button
          type="button"
          onClick={update}
          disabled={updating || loading}
          className="shrink-0 py-2 px-3 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          {updating ? 'Updating…' : 'Update my insights'}
        </button>
      </div>

      {loading && <p role="status" className="text-xs text-text-muted">Loading your insights…</p>}
      {!loading && error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {!loading && insights && (
        <ul className="space-y-4">
          {insights.map((insight) => (
            <li key={insight.type} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-bold text-text-main">{insight.label}</span>
                <span className="text-xs text-text-muted">
                  {insight.state === 'available' ? TONE_TEXT[insight.tone] : 'Not available yet'}
                </span>
              </div>
              {insight.state === 'available' && insight.value !== null && (
                <div
                  role="img"
                  aria-label={`${insight.label}: ${insight.value} out of 100, ${TONE_TEXT[insight.tone].toLowerCase()}`}
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
            disabled={explaining || !anyAvailable}
            className="py-2 px-3 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {explaining ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
            {explaining ? 'Nova is thinking…' : 'Ask Nova to explain'}
          </button>
          {!anyAvailable && <p className="text-xs text-text-muted">Nova can explain your insights once at least one is available.</p>}
          {explanation && (
            <div role="status" className="text-sm text-text-main space-y-1">
              <p>{explanation}</p>
              <p className="text-[11px] text-text-muted">Nova used only the insights you allow it to see. This is coaching, not medical advice.</p>
            </div>
          )}
          {explainNote && <p role="status" className="text-xs text-text-muted">{explainNote}</p>}
        </div>
      )}
    </section>
  );
};
