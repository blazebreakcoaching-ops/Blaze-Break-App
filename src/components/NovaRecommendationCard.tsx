import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { buildDecisionCopy, SOMETHING_ELSE_INTENTS, BANDWIDTH_SELF_REPORT_OPTIONS, DecisionCopyInput } from '../../recovery-decision-copy';
import type { RouteType } from '../../recovery-routing-engine';
import type { BandwidthBand } from '../../recovery-capacity-gate';

// The one reusable card the whole Recovery Intelligence rebuild collapses
// onto: Decision Compression made visible. It never shows more than one
// primary recommendation, never shows an internal route label, a
// confidence percentage or algorithm language, and always offers a way out
// (Something Else / Not Now / I'm Okay) alongside the primary action. All
// the actual decision logic already happened server-side (recovery-
// routing-engine.ts) and in recovery-decision-copy.ts - this component only
// renders the result and reports back what the person chose.

interface NovaRecommendationCardProps {
  decision: DecisionCopyInput;
  onStart: () => void;
  onSomethingElse: (intent: { label: string; routeType: RouteType | 'browse' }) => void;
  onNotNow: () => void;
  onImOkay: () => void;
  onBandwidthAnswer?: (band: BandwidthBand) => void;
}

export const NovaRecommendationCard = ({
  decision, onStart, onSomethingElse, onNotNow, onImOkay, onBandwidthAnswer,
}: NovaRecommendationCardProps) => {
  const [showWhyThis, setShowWhyThis] = useState(false);
  const [showSomethingElse, setShowSomethingElse] = useState(false);
  const copy = buildDecisionCopy(decision);
  const isSelected = decision.routingOutcome === 'selected';

  return (
    <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-2 h-2 rounded-full bg-primary" />
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-main">For right now</h3>
      </div>

      <p className="text-lg font-serif italic text-text-main leading-snug">{copy.headline}</p>
      <p className="text-sm font-medium text-text-muted">{copy.rationale}</p>

      {copy.showBandwidthQuestion && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {BANDWIDTH_SELF_REPORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onBandwidthAnswer?.(option.value)}
              className="py-2.5 px-3 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {isSelected && (
        <>
          <button
            onClick={onStart}
            className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 group transition-all"
          >
            <span>{copy.primaryActionLabel}</span>
            <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
          </button>

          <div className="flex items-center justify-between text-xs font-bold">
            <button onClick={() => setShowSomethingElse((v) => !v)} className="text-text-muted hover:text-text-main transition-colors">
              Something Else
            </button>
            <button onClick={() => setShowWhyThis((v) => !v)} className="flex items-center gap-1 text-text-muted hover:text-text-main transition-colors">
              Why this? {showWhyThis ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onNotNow} className="text-text-muted hover:text-text-main transition-colors">
              Not Now
            </button>
          </div>
        </>
      )}

      {!isSelected && (
        <div className="flex items-center justify-between text-xs font-bold">
          <button onClick={() => setShowSomethingElse((v) => !v)} className="text-text-muted hover:text-text-main transition-colors">
            Something Else
          </button>
          <button onClick={onImOkay} className="text-text-muted hover:text-text-main transition-colors">
            I'm Okay
          </button>
        </div>
      )}

      {showWhyThis && (
        <p className="text-xs text-text-muted leading-relaxed p-3.5 bg-card/40 rounded-lg border border-white/5">{copy.whyThis}</p>
      )}

      {showSomethingElse && (
        <div className="grid grid-cols-1 gap-2 pt-1">
          {SOMETHING_ELSE_INTENTS.map((intent) => (
            <button
              key={intent.label}
              onClick={() => onSomethingElse(intent)}
              className="text-left py-2.5 px-3.5 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors"
            >
              {intent.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
