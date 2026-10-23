import { useState } from 'react';
import { MessageCircle, Sparkles, CheckCircle2, HelpCircle, Clock, X } from 'lucide-react';
import { NHEI_REFLECTION_PREVIEW_FIXTURES, type NheiReflectionPreviewEntry } from '../../nhei-reflection-preview-fixtures';

// NHEI PHASE 5 - Reflection & correction preview (directive §6).
//
// SYNTHETIC ONLY: every entry rendered here comes from
// nhei-reflection-preview-fixtures.ts, which is fabricated illustrative
// text, never a real evidence record (NheiEvidenceRecord has no raw-text
// field at all - see that file's own header comment). This component
// makes no Firestore/network call and is not mounted into App.tsx's
// live navigation.
//
// Distinguishes, visibly, exactly what directive §6 asks for: what the
// person reported vs. Nova's tentative interpretation vs. user-confirmed
// information vs. an unconfirmed/disputed hypothesis, grouped by
// separate episode, each entry showing its relevant Self(s)/Dimension(s).
// Dismissing or correcting an entry only changes this component's own
// local state - never a real write.

const SELF_SYSTEM_LABELS: Record<string, string> = {
  INTERNAL_SELF: 'Internal',
  RELATIONAL_SELF: 'Relational',
  PERCEIVED_RECEIVED_SELF: 'Perceived ↔ Received',
};

const DIMENSION_LABELS: Record<string, string> = {
  METAPHYSICAL: 'Metaphysical',
  PHYSICAL: 'Physical',
  MENTAL: 'Mental',
  EMOTIONAL: 'Emotional',
};

function TagPill({ label }: { label: string }) {
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-card text-text-muted border border-border">{label}</span>;
}

function EntryCard({
  entry, dismissed, onDismiss, onCorrect, correctionNote,
}: {
  entry: NheiReflectionPreviewEntry;
  dismissed: boolean;
  onDismiss: () => void;
  onCorrect: (text: string) => void;
  correctionNote: string | null;
}) {
  const [correctionDraft, setCorrectionDraft] = useState('');
  const [showCorrectionBox, setShowCorrectionBox] = useState(false);

  if (dismissed) {
    return <div className="text-xs text-text-muted/60 italic px-4 py-2">Dismissed - no longer shown.</div>;
  }

  return (
    <div className="p-4 rounded-xl border border-white/[0.05] bg-surface/50 space-y-2.5">
      <div className="flex items-center gap-2 text-[10px] text-text-muted">
        <Clock className="w-3 h-3" /> {entry.chronologyLabel}
      </div>

      <div className="flex items-start gap-2">
        <MessageCircle className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
        <p className="text-sm text-text-main leading-relaxed">{entry.reportedText}</p>
      </div>

      {entry.confirmationState === 'confirmed' && (
        <div className="flex items-start gap-2 pl-6">
          <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
          <p className="text-xs text-success">You confirmed this.</p>
        </div>
      )}

      {entry.confirmationState === 'hypothesis' && entry.novaTentativeInterpretation && (
        <div className="flex items-start gap-2 pl-6">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-text-muted italic">Nova's tentative read (not confirmed): {entry.novaTentativeInterpretation}</p>
        </div>
      )}

      {entry.confirmationState === 'disputed' && (
        <div className="flex items-start gap-2 pl-6">
          <HelpCircle className="w-3.5 h-3.5 text-text-muted shrink-0 mt-0.5" />
          <p className="text-xs text-text-muted">An earlier guess here was corrected - that guess is no longer shown as current.</p>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap pl-6">
        {entry.selfSystems.map((s) => <TagPill key={s} label={SELF_SYSTEM_LABELS[s] ?? s} />)}
        {entry.dimensions.map((d) => <TagPill key={d} label={DIMENSION_LABELS[d] ?? d} />)}
      </div>

      {correctionNote && (
        <p className="text-xs text-text-muted bg-card/40 rounded-lg border border-white/5 p-2.5">Your correction: "{correctionNote}"</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => setShowCorrectionBox((v) => !v)} className="text-[11px] font-bold text-primary hover:underline">
          That's not quite right
        </button>
        <button onClick={onDismiss} className="text-[11px] font-bold text-text-muted hover:text-text-main flex items-center gap-1">
          <X className="w-3 h-3" /> Dismiss
        </button>
      </div>

      {showCorrectionBox && (
        <div className="flex gap-2 pt-1">
          <input
            value={correctionDraft}
            onChange={(e) => setCorrectionDraft(e.target.value)}
            placeholder="What would you change about this?"
            aria-label="Correction for this reflection entry"
            className="flex-1 text-xs px-3 py-2 rounded-lg border border-border bg-background text-text-main"
          />
          <button
            onClick={() => { if (correctionDraft.trim()) { onCorrect(correctionDraft.trim()); setCorrectionDraft(''); setShowCorrectionBox(false); } }}
            className="text-xs font-bold px-3 py-2 rounded-lg bg-primary/10 text-primary"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

export const NheiReflectionPreview = () => {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [corrections, setCorrections] = useState<Record<string, string>>({});

  return (
    <div className="card space-y-5 bg-background border border-border">
      <div>
        <h3 className="text-xl font-bold text-text-main mb-1">Your Reflections - preview</h3>
        <p className="text-xs text-text-muted max-w-xl leading-relaxed">
          This is a feature-disabled preview using made-up example entries, not anything real - it exists to show what a real
          reflection view would look like once this feature can be turned on. Dismissing or correcting an entry here only changes
          this preview, nothing is saved anywhere.
        </p>
      </div>

      <div className="space-y-6">
        {NHEI_REFLECTION_PREVIEW_FIXTURES.map((episode) => (
          <div key={episode.episodeId} className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{episode.label}</h4>
            <div className="space-y-2.5">
              {episode.entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  dismissed={dismissedIds.has(entry.id)}
                  correctionNote={corrections[entry.id] ?? null}
                  onDismiss={() => setDismissedIds((prev) => new Set(prev).add(entry.id))}
                  onCorrect={(text) => setCorrections((prev) => ({ ...prev, [entry.id]: text }))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
