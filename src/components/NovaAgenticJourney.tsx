import { useState } from 'react';
import { ArrowRight, ArrowLeft, RotateCcw, MessageCircle, Sparkles, Lightbulb } from 'lucide-react';
import { NheiBeforeWords } from './NheiBeforeWords';
import { NovaChat } from './NovaChat';
import { NovaInvisibleLoad } from './NovaInvisibleLoad';
import { NovaTakeTheLoad } from './NovaTakeTheLoad';
import { NovaTaskDeferral } from './NovaTaskDeferral';
import { NovaProactiveSuggestions } from './NovaProactiveSuggestions';
import type { UserProfileData } from '../types';
import type { NovaQuestioningStyle } from './NovaStyleControl';
import type { NovaTemporaryBeforeWordsContext } from '../../nova-before-words-temporary-context';
import type { NovaStatedPracticalProblem } from '../../nova-take-the-load-types';
import { initNovaInvisibleLoadContext, type NovaInvisibleLoadContext } from '../../nova-invisible-load-contract';

// Nova Agentic Journey (Phase 5E, directive §6; reworked Phase 5F Agentic
// Expansion, directive §4; extended Phase 5G Experience Integration,
// directive §3 — added the `proactive_options` step, the real interface
// for the previously-UI-less `generateProactiveSuggestions`/
// `POST /api/nova/proactive-suggestions` from Phase 5F, directive §5).
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
//
// Phase 5G (directive §3) usability review, closed without new surface
// area where the existing pieces already satisfy it:
//  - Context continuity: `calendarProblem`/`deferralTaskDescription` are
//    carried forward across every step that can set or consume them,
//    including the new `proactive_options` step.
//  - Corrections/editing: Before Words has its own correction field,
//    Invisible Load has per-item corrections, Task Deferral has its own
//    "Modify" action, and `NovaProactiveSuggestions` has "Edit before
//    using" - every step a user might want to revise already supports it
//    on its own.
//  - Exiting without losing appropriate progress: a real Calendar
//    Protection/Task Deferral proposal is server-persisted the moment it
//    is prepared (see those services' own idempotency keys) and
//    reachable again through either screen's own "Show my history" -
//    this sequencer's own `step`/`history` state is deliberately
//    session-only, matching Before Words' and Invisible Load's existing
//    "temporary, not saved" framing for anything that ISN'T already a
//    real, separately-persisted proposal.
//    CORRECTION found by this phase's own end-to-end Playwright coverage:
//    `invisibleLoadContext` below is real, in-session progress a user
//    typed on purpose (unlike Before Words' deliberately-discarded
//    context) - conditionally rendering `NovaInvisibleLoad` per `step`
//    was unmounting it on every trip to Calendar Protection/Task Deferral
//    and back, silently discarding every item the user had added. It is
//    now lifted here and passed down as controlled state so it survives
//    the round trip, the same way `calendarProblem`/`deferralTaskDescription`
//    already do.
//  - Voluntary vs. required: every step but `entry` has either a skip
//    link or a non-blocking alternative path (see e.g. `proactive_options`'s
//    own "See what Nova might proactively suggest" copy, and Invisible
//    Load's direct per-item routing that bypasses it entirely).

type JourneyStep = 'entry' | 'before_words' | 'chat' | 'invisible_load' | 'proactive_options' | 'calendar_protection' | 'task_deferral';

// Phase 5K (directive §§2,4,6): this sequencer is now the real production
// mount for Nova's text chat (App.tsx's "nova" tab), not only the
// dev-preview harness noted in the header comment above. Two additions,
// still with NO new business logic of its own:
//  - `initialStep` lets a host open straight into ordinary chat (App.tsx
//    does) while the dev preview keeps its own default `entry` behaviour
//    unchanged (it never passes this prop).
//  - The full NovaChat prop passthrough below lets this wrapper carry
//    every real capability NovaChat already had (tone/style controls,
//    saved-profile sync, award points, suggest_feature navigation, voice
//    auto-open) straight through, so swapping App.tsx's bare `<NovaChat>`
//    for this sequencer changes nothing about what Nova chat itself can
//    do - it only adds the "continue to what's on your plate" capability
//    on top.
interface NovaAgenticJourneyProps {
  initialStep?: JourneyStep;
  systemInstruction?: string;
  initialMessage?: string;
  fingerprint?: any;
  profile?: UserProfileData;
  onAwardPoints?: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
  onToneChange?: (tone: string) => void;
  onStyleChange?: (style: NovaQuestioningStyle | undefined) => void;
  autoOpenVoice?: boolean;
  onVoiceAutoOpened?: () => void;
}

const STAGE_LABELS = [
  'Understanding', 'Suggesting', 'Preparing', 'Awaiting permission',
  'Executing', 'Confirmed', 'Failed', 'Uncertain', 'Reversed',
] as const;

function currentStageLabel(step: JourneyStep): typeof STAGE_LABELS[number] {
  if (step === 'entry' || step === 'before_words' || step === 'chat') return 'Understanding';
  if (step === 'invisible_load' || step === 'proactive_options') return 'Suggesting';
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

export const NovaAgenticJourney = ({
  initialStep,
  systemInstruction,
  initialMessage,
  fingerprint,
  profile,
  onAwardPoints,
  onNavigate,
  onToneChange,
  onStyleChange,
  autoOpenVoice,
  onVoiceAutoOpened,
}: NovaAgenticJourneyProps = {}) => {
  const [step, setStep] = useState<JourneyStep>(initialStep ?? 'entry');
  const [history, setHistory] = useState<JourneyStep[]>([]);
  const [beforeWordsContext, setBeforeWordsContext] = useState<NovaTemporaryBeforeWordsContext | null>(null);
  const [calendarProblem, setCalendarProblem] = useState<NovaStatedPracticalProblem | null>(null);
  const [deferralTaskDescription, setDeferralTaskDescription] = useState('');
  const [invisibleLoadContext, setInvisibleLoadContext] = useState<NovaInvisibleLoadContext>(initNovaInvisibleLoadContext);

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
    setStep(initialStep ?? 'entry');
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
          {step !== (initialStep ?? 'entry') && (
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
            systemInstruction={systemInstruction}
            initialMessage={initialMessage}
            fingerprint={fingerprint}
            profile={profile}
            onAwardPoints={onAwardPoints}
            onNavigate={onNavigate}
            onToneChange={onToneChange}
            onStyleChange={onStyleChange}
            autoOpenVoice={autoOpenVoice}
            onVoiceAutoOpened={onVoiceAutoOpened}
            temporaryBeforeWordsContext={beforeWordsContext}
            onTemporaryBeforeWordsContextConsumed={() => setBeforeWordsContext(null)}
            onRequestPracticalAssistance={() => goTo('invisible_load')}
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
        <div className="space-y-2.5">
          <NovaInvisibleLoad
            capacityBand={calendarProblem?.capacityBand ?? null}
            context={invisibleLoadContext}
            onContextChange={setInvisibleLoadContext}
            onProtectTime={(problem) => {
              setCalendarProblem(problem);
              goTo('calendar_protection');
            }}
            onDeferTask={(taskDescription) => {
              setDeferralTaskDescription(taskDescription);
              goTo('task_deferral');
            }}
          />
          <button
            onClick={() => goTo('proactive_options')}
            className="min-h-11 w-full justify-center flex items-center gap-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text-main"
          >
            <Lightbulb className="w-3.5 h-3.5" /> See what Nova might proactively suggest
          </button>
          <button
            onClick={() => goTo('chat')}
            className="text-[11px] text-text-muted/70 hover:text-text-muted underline self-start flex items-center gap-1"
          >
            <MessageCircle className="w-3 h-3" /> Return to Nova chat
          </button>
        </div>
      )}

      {step === 'proactive_options' && (
        <div className="space-y-2.5">
          <NovaProactiveSuggestions
            initialObligationOrGoal={calendarProblem?.description ?? deferralTaskDescription}
            capacityBand={calendarProblem?.capacityBand ?? null}
            onUseForCalendarProtection={(description) => {
              setCalendarProblem({ description, capacityBand: calendarProblem?.capacityBand ?? null });
              goTo('calendar_protection');
            }}
            onUseForTaskDeferral={(description) => {
              setDeferralTaskDescription(description);
              goTo('task_deferral');
            }}
          />
          <button
            onClick={() => goTo('invisible_load')}
            className="text-[11px] text-text-muted/70 hover:text-text-muted underline self-start"
          >
            Back to what's on your plate
          </button>
          <button
            onClick={() => goTo('chat')}
            className="text-[11px] text-text-muted/70 hover:text-text-muted underline self-start flex items-center gap-1"
          >
            <MessageCircle className="w-3 h-3" /> Return to Nova chat
          </button>
        </div>
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
          <button
            onClick={() => goTo('chat')}
            className="text-[11px] text-text-muted/70 hover:text-text-muted underline self-start flex items-center gap-1"
          >
            <MessageCircle className="w-3 h-3" /> Return to Nova chat
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
          <button
            onClick={() => goTo('chat')}
            className="text-[11px] text-text-muted/70 hover:text-text-muted underline self-start flex items-center gap-1"
          >
            <MessageCircle className="w-3 h-3" /> Return to Nova chat
          </button>
        </div>
      )}
    </div>
  );
};
