import { useEffect, useState, useCallback, type ComponentType } from 'react';
import { ChevronDown, ChevronUp, Loader2, HeartPulse } from 'lucide-react';
import { auth } from '../lib/firebase';
import { secureApiFetch } from '../lib/secure-api';
import { NovaRecommendationCard } from './NovaRecommendationCard';
import { ConnectedMoodPulse, ConnectedBodyCheckIn, ConnectedWeeklyReviews, ConnectedEnergyBudget } from './ConnectedRecoveryModules';
import { PressurePatternCapture } from './PressurePatternCapture';
import { RelationalLoadSignal } from './RelationalLoadSignal';
import { ReturnToWorkPlanner } from './ReturnToWorkPlanner';
import { MODULE_TARGET_TAB, moduleDisplayName } from '../../recovery-decision-copy';
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

interface PendingOutcomeCheck {
  decisionId: string;
  selectedModule: string | null;
}

interface RoutingDecisionResponse {
  decisionId: string | null;
  selectedRoute: RouteType;
  selectedModule: string | null;
  routingOutcome: RoutingOutcome;
  reasonCodes: ReasonCode[];
  confidence: ConfidenceLevel;
  bandwidthBand: BandwidthBand | null;
  sufficientBandwidthData: boolean;
  evidenceDetail: string | null;
  evidenceSource: EvidenceSource | null;
  pendingOutcomeCheck: PendingOutcomeCheck | null;
}

const HELPFULNESS_OPTIONS: { value: 'better' | 'same' | 'not_really' | 'not_sure'; label: string }[] = [
  { value: 'better', label: 'A little better' },
  { value: 'same', label: 'About the same' },
  { value: 'not_really', label: 'Not really' },
  { value: 'not_sure', label: 'Not sure' },
];

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
  { label: 'Pressure Pattern Capture', kind: 'inline', id: 'pressure_pattern' },
  { label: 'Relational Load Signal', kind: 'inline', id: 'relational_load' },
  { label: 'Energy Capacity Log (category view)', kind: 'inline', id: 'energy_capacity_log' },
  { label: 'Return-to-Work Planner', kind: 'inline', id: 'return_to_work' },
];

const INLINE_TOOL_COMPONENTS: Record<string, ComponentType> = {
  body_check_in: ConnectedBodyCheckIn,
  weekly_review: ConnectedWeeklyReviews,
  pressure_pattern: PressurePatternCapture,
  relational_load: RelationalLoadSignal,
  energy_capacity_log: ConnectedEnergyBudget,
  return_to_work: ReturnToWorkPlanner,
};

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
  const [pendingOutcomeCheck, setPendingOutcomeCheck] = useState<PendingOutcomeCheck | null>(null);

  const reportOutcome = useCallback((decisionId: string | null, action: 'started' | 'declined' | 'completed' | 'abandoned', helpfulness?: string) => {
    if (!decisionId || !auth.currentUser) return;
    secureApiFetch('/api/recovery/routing-outcome', { method: 'POST', data: { decisionId, action, helpfulness } }).catch(() => {
      // Non-fatal - the primary recommendation flow isn't blocked by the outcome write failing.
    });
  }, []);

  const fetchDecision = useCallback(async (body: Record<string, unknown> = {}) => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError('');
    setDismissed(false);
    try {
      const res = await secureApiFetch('/api/recovery/routing-decision', { method: 'POST', data: body });
      const data = await res.json();
      setDecision(data);
      setPendingOutcomeCheck(data.pendingOutcomeCheck ?? null);
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
    reportOutcome(decision.decisionId, 'started');
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

  const handleNotNow = () => {
    reportOutcome(decision?.decisionId ?? null, 'declined');
    setDismissed(true);
  };

  const handleImOkay = () => {
    reportOutcome(decision?.decisionId ?? null, 'declined');
    setDismissed(true);
  };

  const handleBandwidthAnswer = (band: BandwidthBand) => {
    fetchDecision({ explicitBandwidthReport: band });
  };

  const handlePendingOutcomeAnswer = (helpfulness: 'better' | 'same' | 'not_really' | 'not_sure') => {
    if (!pendingOutcomeCheck) return;
    reportOutcome(pendingOutcomeCheck.decisionId, 'completed', helpfulness);
    setPendingOutcomeCheck(null);
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

      {!loading && !error && pendingOutcomeCheck && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <p className="text-sm font-bold text-text-main">
            How did {moduleDisplayName(pendingOutcomeCheck.selectedModule)} go?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {HELPFULNESS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handlePendingOutcomeAnswer(option.value)}
                className="py-2.5 px-3 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && decision && !dismissed && (
        <NovaRecommendationCard
          decision={decision}
          onStart={handleStart}
          onSomethingElse={handleSomethingElse}
          onNotNow={handleNotNow}
          onImOkay={handleImOkay}
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
              const InlineComponent = tool.kind === 'inline' ? INLINE_TOOL_COMPONENTS[tool.id] : null;
              return (
                <div key={key}>
                  <button
                    onClick={() => tool.kind === 'navigate' ? navigateToTab(tool.tab) : setExpandedTool(isExpanded ? null : tool.id)}
                    className="w-full text-left py-2.5 px-3.5 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors flex items-center justify-between"
                  >
                    {tool.label}
                    {tool.kind === 'inline' && (isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                  </button>
                  {isExpanded && InlineComponent && (
                    <div className="mt-2 p-3.5 bg-card/40 rounded-lg border border-white/5"><InlineComponent /></div>
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
