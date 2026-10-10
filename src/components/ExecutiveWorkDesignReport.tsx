import { useState, useEffect } from 'react';
import { secureApiFetch } from '../lib/secure-api';
import { cn } from '../lib/utils';
import { Building2, Lock, Loader2, AlertTriangle, ShieldCheck, Calendar, Info, Plug } from 'lucide-react';

interface WorkDesignSignal {
  key: string;
  label: string;
  band: string | null;
  bandLabel: string | null;
  sufficiencyMessage: string;
  basis: string;
}

interface ConnectorCoverage {
  key: string;
  label: string;
  totalConsentingMembers: number;
  connectedCount: number | null;
  coveragePercent: number | null;
  sufficiencyMessage: string | null;
}

interface FinancialRangeEstimate {
  lowEstimate: number;
  highEstimate: number;
  currency: 'GBP';
  assumptionNote: string;
}

const bandBadgeClasses: Record<string, string> = {
  sustained: 'bg-destructive/10 text-destructive dark:text-[#f87171] border-destructive/20',
  elevated: 'bg-warning/10 text-[#9a3412] dark:text-warning border-warning/20',
  typical: 'bg-primary/10 text-primary border-primary/20',
  low: 'bg-success/10 text-[#166534] dark:text-[#4ade80] border-success/20',
};

const currencySymbol: Record<string, string> = { GBP: '£' };

// Executive Work Design - org-wide, never per-employee. Replaces nothing
// that already existed for this audience (investigation found the old
// "Executive ROI" tab/ExecutiveBoardReport.tsx is actually a personal
// consumer-subscription report about one person's own data, a completely
// different feature - see App.tsx's isOrgAdmin comment). This is the
// spec's real thing: the org's own Work Design Signals, aggregated
// org-wide with the same Anonymous Aggregation Engine gate every other
// org view uses, plus a financial estimate that is always a range with
// a stated assumption, never a single precise-looking number, and never
// shown at all when nothing looks elevated.
export const ExecutiveWorkDesignReport = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [cohortSize, setCohortSize] = useState(0);
  const [threshold, setThreshold] = useState(5);
  const [signals, setSignals] = useState<WorkDesignSignal[]>([]);
  const [costInputsAvailable, setCostInputsAvailable] = useState(false);
  const [financialEstimate, setFinancialEstimate] = useState<FinancialRangeEstimate | null>(null);
  const [connectors, setConnectors] = useState<ConnectorCoverage[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const meRes = await secureApiFetch('/api/org/me');
        const me = await meRes.json();
        if (!me.organisationId) {
          setError('no_org');
          setLoading(false);
          return;
        }
        const [reportRes, coverageRes] = await Promise.all([
          secureApiFetch(`/api/org/${me.organisationId}/executive-work-design`),
          secureApiFetch(`/api/org/${me.organisationId}/data-coverage`),
        ]);
        const data = await reportRes.json();
        if (!reportRes.ok) {
          setError(data.error || 'Could not load the Executive Work Design report.');
        } else {
          setLocked(!!data.locked);
          setCohortSize(data.cohortSize || 0);
          setThreshold(data.threshold || 5);
          setSignals(data.workDesignSignals || []);
          setCostInputsAvailable(!!data.costInputsAvailable);
          setFinancialEstimate(data.financialEstimate || null);
        }
        const coverageData = await coverageRes.json();
        if (coverageRes.ok) {
          setConnectors(coverageData.connectors || []);
        }
      } catch (e) {
        setError('Could not load the Executive Work Design report.');
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error === 'no_org') return null;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-destructive/5 border border-dashed border-destructive/20 rounded-xl">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-text-muted text-sm max-w-md">{error}</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-surface dark:bg-surface/50 rounded-xl border border-dashed border-border">
        <Lock className="w-12 h-12 text-text-muted mb-4" />
        <h3 className="text-xl font-bold text-text-main mb-2">Insufficient Cohort Size</h3>
        <p className="text-text-muted text-sm max-w-md">
          {cohortSize} of {threshold} required teammates have opted in to anonymised sharing so far.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-display font-bold text-text-main">Executive Work Design</h3>
          <p className="text-xs text-text-muted leading-relaxed max-w-2xl">
            Where work is becoming unnecessarily hard across your organisation - never which employees are struggling. Aggregated across {cohortSize} consenting teammates.
          </p>
        </div>
      </div>

      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3 text-sm font-medium text-text-main">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
        <span>Same privacy rule as every other view: aggregated and anonymised, never an individual's own data.</span>
      </div>

      <div className="card space-y-4">
        <h4 className="text-xs uppercase font-bold tracking-widest text-text-muted flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5" /> Work Design Signals
        </h4>
        <ul className="space-y-2.5">
          {signals.map((signal) => (
            <li key={signal.key} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface/60 dark:bg-card/40">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-main truncate">{signal.label}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {signal.band ? signal.basis : signal.sufficiencyMessage}
                </p>
              </div>
              {signal.band ? (
                <span className={cn('shrink-0 text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border', bandBadgeClasses[signal.band])}>
                  {signal.bandLabel}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-text-muted">not enough data yet</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="card space-y-4">
        <h4 className="text-xs uppercase font-bold tracking-widest text-text-muted flex items-center gap-2">
          <Info className="w-3.5 h-3.5" /> Illustrative Cost Range
        </h4>
        {!costInputsAvailable ? (
          <p className="text-sm text-text-muted leading-relaxed">
            Enter your organisation's own real sickness-absence and cost figures (Cost of Pressure, in the People Value Engine) to see an illustrative range here.
          </p>
        ) : financialEstimate ? (
          <>
            <p className="text-2xl font-display font-bold text-text-main">
              {currencySymbol[financialEstimate.currency]}{financialEstimate.lowEstimate.toLocaleString()} - {currencySymbol[financialEstimate.currency]}{financialEstimate.highEstimate.toLocaleString()}
            </p>
            <p className="text-xs text-text-muted leading-relaxed">{financialEstimate.assumptionNote}</p>
          </>
        ) : (
          <p className="text-sm text-text-muted leading-relaxed">
            No illustrative range right now - your Work Design Signals aren't currently elevated or sustained, so there's nothing to attribute a cost estimate to.
          </p>
        )}
      </div>

      <div className="card space-y-4">
        <h4 className="text-xs uppercase font-bold tracking-widest text-text-muted flex items-center gap-2">
          <Plug className="w-3.5 h-3.5" /> Data Coverage &amp; Connector Health
        </h4>
        <p className="text-xs text-text-muted leading-relaxed">
          How much of what's shown above you can trust - how many consenting members have actually connected each data source.
        </p>
        <ul className="space-y-2.5">
          {connectors.map((connector) => (
            <li key={connector.key} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface/60 dark:bg-card/40">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-main truncate">{connector.label}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {connector.connectedCount != null
                    ? `${connector.connectedCount} of ${connector.totalConsentingMembers} consenting members connected`
                    : connector.sufficiencyMessage}
                </p>
              </div>
              {connector.coveragePercent != null ? (
                <span className="shrink-0 text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20">
                  {connector.coveragePercent}%
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-text-muted">not enough data yet</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
