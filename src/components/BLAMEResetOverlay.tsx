import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wind, Compass, CheckCircle2, ListChecks, Sparkles, X, Check, Award, Zap } from 'lucide-react';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { addDoc, collection } from 'firebase/firestore';
import { secureApiFetch } from '../lib/secure-api';
import { logJourney } from '../lib/nova-brain';
import { useFocusTrap } from '../lib/useFocusTrap';

interface BLAMEResetOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type Speed = 'mini' | 'full';
type ManageChoice = 'delete' | 'delegate' | 'do';
type StepKey = 'breathe' | 'locate' | 'accept' | 'manage' | 'empower' | 'locateAccept' | 'manageEmpower';

interface BlameStep {
  key: StepKey;
  letter: string;
  title: string;
  instruction: string;
  prompt: string;
  duration: number;
  hasChoice?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

// The book's own step order and prompts, verbatim - Breathe/Locate/Accept/
// Manage/Empower. Full BLAME runs all 5 at their canonical 20/20/10/30/10s
// timings; Mini BLAME collapses them into 3 stages at ~10s each for a
// Green/Amber moment that doesn't need the full 90-second version.
const FULL_STEPS: BlameStep[] = [
  {
    key: 'breathe', letter: 'B', title: 'Breathe and Become Aware',
    instruction: 'A physiological sigh: double inhale through your nose, then a long exhale through your mouth. Repeat once more.',
    prompt: "I'm activated. I'm not broken.",
    duration: 20, icon: Wind,
  },
  {
    key: 'locate', letter: 'L', title: 'Locate the Root Cause',
    instruction: 'Name the actual trigger, underneath the surface reaction.',
    prompt: 'What am I actually reacting to?',
    duration: 20, icon: Compass,
  },
  {
    key: 'accept', letter: 'A', title: "Accept What You Can't Control",
    instruction: 'Acknowledge it in plain language, without fighting it.',
    prompt: "What's true right now, even if I don't like it?",
    duration: 10, icon: CheckCircle2,
  },
  {
    key: 'manage', letter: 'M', title: 'Manage What You Can',
    instruction: 'Choose exactly one.',
    prompt: "What's the smallest move that helps?",
    duration: 30, hasChoice: true, icon: ListChecks,
  },
  {
    key: 'empower', letter: 'E', title: 'Empower Yourself to Evolve',
    instruction: 'Take the action, then ask:',
    prompt: 'What would the upgraded version of me do next?',
    duration: 10, icon: Sparkles,
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
    duration: 10, icon: Compass,
  },
  {
    key: 'manageEmpower', letter: 'M · E', title: 'Manage + Empower',
    instruction: 'Choose one, then act.',
    prompt: "What's the smallest move that helps?",
    duration: 10, hasChoice: true, icon: ListChecks,
  },
];

const MANAGE_CHOICES: { key: ManageChoice; label: string; description: string }[] = [
  { key: 'delete', label: 'Delete', description: 'Say no, cancel it, remove it from the list.' },
  { key: 'delegate', label: 'Delegate', description: 'Hand it to someone else — including your future self.' },
  { key: 'do', label: 'Do', description: 'The smallest meaningful step, right now.' },
];

export const BLAMEResetOverlay = ({ isOpen, onClose, onAwardPoints }: BLAMEResetOverlayProps) => {
  const dialogRef = useFocusTrap(isOpen);
  const [phase, setPhase] = useState<'intro' | 'active' | 'complete'>('intro');
  const [speed, setSpeed] = useState<Speed | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [manageChoice, setManageChoice] = useState<ManageChoice | null>(null);

  const steps = speed === 'mini' ? MINI_STEPS : FULL_STEPS;
  const totalDuration = speed === 'mini' ? 30 : 90;

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
    }
  }, [isOpen]);

  // Per-step countdown - advances to the next step automatically, and to
  // 'complete' once the last step finishes. The Manage/Manage+Empower
  // step's Delete/Delegate/Do choice is optional within the window, same
  // as the grounding checklist in SomaticResetOverlay - it's not gated on
  // making a choice, since forcing one would fight the book's own framing
  // of Manage as a real, sometimes-slow decision, not a quiz answer.
  useEffect(() => {
    if (!isOpen || phase !== 'active') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (stepIndex >= steps.length - 1) {
            setPhase('complete');
          } else {
            setStepIndex(i => i + 1);
            setTimeLeft(steps[stepIndex + 1].duration);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, phase, stepIndex]);

  if (!isOpen) return null;

  const handleSelectSpeed = (s: Speed) => {
    const stepList = s === 'mini' ? MINI_STEPS : FULL_STEPS;
    setSpeed(s);
    setStepIndex(0);
    setTimeLeft(stepList[0].duration);
    setPhase('active');
  };

  const handleCompleteReset = () => {
    const points = speed === 'full' ? 25 : 15;
    if (onAwardPoints) {
      onAwardPoints(points, `Completed ${speed === 'full' ? 'Full' : 'Mini'} BLAME Reset`);
    }

    if (auth.currentUser) {
      addDoc(collection(db, 'users', auth.currentUser.uid, 'blame_resets'), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        speed,
        durationSeconds: totalDuration,
        manageChoice,
        source: 'user',
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
  const progressPercent = phase === 'active' ? ((stepIndex + (steps[stepIndex].duration - timeLeft) / steps[stepIndex].duration) / steps.length) * 100 : 0;

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
                    Breathe, Locate, Accept, Manage, Empower. Not a personality change. Just a brake.
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => handleSelectSpeed('mini')}
                    className="w-full p-4 bg-surface dark:bg-card/50 rounded-2xl border border-border hover:border-primary/40 text-left transition-all cursor-pointer"
                  >
                    <p className="text-xs font-bold text-text-main">Mini BLAME — 30 seconds</p>
                    <p className="text-[10px] text-text-muted font-medium mt-0.5">For tension that's building but hasn't reached crisis mode.</p>
                  </button>

                  <button
                    onClick={() => handleSelectSpeed('full')}
                    className="w-full p-4 bg-surface dark:bg-card/50 rounded-2xl border border-border hover:border-primary/40 text-left transition-all cursor-pointer"
                  >
                    <p className="text-xs font-bold text-text-main">Full BLAME — 90 seconds</p>
                    <p className="text-[10px] text-text-muted font-medium mt-0.5">For a genuine spike — all five steps, unhurried.</p>
                  </button>
                </div>
              </motion.div>
            )}

            {phase === 'active' && currentStep && (
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
                    <circle
                      cx="64" cy="64" r="56"
                      className="stroke-primary fill-none transition-all duration-1000"
                      strokeWidth="6"
                      strokeDasharray={2 * Math.PI * 56}
                      strokeDashoffset={(2 * Math.PI * 56) * (1 - (currentStep.duration - timeLeft) / currentStep.duration)}
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <currentStep.icon className="w-7 h-7 text-primary mb-1" />
                    <span className="text-lg font-black text-text-main font-mono">{currentStep.letter}</span>
                  </div>
                </div>

                <div className="space-y-2 max-w-xs text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#9a3412] dark:text-primary font-mono block">
                    Step {stepIndex + 1} of {steps.length} · {timeLeft}s
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
              </motion.div>
            )}

            {phase === 'complete' && (
              <motion.div
                key="complete"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-6 text-center w-full"
              >
                <div className="relative w-24 h-24 bg-success/10 rounded-xl border border-success/30 text-success dark:text-[#4ade80] flex items-center justify-center mx-auto mb-6">
                  <div className="absolute inset-0 bg-success/5 rounded-xl animate-ping pointer-events-none" style={{ animationDuration: '3s' }} />
                  <Sparkles className="w-12 h-12 stroke-[1.5]" />
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-success dark:text-[#4ade80] font-mono block">
                    Choice Restored
                  </span>
                  <h3 className="text-3xl font-display font-black text-text-main tracking-tight">You're back in control</h3>
                  <p className="text-xs text-text-muted leading-relaxed max-w-xs mx-auto">
                    {manageChoice
                      ? `You chose to ${manageChoice}. Go do that next.`
                      : "Whatever comes next, it comes from choice — not activation."}
                  </p>
                </div>

                <div className="bg-surface dark:bg-card/40 p-4 rounded-2xl border border-border text-left space-y-2.5 max-w-xs mx-auto">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted font-bold">Reset:</span>
                    <span className="font-mono text-text-main font-bold">{speed === 'full' ? 'Full' : 'Mini'} BLAME</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted font-bold">Duration:</span>
                    <span className="font-mono text-text-main font-bold">{totalDuration}s</span>
                  </div>
                  <div className="flex justify-between text-xs items-center">
                    <span className="text-text-muted font-bold">Stability points:</span>
                    <span className="text-[#166534] dark:text-[#4ade80] text-xs font-black uppercase tracking-widest font-mono bg-success/15 px-2 py-0.5 rounded border border-success/20 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" /> +{speed === 'full' ? 25 : 15} XP
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleCompleteReset}
                  className="w-full btn-primary py-4 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-2 group"
                >
                  Return to Dashboard <Check className="w-4 h-4 stroke-[3px]" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
