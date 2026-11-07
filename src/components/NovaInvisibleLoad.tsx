import { useState } from 'react';
import { Layers, X, Clock3, RotateCcw, HandHeart, HelpCircle, ListChecks, Compass, Trash2 } from 'lucide-react';
import {
  initNovaInvisibleLoadContext, addInvisibleLoadItem, correctInvisibleLoadItem,
  removeInvisibleLoadItem, deferInvisibleLoadItem, undeferInvisibleLoadItem, optOutOfInvisibleLoad,
  addBreakdownStep, removeBreakdownStep,
  type NovaInvisibleLoadContext, type NovaInvisibleLoadCategory, type NovaInvisibleLoadItem,
} from '../../nova-invisible-load-contract';
import { resolveInvisibleLoadHelpChoice, type NovaInvisibleLoadHelpChoice } from '../../nova-invisible-load-help-contract';
import type { NovaStatedPracticalProblem } from '../../nova-take-the-load-types';

// NOVA PHASE 5C - Invisible Load experience (directive §4), extended
// Phase 5F Agentic Expansion (directive §3): "the user can select one
// obligation and choose what help they want" among five appropriate
// actions - protect time, defer/reprioritise, break into steps, explore
// an existing recovery tool, or leave unchanged. See
// nova-invisible-load-help-contract.ts for exactly how each choice is
// resolved and why (reuse was deliberate where it was honest, and
// deliberately skipped where it would have required inventing a signal
// this item doesn't carry).
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
// bulk action anywhere in this file. Choosing help is a single, per-item
// menu - never a loop over every item in the list. Declining to choose
// any help (closing the menu, or choosing "leave unchanged") is never
// treated as resistance or recorded anywhere as a trait of the user.

const CATEGORY_LABEL: Record<NovaInvisibleLoadCategory, string> = {
  commitment: 'Commitment',
  obligation: 'Obligation',
  practical_friction: 'Practical friction',
};

const HELP_CHOICE_LABEL: Record<NovaInvisibleLoadHelpChoice, string> = {
  protect_time: 'Protect time for it',
  defer_or_reprioritise: 'Defer or reprioritise it',
  break_into_steps: 'Break it into steps',
  explore_recovery_tool: 'Explore a recovery tool',
  leave_unchanged: 'Leave it unchanged',
};

function ItemRow({
  item, onCorrect, onRemove, onToggleDefer, onHelpChoice, onAddStep, onRemoveStep, exploreNote,
}: {
  item: NovaInvisibleLoadItem;
  onCorrect: (text: string) => void;
  onRemove: () => void;
  onToggleDefer: () => void;
  onHelpChoice: (choice: NovaInvisibleLoadHelpChoice) => void;
  onAddStep: (step: string) => void;
  onRemoveStep: (index: number) => void;
  exploreNote: { tool: string; reason: string } | null;
}) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [draft, setDraft] = useState('');
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [stepDraft, setStepDraft] = useState('');

  const chooseHelp = (choice: NovaInvisibleLoadHelpChoice) => {
    setShowHelpMenu(false);
    if (choice === 'break_into_steps') {
      setShowSteps(true);
      return;
    }
    onHelpChoice(choice);
  };

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
            onClick={() => setShowHelpMenu((v) => !v)}
            className="min-h-11 flex-1 sm:flex-none px-3 py-2 text-xs font-bold rounded-lg bg-primary/10 text-primary flex items-center justify-center gap-1.5"
          >
            <HandHeart className="w-3.5 h-3.5" /> Get help with this
          </button>
        )}
      </div>

      {showHelpMenu && !item.deferred && (
        <div className="p-3 rounded-lg border border-border bg-background space-y-1.5">
          <p className="text-[11px] text-text-muted">What kind of help would be useful?</p>
          {(['protect_time', 'defer_or_reprioritise', 'break_into_steps', 'explore_recovery_tool', 'leave_unchanged'] as NovaInvisibleLoadHelpChoice[]).map((choice) => (
            <button
              key={choice}
              onClick={() => chooseHelp(choice)}
              className="w-full min-h-10 text-left text-xs px-3 py-2 rounded-lg border border-border text-text-main hover:border-primary"
            >
              {HELP_CHOICE_LABEL[choice]}
            </button>
          ))}
        </div>
      )}

      {showSteps && (
        <div className="p-3 rounded-lg border border-border bg-background space-y-2">
          <p className="text-[11px] text-text-muted flex items-center gap-1.5"><ListChecks className="w-3.5 h-3.5" /> Your own steps - Nova doesn't generate these.</p>
          {item.breakdownSteps.map((step, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs text-text-main bg-surface/40 rounded-lg px-2.5 py-1.5">
              <span>{step}</span>
              <button onClick={() => onRemoveStep(i)} aria-label={`Remove step: ${step}`} className="text-text-muted hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              placeholder="Add a step"
              aria-label="Add a breakdown step"
              className="flex-1 min-h-10 text-xs px-3 rounded-lg border border-border bg-surface text-text-main"
            />
            <button
              onClick={() => { if (stepDraft.trim()) { onAddStep(stepDraft.trim()); setStepDraft(''); } }}
              aria-label="Add step"
              className="min-h-10 text-xs font-bold px-3 rounded-lg bg-primary/10 text-primary"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {exploreNote && (
        <p className="text-xs text-text-main p-3 rounded-lg border border-border bg-background flex items-start gap-1.5">
          <Compass className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          <span><span className="font-bold">{exploreNote.tool}</span> - {exploreNote.reason}</span>
        </p>
      )}

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
  onProtectTime,
  onDeferTask,
  context: controlledContext,
  onContextChange,
}: {
  capacityBand?: NovaStatedPracticalProblem['capacityBand'];
  onProtectTime?: (problem: NovaStatedPracticalProblem) => void;
  onDeferTask?: (taskDescription: string) => void;
  // Phase 5G, directive §3 ("exiting without losing appropriate saved
  // progress") - optional, backward-compatible lifted state. A caller that
  // mounts/unmounts this component as part of a larger sequence (e.g.
  // NovaAgenticJourney, which conditionally renders it per journey step)
  // should pass both, so items the user typed survive a round trip through
  // another step instead of being silently discarded on remount. Omitting
  // both keeps the original self-contained, uncontrolled behaviour.
  context?: NovaInvisibleLoadContext;
  onContextChange?: (context: NovaInvisibleLoadContext) => void;
}) => {
  const [internalContext, setInternalContext] = useState<NovaInvisibleLoadContext>(initNovaInvisibleLoadContext);
  const context = controlledContext ?? internalContext;
  const setContext = (updater: NovaInvisibleLoadContext | ((prev: NovaInvisibleLoadContext) => NovaInvisibleLoadContext)) => {
    const next = typeof updater === 'function' ? (updater as (prev: NovaInvisibleLoadContext) => NovaInvisibleLoadContext)(context) : updater;
    setInternalContext(next);
    onContextChange?.(next);
  };
  const [draftText, setDraftText] = useState('');
  const [draftCategory, setDraftCategory] = useState<NovaInvisibleLoadCategory>('obligation');
  const [draftUncertain, setDraftUncertain] = useState(false);
  const [exploreNotes, setExploreNotes] = useState<Record<string, { tool: string; reason: string }>>({});

  const submit = () => {
    if (!draftText.trim()) return;
    setContext((prev) => addInvisibleLoadItem(prev, draftText.trim(), draftCategory, !draftUncertain));
    setDraftText('');
    setDraftUncertain(false);
  };

  const handleHelpChoice = (item: NovaInvisibleLoadItem, choice: NovaInvisibleLoadHelpChoice) => {
    const outcome = resolveInvisibleLoadHelpChoice(item, choice, capacityBand);
    if (outcome.kind === 'protect_time') onProtectTime?.(outcome.problem);
    else if (outcome.kind === 'defer_or_reprioritise') onDeferTask?.(outcome.taskDescription);
    else if (outcome.kind === 'explore_recovery_tool') setExploreNotes((prev) => ({ ...prev, [item.id]: { tool: outcome.suggestedTool, reason: outcome.reason } }));
    // 'break_into_steps', 'leave_unchanged', and 'refused' need no further action here -
    // the row itself opens its own step editor, and a refusal is never surfaced as an error.
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
            onHelpChoice={(choice) => handleHelpChoice(item, choice)}
            onAddStep={(step) => setContext((prev) => addBreakdownStep(prev, item.id, step))}
            onRemoveStep={(index) => setContext((prev) => removeBreakdownStep(prev, item.id, index))}
            exploreNote={exploreNotes[item.id] ?? null}
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
