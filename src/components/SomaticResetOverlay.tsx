import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wind, X, HeartPulse, ShieldCheck, Check, Award } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { addDoc, collection } from 'firebase/firestore';
import { secureApiFetch } from '../lib/secure-api';
import { logJourney } from '../lib/nova-brain';
import { useFocusTrap } from '../lib/useFocusTrap';

interface SomaticResetOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onAwardPoints?: (amount: number, reason: string) => void;
}

export const SomaticResetOverlay = ({ isOpen, onClose, onAwardPoints }: SomaticResetOverlayProps) => {
  const dialogRef = useFocusTrap(isOpen);
  const [timeLeft, setTimeLeft] = useState(60);
  const [exerciseState, setExerciseState] = useState<'intro' | 'breathing' | 'grounding' | 'complete'>('intro');
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale' | 'rest'>('inhale');
  const [breathTimer, setBreathTimer] = useState(4); // seconds for current breathing step

  // Grounding checkboxes
  const [groundingChecks, setGroundingChecks] = useState({
    texture: false,
    sound: false,
    tension: false,
    heartbeat: false,
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Main 60-second countdown timer
  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(60);
      setExerciseState('intro');
      setBreathPhase('inhale');
      setBreathTimer(4);
      setGroundingChecks({
        texture: false,
        sound: false,
        tension: false,
        heartbeat: false,
      });
      return;
    }

    if (exerciseState === 'intro' || exerciseState === 'complete') return;

    const mainTimer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(mainTimer);
          setExerciseState('complete');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(mainTimer);
  }, [isOpen, exerciseState]);

  // Breathing pattern cycle (takes first 30 seconds of the 60s duration)
  useEffect(() => {
    if (!isOpen || exerciseState !== 'breathing') return;

    const breathingInterval = setInterval(() => {
      setBreathTimer(prev => {
        if (prev <= 1) {
          // Move to next phase in the Box Breathing cycle
          let nextPhase: 'inhale' | 'hold' | 'exhale' | 'rest' = 'inhale';
          let nextDuration = 4;

          if (breathPhase === 'inhale') {
            nextPhase = 'hold';
            nextDuration = 12; // long breath hold for nervous system down-regulation
          } else if (breathPhase === 'hold') {
            nextPhase = 'exhale';
            nextDuration = 8; // long, slow parasympathetic activating exhale
          } else if (breathPhase === 'exhale') {
            nextPhase = 'rest';
            nextDuration = 6;
          } else {
            nextPhase = 'inhale';
            nextDuration = 4;
          }

          // Transition to Grounding Phase when 30 seconds are up
          if (timeLeft <= 30) {
            setExerciseState('grounding');
            clearInterval(breathingInterval);
            return 0;
          }

          setBreathPhase(nextPhase);
          return nextDuration;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(breathingInterval);
  }, [isOpen, exerciseState, breathPhase, timeLeft]);

  if (!isOpen) return null;

  // Percentage for progress circle
  const progressPercent = ((60 - timeLeft) / 60) * 100;

  const handleStartReset = () => {
    setExerciseState('breathing');
    setTimeLeft(60);
    setBreathPhase('inhale');
    setBreathTimer(4);
  };

  const handleCompleteReset = () => {
    if (onAwardPoints) {
      onAwardPoints(75, "Completed 60s Somatic Reset Session");
    }

    // Persist to Firestore, mark real activity for the recommendation
    // engine, and log to Nova's journey - previously this only wrote to a
    // localStorage key that nothing ever read, and Nova had no visibility
    // into this session happening at all.
    if (auth.currentUser) {
      addDoc(collection(db, 'users', auth.currentUser.uid, 'somatic_reset_sessions'), {
        durationSeconds: 60,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).catch(() => {
        // Non-fatal - the completion still counts for this session even if the write fails.
      });
      secureApiFetch('/api/user/mark-activity', {
        method: 'POST',
        data: { activity: 'nervousSystemReset' },
      }).catch(() => {
        // Non-fatal - only affects the home recommendation engine's freshness.
      });
    }
    logJourney('Completed a 60-second somatic reset session', 'Breathing and grounding sequence.');

    onClose();
  };

  const toggleGrounding = (key: keyof typeof groundingChecks) => {
    setGroundingChecks(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={dialogRef as any}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label="Nervous System Reset"
        tabIndex={-1}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl"
      >
        {/* Close button */}
        <button 
          onClick={onClose} 
          aria-label="Close"
          className="absolute top-8 right-8 p-3 text-text-muted hover:text-text-main bg-white/5 rounded-full hover:bg-white/10 transition-all cursor-pointer z-50"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(234,88,12,0.08)_0%,transparent_70%)] pointer-events-none" />

        <div className="max-w-md w-full p-8 text-center flex flex-col items-center justify-center relative z-10">
          
          {/* HEADER STATUS */}
          <div className="flex items-center gap-3 mb-8 text-[#9a3412] dark:text-primary">
            <HeartPulse className="w-6 h-6 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-[#9a3412] dark:text-primary">Nervous System Reset</span>
          </div>

          <AnimatePresence mode="wait">
            {/* INTRO SCREEN */}
            {exerciseState === 'intro' && (
              <motion.div
                key="intro"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-8 text-left"
              >
                <div className="space-y-4">
                  <h3 className="text-3xl font-display font-bold text-text-main tracking-tight leading-tight">60-Second De-escalation</h3>
                  <p className="text-sm text-text-muted leading-relaxed">
                    This interactive workflow forces your high-stress cortisol signals to clear. We will guide you through:
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-4 bg-surface dark:bg-card/50 rounded-2xl border border-border">
                    <span className="w-6 h-6 rounded-lg bg-primary/10 text-[#9a3412] dark:text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <div>
                      <p className="text-xs font-bold text-text-main">Vagus Nerve Stimulation (30s)</p>
                      <p className="text-[10px] text-text-muted font-medium mt-0.5">Box breathing sequence with deep, elongated exhalations.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 bg-surface dark:bg-card/50 rounded-2xl border border-border">
                    <span className="w-6 h-6 rounded-lg bg-primary/10 text-[#9a3412] dark:text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <div>
                      <p className="text-xs font-bold text-text-main">Somatic Grounding Checklist (30s)</p>
                      <p className="text-[10px] text-text-muted font-medium mt-0.5">Interactive sensory checks to disengage from virtual workspace noise.</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleStartReset}
                  className="w-full btn-primary py-4 font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20"
                >
                  Initiate Parasympathetic Shift
                </button>
              </motion.div>
            )}

            {/* BREATHING SCREEN */}
            {exerciseState === 'breathing' && (
              <motion.div
                key="breathing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-8 flex flex-col items-center w-full"
              >
                {/* CIRCULAR PROGRESS */}
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle 
                      cx="96" cy="96" r="84" 
                      className="stroke-border fill-none" 
                      strokeWidth="6" 
                    />
                    <circle 
                      cx="96" cy="96" r="84" 
                      className="stroke-primary fill-none transition-all duration-1000" 
                      strokeWidth="6" 
                      strokeDasharray={2 * Math.PI * 84}
                      strokeDashoffset={(2 * Math.PI * 84) * (1 - progressPercent / 100)}
                    />
                  </svg>

                  {/* Inner breathing circle */}
                  <motion.div
                    animate={{
                      scale: breathPhase === 'inhale' ? [1, 1.4] : 
                             breathPhase === 'hold' ? 1.4 : 
                             breathPhase === 'exhale' ? [1.4, 1] : 1,
                      backgroundColor: breathPhase === 'hold' ? 'rgba(234,88,12,0.15)' : 'rgba(234,88,12,0.08)'
                    }}
                    transition={{ duration: breathTimer, ease: 'linear' }}
                    className="absolute w-36 h-36 rounded-full border border-primary/20 flex flex-col items-center justify-center"
                  >
                    <Wind className="w-8 h-8 text-primary mb-1 animate-pulse" />
                    <span className="text-xs font-bold text-text-muted font-mono">{timeLeft}s Left</span>
                  </motion.div>
                </div>

                <div className="space-y-2 max-w-xs text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary font-mono block">
                    Vagoveral Stimulation v1.0
                  </span>
                  <h3 className="text-3xl font-display font-extrabold text-text-main tracking-tight uppercase">
                    {breathPhase === 'inhale' && 'Inhale Deeply'}
                    {breathPhase === 'hold' && 'Retain Breath'}
                    {breathPhase === 'exhale' && 'Slow Release'}
                    {breathPhase === 'rest' && 'Relax & Pause'}
                  </h3>
                  <p className="text-xs text-text-muted leading-relaxed font-medium">
                    {breathPhase === 'inhale' && 'Expand your chest and stomach fully.'}
                    {breathPhase === 'hold' && 'Retain the carbon dioxide to calm neural arousal.'}
                    {breathPhase === 'exhale' && 'Let go with a slow, calming hum or sigh.'}
                    {breathPhase === 'rest' && 'Feel the temporary stillness of empty lungs.'}
                  </p>
                  <div className="pt-2 text-sm font-mono font-bold text-[#9a3412] dark:text-primary">
                    {breathTimer}s
                  </div>
                </div>
              </motion.div>
            )}

            {/* GROUNDING SCREEN */}
            {exerciseState === 'grounding' && (
              <motion.div
                key="grounding"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 text-left w-full"
              >
                <div className="text-center space-y-1 mb-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-warning font-mono block">
                    Sensory Anchoring Phase
                  </span>
                  <h3 className="text-2xl font-display font-bold text-text-main tracking-tight">Interactive Grounding</h3>
                  <p className="text-xs text-text-muted">Acknowledge your current physical reality to bypass digital fawning loops.</p>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full bg-border rounded-full overflow-hidden mb-6">
                  <div className="h-full bg-warning transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="space-y-2.5">
                  {[
                    { key: 'texture', text: 'Identify and touch 1 texture near you (desk, jeans)', sub: 'Somatic feel receptor anchor' },
                    { key: 'sound', text: 'Acknowledge 1 distant constant background noise', sub: 'Auditory cortex stabilization' },
                    { key: 'tension', text: 'Consciously drop your shoulders and unclench jaw', sub: 'Skeletal muscle decompression' },
                    { key: 'heartbeat', text: 'Place hand on heart: feel its steady pace', sub: 'Biofeedback loop normalization' },
                  ].map((item) => {
                    const checked = groundingChecks[item.key as keyof typeof groundingChecks];
                    return (
                      <button
                        key={item.key}
                        onClick={() => toggleGrounding(item.key as keyof typeof groundingChecks)}
                        role="checkbox"
                        aria-checked={checked}
                        className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                          checked 
                            ? 'bg-success/10 border-success/30' 
                            : 'bg-surface dark:bg-card/40 border-border hover:border-border/80'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                          checked ? 'bg-success border-success text-white' : 'border-border text-transparent bg-background'
                        }`}>
                          <Check className="w-3.5 h-3.5 stroke-[3px]" />
                        </div>
                        <div className="flex-1">
                          <p className={`text-xs font-bold leading-tight ${checked ? 'text-text-main line-through opacity-60' : 'text-text-main'}`}>
                            {item.text}
                          </p>
                          <p className="text-[9px] text-text-muted uppercase font-black tracking-widest mt-0.5">{item.sub}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="text-center font-mono text-xs text-text-muted pt-2 flex items-center justify-between">
                  <span>Grounding Timer:</span>
                  <span className="font-bold text-[#9a3412] dark:text-warning">{timeLeft}s remaining</span>
                </div>
              </motion.div>
            )}

            {/* COMPLETE SCREEN */}
            {exerciseState === 'complete' && (
              <motion.div
                key="complete"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-6 text-center w-full"
              >
                <div className="relative w-24 h-24 bg-success/10 rounded-xl border border-success/30 text-success dark:text-[#4ade80] flex items-center justify-center mx-auto mb-6">
                  <div className="absolute inset-0 bg-success/5 rounded-xl animate-ping pointer-events-none" style={{ animationDuration: '3s' }} />
                  <ShieldCheck className="w-12 h-12 stroke-[1.5]" />
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-success font-mono block">
                    Stability Locked
                  </span>
                  <h3 className="text-3xl font-display font-black text-text-main tracking-tight">Baseline Restored</h3>
                  <p className="text-xs text-text-muted leading-relaxed max-w-xs mx-auto">
                    You chose 60 seconds of conscious regulation over 60 seconds of passive performance. Your vagal tone has been stabilized.
                  </p>
                </div>

                <div className="bg-surface dark:bg-card/40 p-4 rounded-2xl border border-border text-left space-y-2.5 max-w-xs mx-auto">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted font-bold">Session Duration:</span>
                    <span className="font-mono text-text-main font-bold">60.0 Seconds</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted font-bold">Nervous System Shift:</span>
                    <span className="font-mono text-success font-bold">Normalized</span>
                  </div>
                  <div className="flex justify-between text-xs items-center">
                    <span className="text-text-muted font-bold">Stability points:</span>
                    <span className="text-[#166534] dark:text-[#4ade80] text-xs font-black uppercase tracking-widest font-mono bg-success/15 px-2 py-0.5 rounded border border-success/20 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5" /> +75 XP
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
