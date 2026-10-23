import { useState } from 'react';
import { ArrowRight, ArrowLeft, RotateCcw, MessageCircle, Sparkles } from 'lucide-react';
import { NheiBeforeWords } from './NheiBeforeWords';
import { NovaChat } from './NovaChat';
import { NovaInvisibleLoad } from './NovaInvisibleLoad';
import { NovaTakeTheLoad } from './NovaTakeTheLoad';
import { NovaTaskDeferral } from './NovaTaskDeferral';
import type { NovaTemporaryBeforeWordsContext } from '../../nova-before-words-temporary-context';
import type { NovaStatedPracticalProblem } from '../../nova-take-the-load-types';

// Nova Agentic Journey (Phase 5E, directive §6; reworked Phase 5F Agentic
// Expansion, directive §4).
//
// "Connect existing dev components into one coherent journey": this file
// introduces NO new business logic, NO new server route, and NO new
// state machine of its own - it is a thin sequencer over components that
// already exist and were each already independently built/tested
// (NheiBeforeWords, NovaChat, NovaInvisibleLoad, NovaTakeTheLoad,
// NovaTaskDeferral). Its only job is to move the user forward through the
// target journey - "Before Words -> Nova conversation -> practical
// pressure -> useful options -> exact proposal -> user approval ->
// result -> optional follow-up" - as ONE screen at a time.
//
// Phase 5F Agentic Expansion changes three things about the original
// Phase 5E sequencer:
//  1. An explicit `entry` step offers Before Words OR going straight to
//     ordinary Nova chat - "allow users to enter directly through
//     ordinary Nova chat without forcing them through Before Words."
//     Before Words was never a real gate in front of live Nova chat (it
//     never reaches real users at all - see this file's own closing
//     note), but within THIS sequencer specifically it used to be a
//     forced first step with no way around it; this is that fix.
//  2. A real back-navigation stack (`history`) - "support returning to a
//     previous step, changing direction." Every forward move pushes the
//     step being left; "Back" pops it. This is in addition to, not a
//     replacement for, "Start over."
//  3. Invisible Load's practical-pressure step now routes to EITHER
//     Calendar Protection OR Task Deferral, matching the two real
//     categories `NovaInvisibleLoad` can now hand off to (directive §3).
//
// STATE LABELLING (directive §6's own required set - "Understanding /
// Suggesting / Preparing / Awaiting permission / Executing / Confirmed /
// Failed / Uncertain / Reversed"): the first three are this wrapper's own
// journey stages (there is genuinely no proposal object yet during
// entry/Before Words/Chat/Invisible Load, so a finer label would be
// fabricated). The remaining six are already rendered, verbatim, by
// NovaTakeTheLoad's/NovaTaskDeferral's own STATE_LABEL maps once a real
// proposal exists - this file does not duplicate or re-derive them.
//
// SKIPPABLE/DECLINABLE AT EVERY STEP, same as every underlying component
// already is on its own: Before Words can end in either of its two real
// endings or be skipped entirely (see point 1); Chat has its own
// "Continue" (nothing about a conversation has a natural finish line);
// Invisible Load's "leave unchanged" choice and its per-item defer action
// both let a user decline a suggestion without being moved anywhere or
// treated as having resisted anything; Take the Load/Task Deferral both
// support declining a proposal outright.
//
// OFFLINE AT THIS PHASE: mounted only by NheiPhase5Preview.tsx, which is
// itself not reachable by any real user - see that file's own header.

type JourneyStep = 'entry' | 'before_words' | 'chat' | 'invisible_load' | 'calendar_protection' | 'task_deferral';

const STAGE_LABELS = [
  'Understanding', 'Suggesting', 'Preparing', 'Awaiting permission',
  'Executing', 'Confirmed', 'Failed', 'Uncertain', 'Reversed',
] as const;

function currentStageLabel(step: JourneyStep): typeof STAGE_LABELS[number] {
  if (step === 'entry' || step === 'before_words' || step === 'chat') return 'Understanding';
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
  const [step, setStep] = useState<JourneyStep>('entry');
  const [history, setHistory] = useState<JourneyStep[]>([]);
  const [beforeWordsContext, setBeforeWordsContext] = useState<NovaTemporaryBeforeWordsContext | null>(null);
  const [calendarProblem, setCalendarProblem] = useState<NovaStatedPracticalProblem | null>(null);
  const [deferralTaskDescription, setDeferralTaskDescription] = useState('');

  const goTo = (next: JourneyStep) => {
    setHistory((prev) => [...prev, step]);
    setStep(next);
  };

  const goBack = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const last = copy.pop() as JourneyStep;
      setStep(last);
      return copy;
    });
  };

  const startOver = () => {
    setStep('entry');
    setHistory([]);
    setBeforeWordsContext(null);
    setCalendarProblem(null);
    setDeferralTaskDescription('');
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <StageBar step={step} />
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <button onClick={goBack} className="shrink-0 text-[11px] font-bold text-text-muted hover:text-text-main flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back
            </button>
          )}
          {step !== 'entry' && (
            <button onClick={startOver} className="shrink-0 text-[11px] font-bold text-text-muted hover:text-text-main flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Start over
            </button>
          )}
        </div>
      </div>

      {step === 'entry' && (
        <div className="card space-y-3 bg-background border border-border">
          <p className="text-sm text-text-main">How would you like to start?</p>
          <button onClick={() => goTo('before_words')} className="btn-primary min-h-11 w-full justify-center flex items-center gap-1.5 text-xs">
            <Sparkles className="w-3.5 h-3.5" /> Say what's on your mind first
          </button>
          <button onClick={() => goTo('chat')} className="min-h-11 w-full justify-center flex items-center gap-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text-main">
            <MessageCircle className="w-3.5 h-3.5" /> Just talk to Nova
          </button>
        </div>
      )}

      {step === 'before_words' && (
        <NheiBeforeWords
          onDecided={(context) => {
            setBeforeWordsContext(context);
            goTo('chat');
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
            onClick={() => goTo('invisible_load')}
            className="btn-primary min-h-11 w-full justify-center flex items-center gap-1.5 text-xs"
          >
            Continue to what's on your plate <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {step === 'invisible_load' && (
        <NovaInvisibleLoad
          capacityBand={calendarProblem?.capacityBand ?? null}
          onProtectTime={(problem) => {
            setCalendarProblem(problem);
            goTo('calendar_protection');
          }}
          onDeferTask={(taskDescription) => {
            setDeferralTaskDescription(taskDescription);
            goTo('task_deferral');
          }}
        />
      )}

      {step === 'calendar_protection' && (
        <div className="space-y-2.5">
          <NovaTakeTheLoad initialTitle={calendarProblem?.description ?? ''} />
          <button
            onClick={() => goTo('invisible_load')}
            className="text-[11px] text-text-muted/70 hover:text-text-muted underline self-start"
          >
            Something else is on your plate too
          </button>
        </div>
      )}

      {step === 'task_deferral' && (
        <div className="space-y-2.5">
          <NovaTaskDeferral initialTaskDescription={deferralTaskDescription} />
          <button
            onClick={() => goTo('invisible_load')}
            className="text-[11px] text-text-muted/70 hover:text-text-muted underline self-start"
          >
            Something else is on your plate too
          </button>
        </div>
      )}
    </div>
  );
};
