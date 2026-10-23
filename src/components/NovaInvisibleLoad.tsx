import { useState } from 'react';
import { Layers, X, Clock3, RotateCcw, HandHeart, HelpCircle } from 'lucide-react';
import {
  initNovaInvisibleLoadContext, addInvisibleLoadItem, correctInvisibleLoadItem,
  removeInvisibleLoadItem, deferInvisibleLoadItem, undeferInvisibleLoadItem, optOutOfInvisibleLoad,
  type NovaInvisibleLoadContext, type NovaInvisibleLoadCategory, type NovaInvisibleLoadItem,
} from '../../nova-invisible-load-contract';
import { buildTakeTheLoadProblemFromInvisibleLoadItem } from '../../nova-invisible-load-take-the-load-bridge';
import type { NovaStatedPracticalProblem } from '../../nova-take-the-load-types';

// NOVA PHASE 5C - Invisible Load experience (directive §4).
//
// Mobile-first: single-column stack, full-width controls, no hover-only
// affordance (every action is a real <button>, always visible, never
// revealed only on :hover). All state here is local (useState) - this
// component makes no Firestore/network call and is not mounted into
// App.tsx's live navigation (see NheiPhase5Preview.tsx), matching the
// "temporary conversation context, not retained information" boundary
// directive §3/§4 asks this and Before Words to both respect: nothing a
// user types here outlives this component unmounting, the same as
// nhei-before-words-contract.ts's own "proceed without retaining" default.
//
// "Do not turn every obligation into a task automatically": there is no
// bulk action anywhere in this file. Getting help with an item is a
// single, per-item button (onRequestHelp), calling the bridge's
// single-item function - never a loop over every item in the list.

const CATEGORY_LABEL: Record<NovaInvisibleLoadCategory, string> = {
  commitment: 'Commitment',
  obligation: 'Obligation',
  practical_friction: 'Practical friction',
};

function ItemRow({
  item, onCorrect, onRemove, onToggleDefer, onRequestHelp,
}: {
  item: NovaInvisibleLoadItem;
  onCorrect: (text: string) => void;
  onRemove: () => void;
  onToggleDefer: () => void;
  onRequestHelp: () => void;
}) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div className="p-4 rounded-xl border border-white/[0.05] bg-surface/50 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-card text-text-muted border border-border mb-1.5">
            {CATEGORY_LABEL[item.category]}
          </span>
          <p className="text-sm text-text-main leading-relaxed break-words">{item.description}</p>
          {!item.userCertain && <p className="text-[11px] text-text-muted italic mt-1">You weren't sure this belongs here - that's kept, not resolved for you.</p>}
          {item.deferred && <p className="text-[11px] text-amber-500 mt-1 flex items-center gap-1"><Clock3 className="w-3 h-3" /> Deferred - not acted on right now</p>}
          {item.corrections.map((c, i) => (
            <p key={i} className="text-[11px] text-text-muted bg-card/40 rounded-lg border border-white/5 p-2 mt-1.5">Correction: {c}</p>
          ))}
        </div>
        <button onClick={onRemove} aria-label={`Remove: ${item.description}`} className="shrink-0 w-11 h-11 flex items-center justify-center text-text-muted hover:text-text-main rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          onClick={onToggleDefer}
          className="min-h-11 flex-1 sm:flex-none px-3 py-2 text-xs font-bold rounded-lg border border-border text-text-muted hover:text-text-main flex items-center justify-center gap-1.5"
        >
          {item.deferred ? <><RotateCcw className="w-3.5 h-3.5" /> Act on this now</> : <><Clock3 className="w-3.5 h-3.5" /> Not right now</>}
        </button>
        <button
          onClick={() => setShowCorrection((v) => !v)}
          className="min-h-11 flex-1 sm:flex-none px-3 py-2 text-xs font-bold rounded-lg border border-border text-text-muted hover:text-text-main flex items-center justify-center gap-1.5"
        >
          <HelpCircle className="w-3.5 h-3.5" /> That's not quite right
        </button>
        {!item.deferred && (
          <button
            onClick={onRequestHelp}
            className="min-h-11 flex-1 sm:flex-none px-3 py-2 text-xs font-bold rounded-lg bg-primary/10 text-primary flex items-center justify-center gap-1.5"
          >
            <HandHeart className="w-3.5 h-3.5" /> Get help with this
          </button>
        )}
      </div>

      {showCorrection && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What would you change about this?"
            aria-label={`Correction for: ${item.description}`}
            className="flex-1 min-h-11 text-xs px-3 py-2 rounded-lg border border-border bg-background text-text-main"
          />
          <button
            onClick={() => { if (draft.trim()) { onCorrect(draft.trim()); setDraft(''); setShowCorrection(false); } }}
            className="min-h-11 text-xs font-bold px-4 rounded-lg bg-primary/10 text-primary"
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

export const NovaInvisibleLoad = ({
  capacityBand = null,
  onRequestHelp,
}: {
  capacityBand?: NovaStatedPracticalProblem['capacityBand'];
  onRequestHelp?: (problem: NovaStatedPracticalProblem) => void;
}) => {
  const [context, setContext] = useState<NovaInvisibleLoadContext>(initNovaInvisibleLoadContext);
  const [draftText, setDraftText] = useState('');
  const [draftCategory, setDraftCategory] = useState<NovaInvisibleLoadCategory>('obligation');
  const [draftUncertain, setDraftUncertain] = useState(false);

  const submit = () => {
    if (!draftText.trim()) return;
    setContext((prev) => addInvisibleLoadItem(prev, draftText.trim(), draftCategory, !draftUncertain));
    setDraftText('');
    setDraftUncertain(false);
  };

  const requestHelpWith = (item: NovaInvisibleLoadItem) => {
    const result = buildTakeTheLoadProblemFromInvisibleLoadItem(item, capacityBand);
    if (result.ok) onRequestHelp?.(result.problem);
  };

  if (context.optedOut) {
    return (
      <div className="card space-y-3 bg-background border border-border">
        <p className="text-sm text-text-muted">You've chosen not to record anything here. Nothing you described is kept.</p>
        <button onClick={() => setContext(initNovaInvisibleLoadContext())} className="min-h-11 text-xs font-bold text-primary hover:underline self-start">
          Start again
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-5 bg-background border border-border">
      <div>
        <h3 className="text-lg font-bold text-text-main flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> What's on your plate</h3>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Describe obligations, competing demands, or everyday friction, in your own words. This is kept only for this session -
          nothing here is saved, scored, or turned into a task unless you ask for help with a specific one.
        </p>
      </div>

      <div className="space-y-2.5">
        {context.items.length === 0 && <p className="text-xs text-text-muted/70 italic">Nothing added yet.</p>}
        {context.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onCorrect={(text) => setContext((prev) => correctInvisibleLoadItem(prev, item.id, text))}
            onRemove={() => setContext((prev) => removeInvisibleLoadItem(prev, item.id))}
            onToggleDefer={() => setContext((prev) => (item.deferred ? undeferInvisibleLoadItem(prev, item.id) : deferInvisibleLoadItem(prev, item.id)))}
            onRequestHelp={() => requestHelpWith(item)}
          />
        ))}
      </div>

      <div className="space-y-2.5 pt-3 border-t border-border">
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Something you're carrying right now..."
          aria-label="Describe an obligation, commitment, or friction"
          rows={3}
          className="w-full text-sm p-3 rounded-lg border border-border bg-surface text-text-main resize-none"
        />
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value as NovaInvisibleLoadCategory)}
            aria-label="Category"
            className="min-h-11 flex-1 text-xs px-3 rounded-lg border border-border bg-surface text-text-main"
          >
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="min-h-11 flex items-center gap-2 text-xs text-text-muted px-3 rounded-lg border border-border">
            <input type="checkbox" checked={draftUncertain} onChange={(e) => setDraftUncertain(e.target.checked)} />
            Not sure this belongs here
          </label>
        </div>
        <button onClick={submit} disabled={!draftText.trim()} className="btn-primary min-h-11 w-full justify-center disabled:opacity-50">
          Add
        </button>
      </div>

      <button onClick={() => setContext(optOutOfInvisibleLoad(context))} className="text-[11px] text-text-muted/70 hover:text-text-muted underline">
        I'd rather not record any of this
      </button>
    </div>
  );
};
