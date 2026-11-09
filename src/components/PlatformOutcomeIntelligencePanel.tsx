import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { auth } from '../lib/firebase';
import { secureApiFetch, SecureApiError } from '../lib/secure-api';
import { isVerifiedOwnerBootstrapIdentity } from '../../admin-roles';

// The backend's content.manage permission is authoritative; this is a
// convenience visibility gate, never a substitute for server authorisation.
const CONTENT_ROLES = new Set(['platform_owner', 'platform_admin', 'content_admin', 'coach_admin']);

interface FeatureSummary {
  totalEvents: number;
  sufficientSample: boolean;
  sampleThreshold: number;
}
interface ProductIntelligence {
  lookbackDays: number;
  grounding: FeatureSummary;
  movement: FeatureSummary;
  recoveryRecipes: FeatureSummary;
}
interface ModuleSummary {
  module: string;
  recommended: number;
  resolved: number;
  completed: number;
  completionRate: number | null;
  netPositiveRate: number | null;
}
interface RecoveryOutcomes {
  lookbackDays: number;
  modules: ModuleSummary[];
  adaptiveComparison: {
    adapted: { rated: number; positiveRate: number | null };
    standard: { rated: number; positiveRate: number | null };
    unknownProvenance: number;
    caveat: string;
  };
}
const percentage = (n: number | null): string =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
    ? `${Math.round(n * 100)}%` : 'Insufficient evidence';

export function PlatformOutcomeIntelligencePanel() {
  const { user, appRole } = useAuth();
  const authorisedForDisplay = CONTENT_ROLES.has(appRole || '') ||
    isVerifiedOwnerBootstrapIdentity(user);
  const revision = useRef(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [product, setProduct] = useState<ProductIntelligence | null>(null);
  const [outcomes, setOutcomes] = useState<RecoveryOutcomes | null>(null);

  useEffect(() => {
    revision.current += 1;
    setOpen(false); setBusy(false); setError('');
    setProduct(null); setOutcomes(null);
    return () => { revision.current += 1; };
  }, [user]);

  if (!authorisedForDisplay) return null;
  const load = async () => {
    const session = user;
    if (!session || auth.currentUser !== session || busy) return;
    const request = ++revision.current;
    setOpen(true); setBusy(true); setError('');
    setProduct(null); setOutcomes(null);
    try {
      // Both routes already exist and require content.manage. Keep the same
      // lookback window; never reconstruct or combine private user records.
      const [usageResponse, outcomesResponse] = await Promise.all([
        secureApiFetch('/api/admin/product-intelligence?days=90'),
        secureApiFetch('/api/admin/recovery-outcomes?days=90'),
      ]);
      const [usage, recovery] = await Promise.all([
        usageResponse.json(), outcomesResponse.json(),
      ]);
      if (auth.currentUser !== session || revision.current !== request) return;
      setProduct(usage as ProductIntelligence);
      setOutcomes(recovery as RecoveryOutcomes);
    } catch (e) {
      if (auth.currentUser === session && revision.current === request)
        setError(e instanceof SecureApiError ? e.message : 'Platform intelligence is unavailable.');
    } finally {
      if (auth.currentUser === session && revision.current === request) setBusy(false);
    }
  };

  return (
    <section className="card p-6 bg-surface dark:bg-card border border-border rounded-2xl space-y-4"
      aria-label="Platform recovery and feature outcomes">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div>
          <h3 className="text-sm font-bold text-text-main">Recovery & Product Intelligence</h3>
          <p className="text-xs text-text-muted mt-1">Real 90-day platform totals. Read-only, aggregate reporting; not individual or employer data.</p>
        </div>
        <button type="button" onClick={() => open ? setOpen(false) : void load()}
          disabled={busy || !user || auth.currentUser !== user}
          aria-expanded={open}
          className="px-3 py-2 text-xs border border-border rounded-lg text-text-main">
          {busy ? 'Loading…' : open ? 'Hide outcomes' : 'View platform outcomes'}
        </button>
      </div>
      {open && (
        <div className="space-y-4">
          {busy && <p role="status" className="text-xs text-text-muted">Reading existing aggregate reports…</p>}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          {product && (
            <div>
              <h4 className="text-xs font-bold text-text-main mb-2">Feature usage — {product.lookbackDays} days</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {([
                  ['Grounding', product.grounding],
                  ['Movement', product.movement],
                  ['Recovery Recipes', product.recoveryRecipes],
                ] as const).map(([name, summary]) => (
                  <div key={name} className="border border-border rounded-lg p-3">
                    <p className="text-xs text-text-muted">{name}</p>
                    <p className="text-xl font-bold text-text-main">{summary.totalEvents.toLocaleString()}</p>
                    <p className="text-xs text-text-muted">
                      {summary.sufficientSample ? 'Enough events for a breakdown' :
                        `Early data — fewer than ${summary.sampleThreshold} events`}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-2">Event counts measure feature use, not treatment effectiveness or unique people.</p>
            </div>
          )}
          {outcomes && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-text-main">Recovery recommendations — {outcomes.lookbackDays} days</h4>
              {outcomes.modules.length === 0 ? (
                <p className="text-xs text-text-muted">No measured recommendation outcomes for this period.</p>
              ) : (
                <ul className="space-y-2">
                  {outcomes.modules.slice(0, 8).map(module => (
                    <li key={module.module} className="flex flex-wrap items-start justify-between gap-2 border border-border rounded-lg p-3 text-xs">
                      <span className="font-semibold text-text-main">{module.module.replace(/_/g, ' ')}</span>
                      <span className="text-text-muted">{module.recommended} offered · {module.resolved} resolved</span>
                      <span className="text-text-muted">
                        Completion: {percentage(module.completionRate)} · Helpful: {percentage(module.netPositiveRate)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-text-muted">
                Adapted ratings: {outcomes.adaptiveComparison.adapted.rated} ·
                Standard ratings: {outcomes.adaptiveComparison.standard.rated} ·
                Unknown provenance: {outcomes.adaptiveComparison.unknownProvenance}
              </p>
              <p className="text-xs text-text-muted">
                {outcomes.adaptiveComparison.caveat || 'Observational, not causal. Small samples do not establish effectiveness.'}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
