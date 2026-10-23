import { useState } from 'react';
import { Feather, SkipForward, Check } from 'lucide-react';
import {
  initNheiBeforeWordsState, beginFreeExpression, setFreeExpressionText, moveToOptionalPrompts,
  answerPrompt, skipPrompt, moveToReview, addCorrection, decideProceedWithoutRetaining,
  NHEI_BEFORE_WORDS_PROMPTS, type NheiBeforeWordsPromptCategory, type NheiBeforeWordsState,
} from '../../nhei-before-words-contract';

// NHEI PHASE 5 - "Before Words" UX foundation (directive §7).
//
// A UX prototype and content foundation, not clinical assessment - no
// model call anywhere in this component, no diagnostic label is ever
// required, every prompt is skippable, and "proceed without retaining"
// is presented as an equally valid ending, never the lesser option. All
// state here is local to this component via
// nhei-before-words-contract.ts's pure reducer - no network call.
//
// OFFLINE AT THIS PHASE: not mounted into App.tsx's live navigation.

const PROMPT_CATEGORIES = Object.keys(NHEI_BEFORE_WORDS_PROMPTS) as NheiBeforeWordsPromptCategory[];

export const NheiBeforeWords = () => {
  const [state, setState] = useState<NheiBeforeWordsState>(initNheiBeforeWordsState);
  const [correctionDraft, setCorrectionDraft] = useState('');

  if (state.step === 'intro') {
    return (
      <div className="card space-y-4 bg-background border border-border max-w-lg">
        <div className="flex items-center gap-2">
          <Feather className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold text-text-main">Before Words</h3>
        </div>
        <p className="text-sm text-text-muted leading-relaxed">
          Sometimes it's hard to put something into words right away. You can write whatever comes to mind, however unfinished
          it feels - there's no right way to describe it, and nothing here needs a specific label.
        </p>
        <button onClick={() => setState(beginFreeExpression(state))} className="btn-primary py-3 px-5 text-sm self-start">
          Start whenever you're ready
        </button>
      </div>
    );
  }

  if (state.step === 'free_expression') {
    return (
      <div className="card space-y-4 bg-background border border-border max-w-lg">
        <h3 className="text-sm font-bold text-text-main">Write whatever comes to mind</h3>
        <textarea
          value={state.freeExpressionText}
          onChange={(e) => setState(setFreeExpressionText(state, e.target.value))}
          placeholder="There's no wrong way to start..."
          aria-label="Free expression - write whatever you'd like"
          rows={5}
          className="w-full text-sm p-3 rounded-lg border border-border bg-surface text-text-main resize-none"
        />
        <div className="flex items-center justify-between">
          <button onClick={() => setState(decideProceedWithoutRetaining(state))} className="text-xs font-bold text-text-muted hover:text-text-main">
            I'd rather not write anything right now
          </button>
          <button onClick={() => setState(moveToOptionalPrompts(state))} className="btn-primary py-2.5 px-4 text-xs">
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (state.step === 'optional_prompts') {
    return (
      <div className="card space-y-4 bg-background border border-border max-w-lg">
        <h3 className="text-sm font-bold text-text-main">A few optional questions - skip any of them</h3>
        {PROMPT_CATEGORIES.map((category) => {
          const skipped = state.skippedPromptCategories.includes(category);
          const response = state.promptResponses.find((r) => r.category === category);
          if (skipped) {
            return <p key={category} className="text-xs text-text-muted/60 italic">{NHEI_BEFORE_WORDS_PROMPTS[category]} - skipped</p>;
          }
          return (
            <div key={category} className="space-y-1.5">
              <p className="text-xs text-text-muted">{NHEI_BEFORE_WORDS_PROMPTS[category]}</p>
              <div className="flex gap-2">
                <input
                  value={response?.text ?? ''}
                  onChange={(e) => setState(answerPrompt(state, category, e.target.value, response?.uncertain ?? false))}
                  placeholder="Optional..."
                  aria-label={NHEI_BEFORE_WORDS_PROMPTS[category]}
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-border bg-surface text-text-main"
                />
                <label className="flex items-center gap-1 text-[10px] text-text-muted shrink-0">
                  <input
                    type="checkbox"
                    checked={response?.uncertain ?? false}
                    onChange={(e) => setState(answerPrompt(state, category, response?.text ?? '', e.target.checked))}
                  />
                  not sure
                </label>
                <button onClick={() => setState(skipPrompt(state, category))} className="text-text-muted hover:text-text-main" aria-label={`Skip: ${NHEI_BEFORE_WORDS_PROMPTS[category]}`}>
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        <button onClick={() => setState(moveToReview(state))} className="btn-primary py-2.5 px-4 text-xs">
          Continue
        </button>
      </div>
    );
  }

  if (state.step === 'review') {
    return (
      <div className="card space-y-4 bg-background border border-border max-w-lg">
        <h3 className="text-sm font-bold text-text-main">Here's what you shared</h3>
        {state.freeExpressionText && <p className="text-sm text-text-main p-3 bg-surface/50 rounded-lg">{state.freeExpressionText}</p>}
        {state.promptResponses.filter((r) => r.text.trim()).map((r) => (
          <p key={r.category} className="text-xs text-text-muted">
            {NHEI_BEFORE_WORDS_PROMPTS[r.category]} <span className="text-text-main">{r.text}</span> {r.uncertain && <em>(not sure)</em>}
          </p>
        ))}
        {state.corrections.map((c, i) => (
          <p key={i} className="text-xs text-text-muted italic">Correction: {c}</p>
        ))}
        <div className="flex gap-2">
          <input
            value={correctionDraft}
            onChange={(e) => setCorrectionDraft(e.target.value)}
            placeholder="Want to correct or add something?"
            aria-label="Add a correction"
            className="flex-1 text-xs px-3 py-2 rounded-lg border border-border bg-surface text-text-main"
          />
          <button
            onClick={() => { if (correctionDraft.trim()) { setState(addCorrection(state, correctionDraft.trim())); setCorrectionDraft(''); } }}
            className="text-xs font-bold px-3 py-2 rounded-lg bg-primary/10 text-primary"
          >
            Add
          </button>
        </div>
        <button onClick={() => setState(decideProceedWithoutRetaining(state))} className="btn-primary py-2.5 px-4 text-xs w-full justify-center flex items-center gap-2">
          <Check className="w-3.5 h-3.5" /> Done for now - don't save this
        </button>
        {/* Phase 5C (directive §3): "if retention is unavailable, explain
            this clearly in the UI" - shown, not hidden, but genuinely
            disabled, since no real reflection_storage write exists yet
            to receive decideRetainAsReflectionEvidence's outcome. Matches
            NheiPrivacyConsent.tsx's own "visibly disabled, honest" pattern
            rather than silently omitting the option. */}
        <button
          disabled
          aria-disabled="true"
          title="Not yet available - there is no way to save this as a reflection yet"
          className="py-2.5 px-4 text-xs w-full justify-center flex items-center gap-2 rounded-lg border border-border text-text-muted/50 cursor-not-allowed"
        >
          Save this as a reflection - not yet available
        </button>
      </div>
    );
  }

  // state.step === 'decided'
  return (
    <div className="card space-y-2 bg-background border border-border max-w-lg">
      <p className="text-sm text-text-muted">
        Thanks for sharing that. This preview doesn't retain anything you wrote - in a real version, whether to keep
        this as a reflection would always be your own, separate choice.
      </p>
    </div>
  );
};
