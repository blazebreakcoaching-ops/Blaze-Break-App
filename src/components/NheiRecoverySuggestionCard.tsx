import { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import type { NheiRecoveryArbitrationResult } from '../../nhei-recovery-arbitration';
import type { NheiRecoverySuggestion } from '../../nhei-recovery-bridge-types';
import {
  initNheiRecoveryInteractionState,
  applyNheiRecoveryInteraction,
  type NheiRecoveryInteractionState,
} from '../../nhei-recovery-interaction-contract';

// NHEI PHASE 5 - Recovery suggestion card (directive §3), modelled
// directly on NovaRecommendationCard.tsx's own conventions (same
// structure, same class names, same "never more than one primary
// recommendation, always a way out" discipline) rather than inventing a
// separate visual language for NHEI. The real difference from that
// card: this one is driven by nhei-recovery-arbitration.ts's output and
// every button here calls into the real, tested
// nhei-recovery-interaction-contract.ts reducer - no decorative control
// without a backing state transition (directive §3: "do not use
// decorative controls or buttons without functional state transitions").
//
// OFFLINE AT THIS PHASE: this component has no Firestore/network call of
// its own and is not mounted into App.tsx's live navigation - see
// NheiPhase5Preview.tsx for where it is actually rendered today (an
// offline developer preview only).
//
// Accepting a recommendation never modifies anything outside this
// component's own local state - see onAccept's own doc comment below.

export interface NheiRecoverySuggestionCardProps {
  arbitration: NheiRecoveryArbitrationResult;
  // Called when the user accepts a suggestion - directive §3: "Accepting
  // a recommendation must not automatically modify external systems."
  // This component itself never calls a connector, writes evidence, or
  // navigates anywhere; it only reports the user's choice upward. A
  // future caller deciding what (if anything) happens next is a
  // separate, explicit decision outside this component.
  onAccept?: (suggestion: NheiRecoverySuggestion) => void;
}

function CapacityBadge({ suitability }: { suitability: NheiRecoverySuggestion['capacitySuitability'] }) {
  if (suitability === 'suitable') {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-success/15 text-success">Fits your capacity</span>;
  }
  if (suitability === 'unknown') {
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-card text-text-muted border border-border">Capacity unknown</span>;
  }
  return null; // 'unsuitable' suggestions are never rendered as a default pick by this component at all
}

function InterpretationBadge({ kind }: { kind: NheiRecoverySuggestion['interpretationKind'] }) {
  const labels: Record<NheiRecoverySuggestion['interpretationKind'], string> = {
    confirmed: 'Based on what you confirmed',
    tentative: 'A tentative pattern, not settled',
    educational: 'General information',
  };
  return <span className="text-[11px] text-text-muted italic">{labels[kind]}</span>;
}

export const NheiRecoverySuggestionCard = ({ arbitration, onAccept }: NheiRecoverySuggestionCardProps) => {
  const [interaction, setInteraction] = useState<NheiRecoveryInteractionState>(() => initNheiRecoveryInteractionState(arbitration));
  const [showWhyThis, setShowWhyThis] = useState(false);
  const [viewingAlternativeId, setViewingAlternativeId] = useState<string | null>(null);

  const { selected, alternatives, unsuitableForCapacity, abstentionReason, selectionReason } = arbitration;

  const selectedSuggestion = selected && interaction.selectedSuggestionId === selected.suggestionId ? selected
    : [selected, ...alternatives].find((s) => s?.suggestionId === interaction.selectedSuggestionId) ?? null;

  if (interaction.declinedAll) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 space-y-2">
        <p className="text-sm text-text-muted">You said not right now - that's completely fine. Nova won't repeat this suggestion for this interaction.</p>
      </div>
    );
  }

  if (!selectedSuggestion) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 space-y-3">
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-main">No suggestion right now</h3>
        <p className="text-sm text-text-muted leading-relaxed">
          {abstentionReason === 'all_unsuitable_for_capacity' && 'The suggestions that would otherwise apply don’t fit your currently available capacity.'}
          {abstentionReason === 'all_targets_unavailable' && 'The relevant tool is currently unavailable.'}
          {abstentionReason === 'no_candidates' && 'Nothing in what you’ve shared points to a specific suggestion right now.'}
          {!abstentionReason && (selectionReason ?? 'No suggestion is available right now.')}
        </p>
        {unsuitableForCapacity.length > 0 && (
          <div className="pt-2 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Exists, but may not fit right now</p>
            {unsuitableForCapacity.map((s) => (
              <p key={s.suggestionId} className="text-xs text-text-muted">{s.relevantCapabilityLabel}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  const act = (action: Parameters<typeof applyNheiRecoveryInteraction>[1]) => {
    const next = applyNheiRecoveryInteraction(interaction, action);
    setInteraction(next);
  };

  const viewedAlternative = alternatives.find((a) => a.suggestionId === viewingAlternativeId) ?? null;

  return (
    <div className="rounded-xl border border-border bg-surface p-6 space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="w-2 h-2 rounded-full bg-primary" />
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-main">Nova noticed something</h3>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-serif italic text-text-main leading-snug">{selectedSuggestion.relevantCapabilityLabel}</p>
        <CapacityBadge suitability={selectedSuggestion.capacitySuitability} />
      </div>
      <p className="text-sm font-medium text-text-muted">{selectedSuggestion.reason}</p>
      <InterpretationBadge kind={selectedSuggestion.interpretationKind} />

      <button
        onClick={() => { act({ type: 'accept', suggestionId: selectedSuggestion.suggestionId }); onAccept?.(selectedSuggestion); }}
        className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 group transition-all"
      >
        <span>Try {selectedSuggestion.relevantCapabilityLabel}</span>
        <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
      </button>

      <div className="flex items-center justify-between text-xs font-bold flex-wrap gap-y-2">
        <button
          onClick={() => act({ type: 'dismiss', suggestionId: selectedSuggestion.suggestionId })}
          className="text-text-muted hover:text-text-main transition-colors"
        >
          Dismiss
        </button>
        <button
          onClick={() => { act({ type: 'explain', suggestionId: selectedSuggestion.suggestionId }); setShowWhyThis((v) => !v); }}
          className="flex items-center gap-1 text-text-muted hover:text-text-main transition-colors"
        >
          Why this? {showWhyThis ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => act({ type: 'correct_interpretation', suggestionId: selectedSuggestion.suggestionId })}
          className="flex items-center gap-1 text-text-muted hover:text-text-main transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" /> That's not quite right
        </button>
        <button onClick={() => act({ type: 'decline_all' })} className="text-text-muted hover:text-text-main transition-colors">
          Not now
        </button>
      </div>

      {interaction.correctedSuggestionIds.includes(selectedSuggestion.suggestionId) && (
        <p className="text-xs text-text-muted p-3 bg-card/40 rounded-lg border border-white/5">
          Noted - Nova's interpretation here has been flagged as something you'd correct. This doesn't change what was already confirmed elsewhere.
        </p>
      )}

      {showWhyThis && (
        <div className="text-xs text-text-muted leading-relaxed p-3.5 bg-card/40 rounded-lg border border-white/5 space-y-1.5">
          <p>{selectedSuggestion.explanationForUser}</p>
          {selectedSuggestion.evidenceReferences.length > 0 && (
            <p className="text-[10px] text-text-muted/70">Based on {selectedSuggestion.evidenceReferences.length} thing{selectedSuggestion.evidenceReferences.length === 1 ? '' : 's'} you've shared.</p>
          )}
        </div>
      )}

      {alternatives.length > 0 && (
        <div className="pt-1 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Other options</p>
          <div className="grid grid-cols-1 gap-2">
            {alternatives.map((alt) => (
              <button
                key={alt.suggestionId}
                onClick={() => { act({ type: 'view_alternative', suggestionId: alt.suggestionId }); setViewingAlternativeId(alt.suggestionId); }}
                className="text-left py-2.5 px-3.5 rounded-lg border border-border text-xs font-bold text-text-main hover:border-primary/50 transition-colors flex items-center justify-between"
              >
                <span>{alt.relevantCapabilityLabel}</span>
                <CapacityBadge suitability={alt.capacitySuitability} />
              </button>
            ))}
          </div>
          {viewedAlternative && (
            <div className="text-xs text-text-muted p-3 bg-card/40 rounded-lg border border-white/5 space-y-2">
              <p>{viewedAlternative.reason}</p>
              <button
                onClick={() => act({ type: 'accept', suggestionId: viewedAlternative.suggestionId })}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                Use this instead
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
