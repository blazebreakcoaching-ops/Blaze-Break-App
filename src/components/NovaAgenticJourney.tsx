import { useState } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { NheiBeforeWords } from './NheiBeforeWords';
import { NovaChat } from './NovaChat';
import { NovaInvisibleLoad } from './NovaInvisibleLoad';
import { NovaTakeTheLoad } from './NovaTakeTheLoad';
import type { NovaTemporaryBeforeWordsContext } from '../../nova-before-words-temporary-context';
import type { NovaStatedPracticalProblem } from '../../nova-take-the-load-types';

// Nova Agentic Journey (Phase 5E, directive §6).
//
// "Connect existing dev components into one coherent journey": this file
// introduces NO new business logic, NO new server route, and NO new
// state machine of its own - it is a thin sequencer over four components
// that already exist and were each already independently built/tested in
// Phase 5B-5D (NheiBeforeWords, NovaChat, NovaInvisibleLoad,
// NovaTakeTheLoad). Its only job is to move the user forward through the
// directive's own named sequence - "Before Words -> temporary
// conversational context -> user-stated practical pressure -> Invisible
// Load -> Take the Load -> Calendar Protection -> explicit action
// approval -> simulated provider result" - as ONE screen at a time,
// instead of the separate static preview sections NheiPhase5Preview.tsx
// also keeps for granular per-piece review.
//
// STATE LABELLING (directive §6's own required set - "Understanding /
// Suggesting / Preparing / Awaiting permission / Executing / Confirmed /
// Failed / Uncertain / Reversed"): the first three are this wrapper's own
// journey stages (there is genuinely no proposal object yet during
// Before Words/Chat/Invisible Load, so a finer label would be
// fabricated). The remaining six are already rendered, verbatim, by
// NovaTakeTheLoad's own STATE_LABEL map once a real proposal exists -
// this file does not duplicate or re-derive them, since NovaTakeTheLoad
// is the thing actually holding that server-confirmed state.
//
// SKIPPABLE AT EVERY STEP, same as every underlying component already is
// on its own: Before Words can end in either of its two real endings,
// Chat has its own "Continue" (nothing about a conversation has a natural
// finish line), and Invisible Load can be skipped straight to Take the
// Load for anyone who already knows what they want help with - "avoid
// requiring unrelated technical screens" is read here as never forcing a
// step that does not itself serve this journey, not as collapsing the
// sequence directive §6 explicitly asks for.
//
// OFFLINE AT THIS PHASE: mounted only by NheiPhase5Preview.tsx, which is
// itself not reachable by any real user - see that file's own header.

type JourneyStep = 'before_words' | 'chat' | 'invisible_load' | 'take_the_load';

const STAGE_LABELS = [
  'Understanding', 'Suggesting', 'Preparing', 'Awaiting permission',
  'Executing', 'Confirmed', 'Failed', 'Uncertain', 'Reversed',
] as const;

function currentStageLabel(step: JourneyStep): typeof STAGE_LABELS[number] {
  if (step === 'before_words' || step === 'chat') return 'Understanding';
  if (step === 'invisible_load') return 'Suggesting';
  return 'Preparing';
}

function StageBar({ step }: { step: JourneyStep }) {
  const active = currentStageLabel(step);
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Journey stage">
      {STAGE_LABELS.map((label) => (
        <span
          key={label}
          className={
            label === active
              ? 'px-2 py-1 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30'
              : 'px-2 py-1 rounded-full text-[10px] font-bold bg-surface/50 text-text-muted/60 border border-border'
          }
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export const NovaAgenticJourney = () => {
  const [step, setStep] = useState<JourneyStep>('before_words');
  const [beforeWordsContext, setBeforeWordsContext] = useState<NovaTemporaryBeforeWordsContext | null>(null);
  const [statedProblem, setStatedProblem] = useState<NovaStatedPracticalProblem | null>(null);

  const startOver = () => {
    setStep('before_words');
    setBeforeWordsContext(null);
    setStatedProblem(null);
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <StageBar step={step} />
        {step !== 'before_words' && (
          <button onClick={startOver} className="shrink-0 text-[11px] font-bold text-text-muted hover:text-text-main flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Start over
          </button>
        )}
      </div>

      {step === 'before_words' && (
        <NheiBeforeWords
          onDecided={(context) => {
            setBeforeWordsContext(context);
            setStep('chat');
          }}
        />
      )}

      {step === 'chat' && (
        <div className="space-y-2.5">
          <NovaChat
            temporaryBeforeWordsContext={beforeWordsContext}
            onTemporaryBeforeWordsContextConsumed={() => setBeforeWordsContext(null)}
          />
          <button
            onClick={() => setStep('invisible_load')}
            className="btn-primary min-h-11 w-full justify-center flex items-center gap-1.5 text-xs"
          >
            Continue to what's on your plate <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {step === 'invisible_load' && (
        <div className="space-y-2.5">
          <NovaInvisibleLoad
            capacityBand={statedProblem?.capacityBand ?? null}
            onRequestHelp={(problem) => {
              setStatedProblem(problem);
              setStep('take_the_load');
            }}
          />
          <button
            onClick={() => setStep('take_the_load')}
            className="text-[11px] text-text-muted/70 hover:text-text-muted underline self-start"
          >
            Skip ahead to Take the Load directly
          </button>
        </div>
      )}

      {step === 'take_the_load' && (
        <NovaTakeTheLoad initialTitle={statedProblem?.description ?? ''} />
      )}
    </div>
  );
};
