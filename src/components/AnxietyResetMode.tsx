import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wind, Eye, ArrowRight, CheckCircle2, HeartPulse, Volume2, VolumeX,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth } from '../lib/firebase';
import { loadLatestCapacityCheckIn, loadStressors } from '../lib/energy-delta-service';
import { computeNetLoad } from '../../energy-delta-engine';
import {
  startAmbientSoundscape, stopAmbientSoundscape, AMBIENT_SOUNDSCAPE_LABELS, AMBIENT_SOUNDSCAPE_ORDER,
  AmbientSoundscapeId, AmbientSoundscapeHandle,
} from '../lib/ambient-soundscape';
import {
  NoticeAnswer, NOTICE_ANSWER_ORDER, NOTICE_ANSWER_LABELS,
  IntensityLevel, INTENSITY_ORDER, INTENSITY_LABELS,
  categorizeNotice, recommendIntervention, AnxietyIntervention, ANXIETY_INTERVENTION_LABELS,
  WorryOffloadOutcome, WORRY_OFFLOAD_OUTCOME_ORDER, WORRY_OFFLOAD_OUTCOME_LABELS,
  GROUNDING_SENSE_ORDER, GROUNDING_SENSE_PROMPTS,
  BODY_RELEASE_ORDER, BODY_RELEASE_PROMPTS,
  AnxietyCheckResponse, ANXIETY_CHECK_ORDER, ANXIETY_CHECK_LABELS, ANXIETY_CHECK_BRANCHES,
  AnxietyCheckOptionId, ANXIETY_CHECK_OPTION_LABELS, ANXIETY_BREATHING_NEED,
  AnxietyHelpfulness, shouldAskDidThatFeelUseful, computeMostHelpfulIntervention,
  wasBreathingPreviouslyUncomfortable, shouldOfferRemoveOneThing, shouldSuggestWorkloadRealityCheck,
  ResetStage, ANXIETY_RESET_SAFETY_BOUNDARY, ANXIETY_RESET_METHOD_DESCRIPTION,
} from '../../anxiety-reset-engine';
import {
  recordAnxietyResetSession, updateAnxietyResetSessionFeedback, loadRecentAnxietyResetSessions,
  loadAnxietyResetTotalCount, recordAnxietyResetCompletion, parkWorry,
} from '../lib/anxiety-reset-service';

interface AnxietyResetModeProps {
  onAwardPoints: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
}

// CORE DISTINCTION: Reset Studio is exploratory ("what's happening, and
// what kind of reset might help?"). Anxiety Reset is guided - the user
// names what feels strongest, Nova picks ONE starting point, and the
// experience reduces choices rather than asking the user to browse a
// tool library. The intended feeling: "I was overwhelmed and didn't know
// what I needed. Blaze Break stayed with me until I could choose again."
type FlowStep = 'intro' | 'notice' | 'intensity' | 'recommendation' | 'alternative' | 'settle' | 'checkpoint' | 'next_step';

const stageForStep = (step: FlowStep): ResetStage => {
  if (step === 'settle') return 'settle';
  if (step === 'checkpoint' || step === 'next_step') return 'next_step';
  return 'notice';
};

// COMPRESSION -> EXPANSION: contained and quiet at NOTICE, soft and slow
// at SETTLE, larger and more open at NEXT STEP - never an alarm colour,
// never resembling an emergency monitor.
const CONTAINER_WIDTH_CLASS: Record<ResetStage, string> = {
  notice: 'max-w-md',
  settle: 'max-w-xl',
  next_step: 'max-w-2xl',
};

const HALO_SIZE: Record<ResetStage, number> = { notice: 140, settle: 240, next_step: 360 };
const HALO_OPACITY: Record<ResetStage, number> = { notice: 0.12, settle: 0.22, next_step: 0.28 };

export const AnxietyResetMode = ({ onAwardPoints, onNavigate }: AnxietyResetModeProps) => {
  const [step, setStep] = useState<FlowStep>('intro');
  const [notice, setNotice] = useState<NoticeAnswer | null>(null);
  const [intensity, setIntensity] = useState<IntensityLevel | null>(null);
  const [intervention, setIntervention] = useState<AnxietyIntervention | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [checkResponse, setCheckResponse] = useState<AnxietyCheckResponse | null>(null);
  const [showDidThatHelp, setShowDidThatHelp] = useState(false);
  const [helpfulChosen, setHelpfulChosen] = useState<AnxietyHelpfulness | null>(null);
  const [showWorkloadSuggestion, setShowWorkloadSuggestion] = useState(false);
  const [loadExceedsCapacity, setLoadExceedsCapacity] = useState(false);
  const [preferredIntervention, setPreferredIntervention] = useState<AnxietyIntervention | null>(null);
  const [breathingUncomfortable, setBreathingUncomfortable] = useState(false);
  const [skippedCheckpointForHandoff, setSkippedCheckpointForHandoff] = useState(false);

  // Worry Offload state
  const [worryText, setWorryText] = useState('');
  const [worryReleased, setWorryReleased] = useState(false);
  const [worryOutcome, setWorryOutcome] = useState<WorryOffloadOutcome | null>(null);
  const [worryParked, setWorryParked] = useState(false);
  const [factKnown, setFactKnown] = useState('');
  const [factImagined, setFactImagined] = useState('');
  const [nextStepText, setNextStepText] = useState('');

  // Grounding state - the user can stop once sufficiently settled,
  // never forced through every sense.
  const [groundingIndex, setGroundingIndex] = useState(0);
  const [groundingDone, setGroundingDone] = useState(false);

  // Release Some Tension state
  const [tensionIndex, setTensionIndex] = useState(0);
  const [tensionDone, setTensionDone] = useState(false);

  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Optional ambient sound - off by default, never autoplaying. A small,
  // self-contained Web Audio graph built from the same shared
  // ambient-soundscape module the Breathing & Guided Reset experience
  // uses, so "Soft Wind"/"Ocean Drift"/"Night Air" never drift into two
  // different-sounding versions of the same named sound.
  const [soundId, setSoundId] = useState<'none' | AmbientSoundscapeId>('none');
  const soundEngineRef = useRef<{ ctx: AudioContext | null; gain: GainNode | null; handle: AmbientSoundscapeHandle | null }>({
    ctx: null, gain: null, handle: null,
  });

  useEffect(() => {
    stopAmbientSoundscape(soundEngineRef.current.handle);
    soundEngineRef.current.handle = null;
    if (soundId === 'none') return;
    let ctx = soundEngineRef.current.ctx;
    if (!ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      ctx = new AudioContextClass();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.connect(ctx.destination);
      soundEngineRef.current = { ctx, gain, handle: null };
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (soundEngineRef.current.gain) {
      soundEngineRef.current.handle = startAmbientSoundscape(ctx, soundEngineRef.current.gain, soundId);
    }
  }, [soundId]);

  useEffect(() => () => {
    stopAmbientSoundscape(soundEngineRef.current.handle);
    soundEngineRef.current.ctx?.close();
  }, []);

  // Nova matching context - loaded once: real previous-feedback
  // preference, a real "breathing made this worse before" signal, and
  // Energy Delta's real load/capacity comparison (CONNECTION TO ENERGY
  // DELTA / ONE LESS THING). Never fabricated from a handful of entries.
  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) return;
      const uid = auth.currentUser.uid;
      const sessions = await loadRecentAnxietyResetSessions(uid);
      const feedbackEntries = sessions
        .filter((s) => s.helpful !== null)
        .map((s) => ({ intervention: s.intervention, helpful: s.helpful as AnxietyHelpfulness }));
      setPreferredIntervention(computeMostHelpfulIntervention(feedbackEntries));
      setBreathingUncomfortable(wasBreathingPreviouslyUncomfortable(
        sessions.map((s) => ({ intervention: s.intervention, checkResponse: s.checkResponse }))
      ));
      try {
        const [capacityCheckIn, stressors] = await Promise.all([loadLatestCapacityCheckIn(uid), loadStressors(uid)]);
        if (capacityCheckIn) setLoadExceedsCapacity(computeNetLoad(stressors) > capacityCheckIn.score);
      } catch (e) {
        // Energy Delta context is optional enrichment - absence of it
        // just means the One Less Thing connection stays hidden.
      }
    };
    load();
  }, []);

  const resetAll = () => {
    setStep('intro');
    setNotice(null); setIntensity(null); setIntervention(null); setSessionId(null);
    setCheckResponse(null); setShowDidThatHelp(false); setHelpfulChosen(null);
    setShowWorkloadSuggestion(false); setSkippedCheckpointForHandoff(false);
    setWorryText(''); setWorryReleased(false); setWorryOutcome(null); setWorryParked(false);
    setFactKnown(''); setFactImagined(''); setNextStepText('');
    setGroundingIndex(0); setGroundingDone(false);
    setTensionIndex(0); setTensionDone(false);
    setSoundId('none');
  };

  const handleNotice = (answer: NoticeAnswer) => { setNotice(answer); setStep('intensity'); };

  const handleIntensity = (level: IntensityLevel) => {
    setIntensity(level);
    const category = categorizeNotice(notice as NoticeAnswer);
    const rec = recommendIntervention({ category, breathingPreviouslyUncomfortable: breathingUncomfortable, preferredIntervention });
    setIntervention(rec);
    setStep('recommendation');
  };

  const beginSettle = async (chosen: AnxietyIntervention) => {
    setIntervention(chosen);
    setStep('settle');
    setWorryText(''); setWorryReleased(false); setWorryOutcome(null); setWorryParked(false);
    setFactKnown(''); setFactImagined(''); setNextStepText('');
    setGroundingIndex(0); setGroundingDone(false);
    setTensionIndex(0); setTensionDone(false);
    if (auth.currentUser && notice && intensity) {
      const id = await recordAnxietyResetSession(auth.currentUser.uid, { notice, intensity, intervention: chosen });
      setSessionId(id);
    }
  };

  const handleStartBreathing = () => {
    // CALL INTO THE SHARED BREATHING SYSTEM rather than a second
    // breathing engine: switch to the Reset Studio tab, expand the
    // pre-existing tool stack, then hand the real breathing experience
    // its recommended need - each a window event, staggered slightly so
    // the destination has actually mounted before the next one fires.
    window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'reset' }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('show_more_reset_tools'));
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('breathing_reset_select_need', { detail: ANXIETY_BREATHING_NEED }));
      }, 80);
    }, 80);
    // The breathing tool closes its own loop with its own checkpoint -
    // asking "where are you now?" a second time here would be redundant,
    // not thorough.
    setSkippedCheckpointForHandoff(true);
    goToNextStep();
  };

  const handleCheckpoint = async (response: AnxietyCheckResponse) => {
    setCheckResponse(response);
    if (auth.currentUser && sessionId) {
      await updateAnxietyResetSessionFeedback(auth.currentUser.uid, sessionId, { checkResponse: response });
    }
  };

  const goToNextStep = async () => {
    setStep('next_step');
    if (auth.currentUser) {
      const totalBefore = await loadAnxietyResetTotalCount(auth.currentUser.uid);
      setShowDidThatHelp(shouldAskDidThatFeelUseful(totalBefore));
      await recordAnxietyResetCompletion(auth.currentUser.uid);
      const sessions = await loadRecentAnxietyResetSessions(auth.currentUser.uid);
      setShowWorkloadSuggestion(shouldSuggestWorkloadRealityCheck(sessions.map((s) => s.notice)));
    }
    if (onAwardPoints) onAwardPoints(20, 'Completed Anxiety Reset');
  };

  const handleCheckOption = (optionId: AnxietyCheckOptionId) => {
    switch (optionId) {
      case 'i_am_okay_now':
      case 'finish_for_now':
        goToNextStep();
        return;
      case 'another_minute':
      case 'stay_here':
        if (intervention) beginSettle(intervention);
        return;
      case 'make_next_step_smaller':
      case 'make_it_smaller':
        window.dispatchEvent(new CustomEvent('reset_studio_select_state', { detail: 'flooded' }));
        window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'reset' }));
        return;
      case 'talk_to_nova':
        onNavigate?.('nova');
        return;
      case 'quick_support':
        window.dispatchEvent(new CustomEvent('open_crisis_support'));
        return;
      case 'guardian_ping':
        window.dispatchEvent(new CustomEvent('trigger_guardian_ping'));
        return;
      case 'grounding':
      case 'breathing':
      case 'worry_offload':
        beginSettle(optionId);
        return;
      case 'try_simpler':
        setStep('alternative');
        return;
      default:
        return;
    }
  };

  const handleHelpfulAnswer = async (answer: AnxietyHelpfulness) => {
    setHelpfulChosen(answer);
    if (auth.currentUser && sessionId) {
      await updateAnxietyResetSessionFeedback(auth.currentUser.uid, sessionId, { helpful: answer });
    }
  };

  const handleWorryOutcome = async (outcome: WorryOffloadOutcome) => {
    setWorryOutcome(outcome);
    if (outcome === 'park_it' && auth.currentUser && worryText.trim()) {
      await parkWorry(auth.currentUser.uid, worryText.trim());
      setWorryParked(true);
    }
  };

  const stage = stageForStep(step);
  const showMinimalChrome = step === 'settle';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 sm:px-10 py-14 min-h-[560px] flex flex-col items-center">
      <motion.div
        aria-hidden="true"
        className="absolute rounded-full blur-3xl bg-primary/30 pointer-events-none"
        style={{ left: '50%', top: '12%', transform: 'translateX(-50%)' }}
        animate={{ width: HALO_SIZE[stage], height: HALO_SIZE[stage], opacity: HALO_OPACITY[stage] }}
        transition={{ duration: reducedMotion ? 0 : 1.1, ease: 'easeInOut' }}
      />

      <div className={cn('relative z-10 w-full mx-auto space-y-8 transition-all', CONTAINER_WIDTH_CLASS[stage])}>
        <AnimatePresence mode="wait">
          {step === 'intro' && (
            <motion.div key="intro" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center space-y-6">
              <div className="w-14 h-14 bg-primary/10 border border-primary/20 text-primary rounded-2xl flex items-center justify-center mx-auto">
                <HeartPulse className="w-7 h-7" />
              </div>
              <div className="space-y-3">
                <h3 className="font-display text-3xl font-bold text-text-main tracking-tight">Anxiety Reset</h3>
                <p className="text-sm text-text-muted leading-relaxed max-w-sm mx-auto">
                  When thoughts are racing or everything feels too much, we'll take this one small step at a time.
                </p>
              </div>
              <div className="space-y-3 pt-2">
                <button onClick={() => setStep('notice')} className="w-full btn-primary py-4 text-sm">
                  Start Reset <ArrowRight className="w-4 h-4 ml-2" />
                </button>
                <button onClick={() => onNavigate?.('reset')} className="text-xs font-bold text-text-muted hover:text-text-main">
                  I'd rather use Reset Studio
                </button>
              </div>
            </motion.div>
          )}

          {step === 'notice' && (
            <motion.div key="notice" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <h4 className="font-display text-2xl font-bold text-text-main text-center">What feels strongest right now?</h4>
              <p className="text-xs text-text-muted text-center">You don't need to explain everything. Just pick what feels closest.</p>
              <div className="grid grid-cols-1 gap-2.5">
                {NOTICE_ANSWER_ORDER.map((a) => (
                  <button
                    key={a}
                    onClick={() => handleNotice(a)}
                    className="p-4 rounded-2xl border border-border hover:border-primary/50 bg-surface/60 text-left font-bold text-text-main text-sm transition-colors"
                  >
                    {NOTICE_ANSWER_LABELS[a]}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'intensity' && (
            <motion.div key="intensity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <h4 className="font-display text-2xl font-bold text-text-main text-center">How strong does it feel right now?</h4>
              <div className="grid grid-cols-1 gap-2.5">
                {INTENSITY_ORDER.map((level) => (
                  <button
                    key={level}
                    onClick={() => handleIntensity(level)}
                    className="p-4 rounded-2xl border border-border hover:border-primary/50 bg-surface/60 text-center font-bold text-text-main text-sm transition-colors"
                  >
                    {INTENSITY_LABELS[level]}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'recommendation' && intervention && (
            <motion.div key="recommendation" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center space-y-6">
              <p className="text-sm text-text-muted">Let's start here.</p>
              <h4 className="font-display text-2xl font-bold text-text-main">{ANXIETY_INTERVENTION_LABELS[intervention]}</h4>
              <div className="space-y-3">
                <button onClick={() => beginSettle(intervention)} className="w-full btn-primary py-4 text-sm">
                  Begin <ArrowRight className="w-4 h-4 ml-2" />
                </button>
                <button onClick={() => setStep('alternative')} className="text-xs font-bold text-text-muted hover:text-text-main">
                  Try Something Else
                </button>
              </div>
            </motion.div>
          )}

          {step === 'alternative' && (
            <motion.div key="alternative" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <h4 className="font-display text-xl font-bold text-text-main text-center">Pick a different approach</h4>
              <div className="grid grid-cols-1 gap-2.5">
                {(['worry_offload', 'breathing', 'grounding', 'tension_release'] as AnxietyIntervention[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => beginSettle(opt)}
                    className="p-4 rounded-2xl border border-border hover:border-primary/50 bg-surface/60 text-center font-bold text-text-main text-sm transition-colors"
                  >
                    {ANXIETY_INTERVENTION_LABELS[opt]}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'settle' && intervention === 'worry_offload' && (
            <motion.div key="worry" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {!worryReleased ? (
                <div className="space-y-4">
                  <p className="text-text-main font-medium text-center">Put the loop somewhere outside your head.</p>
                  <p className="text-xs text-text-muted text-center">Don't organise it. Don't make it sound reasonable. Just put down what keeps repeating.</p>
                  <textarea
                    value={worryText}
                    onChange={(e) => setWorryText(e.target.value)}
                    placeholder="Put it here…"
                    aria-label="Put it here"
                    className="w-full h-36 bg-surface/60 border border-border rounded-2xl p-4 text-sm text-text-main focus:outline-none focus:border-primary resize-none"
                  />
                  <button
                    onClick={() => setWorryReleased(true)}
                    disabled={!worryText.trim()}
                    className="w-full btn-primary py-3.5 text-sm disabled:opacity-40"
                  >
                    I've Got It Out
                  </button>
                </div>
              ) : !worryOutcome ? (
                <div className="space-y-4">
                  <p className="text-text-main font-medium text-center">What do you need from this?</p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {WORRY_OFFLOAD_OUTCOME_ORDER.map((o) => (
                      <button key={o} onClick={() => handleWorryOutcome(o)} className="p-3.5 rounded-xl border border-border hover:border-primary/50 font-bold text-sm text-text-main">
                        {WORRY_OFFLOAD_OUTCOME_LABELS[o]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {worryOutcome === 'park_it' && (
                    <p className="text-text-main font-medium text-center">
                      {worryParked ? "It's captured. You don't have to keep rehearsing it to remember it." : 'Capturing it…'}
                    </p>
                  )}
                  {worryOutcome === 'find_the_fact' && (
                    <div className="space-y-3">
                      <label className="block space-y-1.5">
                        <span className="text-xs font-bold text-text-muted">What do you actually know right now?</span>
                        <input value={factKnown} onChange={(e) => setFactKnown(e.target.value)} className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-bold text-text-muted">What is your mind filling in?</span>
                        <input value={factImagined} onChange={(e) => setFactImagined(e.target.value)} className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
                      </label>
                    </div>
                  )}
                  {worryOutcome === 'find_one_next_step' && (
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold text-text-muted">What is the smallest useful thing you can do?</span>
                      <input value={nextStepText} onChange={(e) => setNextStepText(e.target.value)} className="w-full bg-surface/60 border border-border rounded-xl px-3 py-2.5 text-sm text-text-main focus:outline-none focus:border-primary" />
                    </label>
                  )}
                  {worryOutcome === 'let_it_go' && (
                    <p className="text-text-main font-medium text-center">Good. That one doesn't need to cross with you.</p>
                  )}
                  <button onClick={() => setStep('checkpoint')} className="w-full btn-primary py-3.5 text-sm">Continue</button>
                </div>
              )}
            </motion.div>
          )}

          {step === 'settle' && intervention === 'breathing' && (
            <motion.div key="breathing_handoff" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center space-y-6">
              <Wind className="w-10 h-10 text-primary mx-auto" />
              <p className="text-text-main font-medium">We'll use the Breathing &amp; Guided Reset tool.</p>
              <p className="text-xs text-text-muted">One guided practice, already set up for you.</p>
              <button onClick={handleStartBreathing} className="w-full btn-primary py-4 text-sm">Start Breathing</button>
            </motion.div>
          )}

          {step === 'settle' && intervention === 'grounding' && (
            <motion.div key="grounding" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center space-y-6">
              <Eye className="w-9 h-9 text-primary mx-auto" />
              <p className="text-text-main font-medium">Let's bring your attention back to what is actually around you.</p>
              {!groundingDone ? (
                <>
                  <p className="text-xl font-display font-bold text-text-main">{GROUNDING_SENSE_PROMPTS[GROUNDING_SENSE_ORDER[groundingIndex]]}</p>
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={() => {
                        if (groundingIndex >= GROUNDING_SENSE_ORDER.length - 1) setGroundingDone(true);
                        else setGroundingIndex((i) => i + 1);
                      }}
                      className="btn-primary py-3.5 text-sm"
                    >
                      I've got one
                    </button>
                    <button onClick={() => setGroundingDone(true)} className="text-xs font-bold text-text-muted hover:text-text-main">
                      That's enough for now
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => setStep('checkpoint')} className="w-full btn-primary py-3.5 text-sm">Continue</button>
              )}
            </motion.div>
          )}

          {step === 'settle' && intervention === 'tension_release' && (
            <motion.div key="tension" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center space-y-6">
              <p className="text-text-muted text-xs font-bold uppercase tracking-widest">Release Some Tension</p>
              {!tensionDone ? (
                <>
                  <div className="space-y-2">
                    <p className="text-xl font-display font-bold text-text-main">{BODY_RELEASE_PROMPTS[BODY_RELEASE_ORDER[tensionIndex]].notice}</p>
                    <p className="text-text-muted">{BODY_RELEASE_PROMPTS[BODY_RELEASE_ORDER[tensionIndex]].release}</p>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={() => {
                        if (tensionIndex >= BODY_RELEASE_ORDER.length - 1) setTensionDone(true);
                        else setTensionIndex((i) => i + 1);
                      }}
                      className="btn-primary py-3.5 text-sm"
                    >
                      Next
                    </button>
                    <button onClick={() => setTensionDone(true)} className="text-xs font-bold text-text-muted hover:text-text-main">
                      That's enough for now
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => setStep('checkpoint')} className="w-full btn-primary py-3.5 text-sm">Continue</button>
              )}
            </motion.div>
          )}

          {step === 'checkpoint' && !checkResponse && (
            <motion.div key="checkpoint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <h4 className="font-display text-2xl font-bold text-text-main text-center">Where are you now?</h4>
              <div className="grid grid-cols-1 gap-2.5">
                {ANXIETY_CHECK_ORDER.map((r) => (
                  <button key={r} onClick={() => handleCheckpoint(r)} className="p-4 rounded-2xl border border-border hover:border-primary/50 bg-surface/60 text-center font-bold text-text-main text-sm">
                    {ANXIETY_CHECK_LABELS[r]}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'checkpoint' && checkResponse && (
            <motion.div key="checkpoint_branch" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6 text-center">
              <p className="text-lg font-display font-medium text-text-main">{ANXIETY_CHECK_BRANCHES[checkResponse].novaLine}</p>
              {ANXIETY_CHECK_BRANCHES[checkResponse].supportingLine && (
                <p className="text-sm text-text-muted">{ANXIETY_CHECK_BRANCHES[checkResponse].supportingLine}</p>
              )}
              <div className="flex flex-wrap justify-center gap-2.5">
                {ANXIETY_CHECK_BRANCHES[checkResponse].options.map((opt) => (
                  <button key={opt} onClick={() => handleCheckOption(opt)} className="px-4 py-2.5 rounded-xl border border-border hover:border-primary/50 font-bold text-sm text-text-main">
                    {ANXIETY_CHECK_OPTION_LABELS[opt]}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'next_step' && (
            <motion.div key="next_step" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="status" aria-live="polite" className="space-y-8 text-center">
              <div className="w-16 h-16 bg-success/10 border border-success/20 text-success dark:text-[#4ade80] rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              {showDidThatHelp && !helpfulChosen && !skippedCheckpointForHandoff && (
                <div className="space-y-3">
                  <p className="text-sm text-text-main font-medium">Did that feel useful?</p>
                  <div className="flex justify-center gap-2.5">
                    {(['yes', 'a_little', 'not_really'] as AnxietyHelpfulness[]).map((h) => (
                      <button key={h} onClick={() => handleHelpfulAnswer(h)} className="px-4 py-2 rounded-xl border border-border hover:border-primary/50 font-bold text-xs text-text-main">
                        {h === 'yes' ? 'Yes' : h === 'a_little' ? 'A little' : 'Not really'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showWorkloadSuggestion && (
                <div className="p-5 rounded-2xl border border-border bg-surface/60 text-left space-y-3">
                  <p className="text-sm text-text-main">A lot of what's hitting you seems to be competing demands. Want to rebuild today instead of calming yourself around an impossible plan?</p>
                  <button onClick={() => onNavigate?.('recover')} className="btn-primary py-2.5 px-5 text-xs">Workload Reality Check</button>
                </div>
              )}

              {checkResponse && shouldOfferRemoveOneThing(checkResponse, loadExceedsCapacity) && (
                <div className="p-5 rounded-2xl border border-border bg-surface/60 text-left space-y-3">
                  <p className="text-sm text-text-main">You're a little steadier, but the load hasn't changed.</p>
                  <p className="text-sm text-text-muted">Want to remove one thing before going back?</p>
                  <button onClick={() => onNavigate?.('recover')} className="btn-primary py-2.5 px-5 text-xs">Help Me Remove One Thing</button>
                </div>
              )}

              <div className="space-y-3 max-w-xs mx-auto">
                <button onClick={resetAll} className="w-full btn-primary py-3.5 text-sm">Go back to what I was doing</button>
                <div className="flex flex-wrap justify-center gap-2 text-xs font-bold text-text-muted">
                  <button onClick={() => { window.dispatchEvent(new CustomEvent('reset_studio_select_state', { detail: 'flooded' })); window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'reset' })); }} className="hover:text-text-main">Make the next task smaller</button>
                  <span aria-hidden="true">·</span>
                  <button onClick={() => onNavigate?.('nova')} className="hover:text-text-main">Talk to Nova</button>
                  <span aria-hidden="true">·</span>
                  <button onClick={() => onNavigate?.('reset')} className="hover:text-text-main">Reset Studio</button>
                  <span aria-hidden="true">·</span>
                  <button onClick={() => window.dispatchEvent(new CustomEvent('open_crisis_support'))} className="hover:text-text-main">Quick Support</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showMinimalChrome && (
        <div className="relative z-10 w-full flex items-center justify-between pt-10 mt-auto text-xs font-bold text-text-muted">
          <button onClick={() => setStep('next_step')} className="hover:text-text-main">Exit</button>
          <div className="flex items-center gap-1.5">
            {soundId === 'none' ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <select
              value={soundId}
              onChange={(e) => setSoundId(e.target.value as 'none' | AmbientSoundscapeId)}
              aria-label="Ambient sound"
              className="bg-transparent text-xs font-bold text-text-muted hover:text-text-main focus:outline-none"
            >
              <option value="none">Mute</option>
              {AMBIENT_SOUNDSCAPE_ORDER.map((id) => (
                <option key={id} value={id}>{AMBIENT_SOUNDSCAPE_LABELS[id]}</option>
              ))}
            </select>
          </div>
          <button onClick={() => setStep('alternative')} className="hover:text-text-main">Need another approach</button>
        </div>
      )}

      {step === 'intro' && (
        <div className="relative z-10 pt-10 max-w-sm text-center">
          <p className="text-[11px] text-text-muted/70 leading-relaxed">
            {ANXIETY_RESET_METHOD_DESCRIPTION} {ANXIETY_RESET_SAFETY_BOUNDARY}
          </p>
        </div>
      )}
    </div>
  );
};
