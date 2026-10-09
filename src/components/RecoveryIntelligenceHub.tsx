import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Loader2, HeartPulse } from 'lucide-react';
import { auth } from '../lib/firebase';
import { secureApiFetch } from '../lib/secure-api';
import { NovaRecommendationCard } from './NovaRecommendationCard';
import { ConnectedMoodPulse, ConnectedBodyCheckIn, ConnectedWeeklyReviews } from './ConnectedRecoveryModules';
import { MODULE_TARGET_TAB } from '../../recovery-decision-copy';
import type { RouteType, RoutingOutcome, ReasonCode, ConfidenceLevel, EvidenceSource } from '../../recovery-routing-engine';
import type { BandwidthBand } from '../../recovery-capacity-gate';
import { RECOVERY_DIRECTION_LABELS, type RecoveryDirectionBand } from '../../recovery-direction-engine';

// Recovery Intelligence, rebuilt around the spec's central doctrine: many
// capabilities underneath, one useful next step on top. This page itself
// contains almost no decision logic - it fetches whatever
// POST /api/recovery/routing-decision already worked out server-side
// (recovery-routing-engine.ts + recovery-signal-candidates.ts), hands the
// result to NovaRecommendationCard, and otherwise just exposes the real
// tools underneath via a collapsed "Explore" section rather than a wall of
// equal-status rooms.
//
// "Your Direction" (Recovery Debt / Recovery Direction / Mood Direction
// etc.) is deliberately NOT here yet - the three contradictory Recovery
// Velocity formulas this rebuild is meant to replace with one real,
// explainable Recovery Direction are still in place (RecoveryIntelligenceLayer.tsx,
// server.ts's /api/recovery/recalculate, RecoveryVelocityMap.tsx); building
// a fourth trends section on top of unresolved, disagreeing data sources
// would be exactly the invented-looking-data problem this rebuild exists to
// fix. That's the next PR.

interface RecoveryDirectionResponse {
  band: RecoveryDirectionBand | null;
  explanation: string;
}

interface RoutingDecisionResponse {
  selectedRoute: RouteType;
  selectedModule: string | null;
  routingOutcome: RoutingOutcome;
  reasonCodes: ReasonCode[];
  confidence: ConfidenceLevel;
  bandwidthBand: BandwidthBand | null;
  sufficientBandwidthData: boolean;
  evidenceDetail: string | null;
  evidenceSource: EvidenceSource | null;
}

type ExploreTool =
  | { label: string; kind: 'navigate'; tab: string }
  | { label: string; kind: 'inline'; id: string };

// A "navigate" tool has a real tab of its own already; an "inline" tool
// doesn't (Body Check-In and Weekly Review have never had a dedicated tab -
// they expand in place here instead, available on demand rather than
// surfaced as a daily fixture).
const EXPLORE_TOOLS: ExploreTool[] = [
  { label: 'Energy & Capacity', kind: 'navigate', tab: 'recover' },
  { label: 'Recovery Fuel', kind: 'navigate', tab: 'fuel' },
  { label: 'Nervous System Reset / Reset Studio', kind: 'navigate', tab: 'reset' },
  { label: 'Anxiety Reset', kind: 'navigate', tab: 'anxiety_reset' },
  { label: 'Capacity Firewall / Boundaries', kind: 'navigate', tab: 'communicate' },
  { label: 'Action Engine', kind: 'navigate', tab: 'reflect' },
  { label: 'My Support Circle', kind: 'navigate', tab: 'ally' },
  { label: 'Body Check-In', kind: 'inline', id: 'body_check_in' },
  { label: 'Weekly Review', kind: 'inline', id: 'weekly_review' },
];

const navigateToTab = (tab: string) => {
  window.dispatchEvent(new CustomEvent('navigate_tab', { detail: tab }));
};

export const RecoveryIntelligenceHub = () => {
  const [decision, setDecision] = useState<RoutingDecisionResponse | null>(null);
  const [direction, setDirection] = useState<RecoveryDirectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [showExplore, setShowExplore] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [showMoodCheck, setShowMoodCheck] = useState(false);

  const fetchDecision = useCallback(async (body: Record<string, unknown> = {}) => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    setDismissed(false);
    try {
      const res = await secureApiFetch('/api/recovery/routing-decision', { method: 'POST', data: body });
      const data = await res.json();
      setDecision(data);
    } catch (e) {
      setError('Your latest recommendation isn\'t available yet.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDecision();
    if (!auth.currentUser) return;
    secureApiFetch('/api/recovery/direction')
      .then((res) => res.json())
      .then(setDirection)
      .catch(() => {
        // Non-fatal - "Your Direction" simply doesn't render below.
      });
  }, [fetchDecision]);

  const handleStart = () => {
    if (!decision?.selectedModule) return;
    const tab = MODULE_TARGET_TAB[decision.selectedModule];
    if (tab) navigateToTab(tab);
  };

  const handleSomethingElse = (intent: { label: string; routeType: RouteType | 'browse' }) => {
    if (intent.routeType === 'browse') {
      setShowExplore(true);
      return;
    }
    fetchDecision({ explicitBandwidthReport: 'reflective_bandwidth' });
  };

  const handleBandwidthAnswer = (band: BandwidthBand) => {
    fetchDecision({ explicitBandwidthReport: band });
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-display font-black text-text-main">Recovery Intelligence</h2>
        <p className="text-xs text-text-muted mt-1">One useful next step, not a wall of tools.</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
        </div>
      )}

      {!loading && error && (
        <div className="p-4 bg-surface text-xs text-text-muted rounded-xl">{error}</div>
      )}

      {!loading && !error && decision && !dismissed && (
        <NovaRecommendationCard
          decision={decision}
          onStart={handleStart}
          onSomethingElse={handleSomethingElse}
          onNotNow={() => setDismissed(true)}
          onImOkay={() => setDismissed(true)}
          onBandwidthAnswer={handleBandwidthAnswer}
        />
      )}

      <div className="rounded-xl border border-border bg-surface">
        <button
          onClick={() => setShowMoodCheck((v) => !v)}
          className="w-full flex items-center justify-between p-5 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main transition-colors"
        >
          <span className="flex items-center gap-2"><HeartPulse className="w-4 h-4" /> Quick Mood Check</span>
          {showMoodCheck ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showMoodCheck && (
          <div className="px-5 pb-5">
            <ConnectedMoodPulse />
          </div>
        )}
      </div>

      {!loading && direction && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Your Direction</h3>
          {direction.band ? (
            <p className="text-sm font-bold text-text-main">{RECOVERY_DIRECTION_LABELS[direction.band]}</p>
          ) : null}
          <p className="text-xs text-text-muted">{direction.explanation}</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface">
        <button
          onClick={() => setShowExplore((v) => !v)}
          className="w-full flex items-center justify-between p-5 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-main transition-colors"
        >
          Explore All Tools
          {showExplore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showExplore && (
          <div className="px-5 pb-5 space-y-2">
            {EXPLORE_TOOLS.map((tool) => {
              const key = tool.kind === 'navigate' ? tool.tab : tool.id;
              const isExpanded = tool.kind === 'inline' && expandedTool === tool.id;
              return (
                <div key={key}>
                  <button
                    onClick={() => tool.kind === 'navigate' ? navigateToTab(tool.tab) : setExpandedTool(isExpanded ? null : tool.id)}
                    className="w-full text-left py-2.5 px-3.5 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors flex items-center justify-between"
                  >
                    {tool.label}
                    {tool.kind === 'inline' && (isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                  </button>
                  {isExpanded && tool.id === 'body_check_in' && (
                    <div className="mt-2 p-3.5 bg-card/40 rounded-lg border border-white/5"><ConnectedBodyCheckIn /></div>
                  )}
                  {isExpanded && tool.id === 'weekly_review' && (
                    <div className="mt-2 p-3.5 bg-card/40 rounded-lg border border-white/5"><ConnectedWeeklyReviews /></div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
