import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wind, Compass, ListChecks, Sparkles, X, Check, Zap } from 'lucide-react';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { addDoc, collection } from 'firebase/firestore';
import { secureApiFetch } from '../lib/secure-api';
import { logJourney } from '../lib/nova-brain';
import { useFocusTrap } from '../lib/useFocusTrap';
import { BlameLocateAcceptExchange, BlameExchangeSummary } from './BlameLocateAcceptExchange';

interface BLAMEResetOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type Speed = 'mini' | 'full';
type ManageChoice = 'delete' | 'delegate' | 'do';
type StepKey = 'breathe' | 'locateAccept' | 'manage' | 'empower' | 'manageEmpower';

interface BlameStep {
  key: StepKey;
  letter: string;
  title: string;
  instruction: string;
  prompt: string;
  duration: number; // only meaningful for 'breathe' - the one step a clock is honest for
  hasChoice?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

// The book's own step order and prompts, verbatim - Breathe/Locate/Accept/
// Manage/Empower. Only Breathe auto-advances on a timer (a physiological
// sigh has a real duration); every other step waits for the person to
// signal they're ready, never a clock. Locate+Accept is a self-paced,
// Nova-assisted exchange (see BlameLocateAcceptExchange) rather than a
// static prompt - it's the step nobody can genuinely do alone mid-
// activation.
const FULL_STEPS: BlameStep[] = [
  {
    key: 'breathe', letter: 'B', title: 'Breathe and Become Aware',
    instruction: 'A physiological sigh: double inhale through your nose, then a long exhale through your mouth. Repeat once more.',
    prompt: "I'm activated. I'm not broken.",
    duration: 20, icon: Wind,
  },
  {
    key: 'locateAccept', letter: 'L · A', title: 'Locate + Accept',
    instruction: 'Name the trigger, then acknowledge it without fighting it.',
    prompt: "What am I actually reacting to — and what's true right now, even if I don't like it?",
    duration: 0, icon: Compass,
  },
  {
    key: 'manage', letter: 'M', title: 'Manage What You Can',
    instruction: 'Choose exactly one, whenever you’re ready.',
    prompt: "What's the smallest move that helps?",
    duration: 0, hasChoice: true, icon: ListChecks,
  },
  {
    key: 'empower', letter: 'E', title: 'Empower Yourself to Evolve',
    instruction: 'Take the action, then ask:',
    prompt: 'What would the upgraded version of me do next?',
    duration: 0, icon: Sparkles,
  },
];

const MINI_STEPS: BlameStep[] = [
  {
    key: 'breathe', letter: 'B', title: 'Breathe and Become Aware',
    instruction: 'A physiological sigh: double inhale through your nose, then a long exhale through your mouth.',
    prompt: "I'm activated. I'm not broken.",
    duration: 10, icon: Wind,
  },
  {
    key: 'locateAccept', letter: 'L · A', title: 'Locate + Accept',
    instruction: 'Name the trigger, then acknowledge it without fighting it.',
    prompt: "What am I actually reacting to — and what's true right now, even if I don't like it?",
    duration: 0, icon: Compass,
  },
  {
    key: 'manageEmpower', letter: 'M · E', title: 'Manage + Empower',
    instruction: 'Choose one, then act, whenever you’re ready.',
    prompt: "What's the smallest move that helps?",
    duration: 0, hasChoice: true, icon: ListChecks,
  },
];

const MANAGE_CHOICES: { key: ManageChoice; label: string; description: string }[] = [
  { key: 'delete', label: 'Delete', description: 'Say no, cancel it, remove it from the list.' },
  { key: 'delegate', label: 'Delegate', description: 'Hand it to someone else — including your future self.' },
  { key: 'do', label: 'Do', description: 'The smallest meaningful step, right now.' },
];

export const BLAMEResetOverlay = ({ isOpen, onClose, onAwardPoints }: BLAMEResetOverlayProps) => {
  const dialogRef = useFocusTrap(isOpen);
  const [phase, setPhase] = useState<'intro' | 'step' | 'exchange' | 'complete'>('intro');
  const [speed, setSpeed] = useState<Speed | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [manageChoice, setManageChoice] = useState<ManageChoice | null>(null);
  const [blameVoiceEnabled, setBlameVoiceEnabled] = useState(false);
  const [exchangeSummary, setExchangeSummary] = useState<BlameExchangeSummary | null>(null);
  const openedAtRef = useRef(0);

  const steps = speed === 'mini' ? MINI_STEPS : FULL_STEPS;

  // Fail-closed by default - the voice option only ever appears once this
  // resolves to true from a real, current entitlement check.
  useEffect(() => {
    if (!isOpen || !auth.currentUser) return;
    secureApiFetch('/api/entitlements/me')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setBlameVoiceEnabled(!!data?.capabilities?.blame_voice?.enabled))
      .catch(() => setBlameVoiceEnabled(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setPhase('intro');
      setSpeed(null);
      setStepIndex(0);
      setTimeLeft(0);
      setManageChoice(null);
      setExchangeSummary(null);
    }
  }, [isOpen]);

  // Only Breathe auto-advances on a timer. Every other step's countdown
  // has already resolved (duration 0) by the time this would matter, so
  // this effect is a no-op for them.
  useEffect(() => {
    if (!isOpen || phase !== 'step') return;
    const current = steps[stepIndex];
    if (current.key !== 'breathe') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          advanceTo(stepIndex + 1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, phase, stepIndex]);

  if (!isOpen) return null;

  const advanceTo = (nextIndex: number) => {
    if (nextIndex >= steps.length) {
      setPhase('complete');
      return;
    }
    setStepIndex(nextIndex);
    const next = steps[nextIndex];
    if (next.key === 'locateAccept') {
      setPhase('exchange');
    } else {
      setPhase('step');
      setTimeLeft(next.duration);
    }
  };

  const handleSelectSpeed = (s: Speed) => {
    const stepList = s === 'mini' ? MINI_STEPS : FULL_STEPS;
    setSpeed(s);
    setStepIndex(0);
    setTimeLeft(stepList[0].duration);
    setPhase('step');
    openedAtRef.current = Date.now();
  };

  const handleExchangeContinue = (summary: BlameExchangeSummary) => {
    setExchangeSummary(summary);
    advanceTo(stepIndex + 1);
  };

  const handleCompleteReset = () => {
    const points = speed === 'full' ? 25 : 15;
    if (onAwardPoints) {
      onAwardPoints(points, `Completed ${speed === 'full' ? 'Full' : 'Mini'} BLAME Reset`);
    }

    const elapsed = openedAtRef.current ? Math.round((Date.now() - openedAtRef.current) / 1000) : 0;
    const durationSeconds = Math.min(Math.max(elapsed, 0), 1800);

    if (auth.currentUser) {
      addDoc(collection(db, 'users', auth.currentUser.uid, 'blame_resets'), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        speed,
        durationSeconds,
        manageChoice,
        source: 'user',
        exchangeMode: exchangeSummary?.mode ?? null,
        exchangeTurns: exchangeSummary?.mode === 'text' ? exchangeSummary.turns : null,
      }).catch(() => {
        // Non-fatal - the completion still counts for this session even if the write fails.
      });
      secureApiFetch('/api/user/mark-activity', {
        method: 'POST',
        data: { activity: 'blameReset' },
      }).catch(() => {
        // Non-fatal - only affects the home recommendation engine's freshness.
      });
    }
    logJourney(
      `Completed a ${speed === 'full' ? 'Full' : 'Mini'} BLAME Reset`,
      manageChoice ? `Chose to ${manageChoice} what they can't control.` : undefined,
    );

    onClose();
  };

  const currentStep = steps[stepIndex];
  const isBreatheActive = phase === 'step' && currentStep?.key === 'breathe';
  const progressPercent = isBreatheActive
    ? ((stepIndex + (currentStep.duration - timeLeft) / currentStep.duration) / steps.length) * 100
    : ((stepIndex) / steps.length) * 100;

  return (
    <AnimatePresence>
      <motion.div
        ref={dialogRef as any}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="BLAME Reset"
        tabIndex={-1}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-8 right-8 p-3 text-text-muted hover:text-text-main bg-white/5 rounded-full hover:bg-white/10 transition-all cursor-pointer z-50"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(234,88,12,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="max-w-md w-full p-8 text-center flex flex-col items-center justify-center relative z-10">

          <div className="flex items-center gap-3 mb-8 text-[#9a3412] dark:text-primary">
            <Zap className="w-6 h-6" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-[#9a3412] dark:text-primary">BLAME Reset</span>
          </div>

          <AnimatePresence mode="wait">
            {phase === 'intro' && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-8 text-left"
              >
                <div className="space-y-4">
                  <h3 className="text-3xl font-display font-bold text-text-main tracking-tight leading-tight">Stop the spiral</h3>
                  <p className="text-sm text-text-muted leading-relaxed">
                    A short interrupt for the moment you're about to react instead of respond —
                    Breathe, Locate, Accept, Manage, Empower. Not a personality change. Just a brake,
                    at your own pace.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => handleSelectSpeed('mini')}
                    className="w-full p-4 bg-surface dark:bg-card/50 rounded-2xl border border-border hover:border-primary/40 text-left transition-all cursor-pointer"
                  >
                    <p className="text-xs font-bold text-text-main">Quick Reset</p>
                    <p className="text-[10px] text-text-muted font-medium mt-0.5">For tension that's building but hasn't reached crisis mode — Manage and Empower merged into one step.</p>
                  </button>

                  <button
                    onClick={() => handleSelectSpeed('full')}
                    className="w-full p-4 bg-surface dark:bg-card/50 rounded-2xl border border-border hover:border-primary/40 text-left transition-all cursor-pointer"
                  >
                    <p className="text-xs font-bold text-text-main">Full Reset</p>
                    <p className="text-[10px] text-text-muted font-medium mt-0.5">For a genuine spike — all five steps, unhurried.</p>
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'step' && currentStep && (
              <motion.div
                key={`step-${stepIndex}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 flex flex-col items-center w-full"
              >
                <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="64" cy="64" r="56" className="stroke-border fill-none" strokeWidth="6" />
                    {isBreatheActive && (
                      <circle
                        cx="64" cy="64" r="56"
                        className="stroke-primary fill-none transition-all duration-1000"
                        strokeWidth="6"
                        strokeDasharray={2 * Math.PI * 56}
                        strokeDashoffset={(2 * Math.PI * 56) * (1 - (currentStep.duration - timeLeft) / currentStep.duration)}
                      />
                    )}
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <currentStep.icon className="w-7 h-7 text-primary mb-1" />
                    <span className="text-lg font-black text-text-main font-mono">{currentStep.letter}</span>
                  </div>
                </div>

                <div className="space-y-2 max-w-xs text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#9a3412] dark:text-primary font-mono block">
                    Step {stepIndex + 1} of {steps.length}{isBreatheActive ? ` · ${timeLeft}s` : ''}
                  </span>
                  <h3 className="text-2xl font-display font-extrabold text-text-main tracking-tight">
                    {currentStep.title}
                  </h3>
                  <p className="text-xs text-text-muted leading-relaxed font-medium">
                    {currentStep.instruction}
                  </p>
                  <p className="text-sm font-bold text-text-main italic pt-1">
                    &ldquo;{currentStep.prompt}&rdquo;
                  </p>
                </div>

                {currentStep.hasChoice && (
                  <div className="w-full space-y-2">
                    {MANAGE_CHOICES.map(choice => {
                      const selected = manageChoice === choice.key;
                      return (
                        <button
                          key={choice.key}
                          onClick={() => setManageChoice(choice.key)}
                          aria-pressed={selected}
                          className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                            selected
                              ? 'bg-primary/10 border-primary/40'
                              : 'bg-surface dark:bg-card/40 border-border hover:border-border/80'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                            selected ? 'bg-primary border-primary text-white' : 'border-border text-transparent bg-background'
                          }`}>
                            <Check className="w-3 h-3 stroke-[3px]" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-text-main">{choice.label}</p>
                            <p className="text-[10px] text-text-muted font-medium mt-0.5">{choice.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!isBreatheActive && (
                  <button
                    onClick={() => advanceTo(stepIndex + 1)}
                    className="w-full btn-primary py-3 font-black text-xs uppercase tracking-widest cursor-pointer"
                  >
                    Continue
                  </button>
                )}
              </motion.div>
            )}

            {phase === 'exchange' && currentStep && (
              <motion.div
                key="exchange"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full"
              >
                <div className="h-1.5 w-full bg-border rounded-full overflow-hidden mb-6">
                  <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                </div>
                <BlameLocateAcceptExchange
                  title={currentStep.title}
                  instruction={currentStep.instruction}
                  prompt={currentStep.prompt}
                  voiceEligible={blameVoiceEnabled}
                  onContinue={handleExchangeContinue}
                />
              </motion.div>
            )}

            {phase === 'complete' && (
              <motion.div
                key="complete"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-6 text-center w-full"
              >
                <div className="w-16 h-16 bg-surface dark:bg-card/40 rounded-full border border-border text-text-main flex items-center justify-center mx-auto">
                  <Check className="w-7 h-7 stroke-[1.5]" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-display font-bold text-text-main tracking-tight">That's it</h3>
                  <p className="text-xs text-text-muted leading-relaxed max-w-xs mx-auto">
                    {manageChoice
                      ? `You chose to ${manageChoice}. Go do that next, whenever you're ready.`
                      : "Whatever comes next, it comes from choice — not activation."}
                  </p>
                </div>

                <button
                  onClick={handleCompleteReset}
                  className="w-full btn-primary py-4 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                >
                  Done
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
