import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wind, X, CheckCircle2, AlertOctagon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFocusTrap } from '../lib/useFocusTrap';

interface TacticalOverrideProps {
  onComplete?: () => void;
}

export const TacticalOverride = ({ onComplete }: TacticalOverrideProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'breathing' | 'anchoring' | 'cleared'>('idle');
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold1' | 'exhale' | 'hold2'>('inhale');
  const [cycles, setCycles] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const dialogRef = useFocusTrap(isOpen);

  // Esc key closes it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'breathing') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase]);

  // Handle Box Breathing Logic
  useEffect(() => {
    if (phase !== 'breathing') return;

    const cycleTimes = {
      inhale: 4000,
      hold1: 4000,
      exhale: 6000,
      hold2: 4000
    };

    let timeout: NodeJS.Timeout;

    const runCycle = (current: typeof breathPhase) => {
      timeout = setTimeout(() => {
        if (current === 'inhale') setBreathPhase('hold1');
        else if (current === 'hold1') setBreathPhase('exhale');
        else if (current === 'exhale') setBreathPhase('hold2');
        else if (current === 'hold2') {
          setBreathPhase('inhale');
          setCycles(c => {
            const next = c + 1;
            if (next >= 3) {
              setPhase('anchoring'); // Move to next phase after 3 cycles
            }
            return next;
          });
        }
      }, cycleTimes[current]);
    };

    runCycle(breathPhase);

    return () => clearTimeout(timeout);
  }, [phase, breathPhase]);


  const startOverride = () => {
    setIsOpen(true);
    setPhase('idle');
  };

  const initiateBreathing = () => {
    setPhase('breathing');
    setBreathPhase('inhale');
    setCycles(0);
  };

  const handlePointerDown = () => {
    setIsPressing(true);
    // Tactile engagement to progress if we want to make it manual in the future,
    // currently we use automatic box breathing but visually react to press.
  };

  const handlePointerUp = () => {
    setIsPressing(false);
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={startOverride}
        className="fixed bottom-6 left-6 z-50 px-4 py-3 rounded-full bg-destructive/10 border border-destructive/50 shadow-2xl flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all group backdrop-blur-md"
      >
        <AlertOctagon className="w-5 h-5 mr-2" />
        <span className="font-bold text-sm tracking-widest uppercase">Emergency Override</span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dialogRef as any}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Emergency Override"
            tabIndex={-1}
            className="fixed inset-0 z-[100] bg-surface flex flex-col items-center justify-center p-6 text-text-main"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <button 
              onClick={() => setIsOpen(false)}
              aria-label="Close emergency override"
              className="absolute top-8 right-8 p-3 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-6 h-6 text-text-muted" />
            </button>

            {phase === 'idle' && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="max-w-md w-full text-center space-y-8"
              >
                <div className="w-20 h-20 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertOctagon className="w-10 h-10 text-destructive" />
                </div>
                <h1 className="text-3xl font-black uppercase tracking-widest text-text-main">System Overload Detected</h1>
                <p className="text-text-muted text-lg">
                  You are spinning. Cognitive capacity is compromised. We need to regulate your nervous system before you take any action.
                </p>
                <button
                  onClick={initiateBreathing}
                  className="w-full py-4 mt-8 bg-surface dark:bg-card text-text-main font-black text-lg uppercase tracking-widest rounded-xl hover:bg-border transition-colors"
                >
                  Initiate Reset Protocol
                </button>
              </motion.div>
            )}

            {phase === 'breathing' && (
              <motion.div 
                key="breathing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full w-full max-w-lg"
              >
                <h2 role="status" aria-live="polite" className="text-xl font-bold text-text-muted uppercase tracking-widest mb-16 text-center h-8">
                  {breathPhase === 'inhale' && 'Inhale...'}
                  {breathPhase === 'hold1' && 'Hold...'}
                  {breathPhase === 'exhale' && 'Exhale...'}
                  {breathPhase === 'hold2' && 'Hold...'}
                </h2>

                <div className="relative w-64 h-64 flex items-center justify-center">
                  <motion.div
                    animate={{
                      scale: breathPhase === 'inhale' ? 1.5 : breathPhase === 'hold1' ? 1.5 : breathPhase === 'exhale' ? 0.8 : 0.8,
                      opacity: breathPhase === 'inhale' ? 1 : breathPhase === 'hold1' ? 0.8 : breathPhase === 'exhale' ? 0.5 : 0.3,
                    }}
                    transition={{ duration: breathPhase === 'inhale' ? 4 : breathPhase === 'exhale' ? 6 : 4, ease: "linear" }}
                    className="absolute inset-0 bg-primary rounded-full blur-3xl opacity-50"
                  />
                  
                  <motion.div
                    animate={{
                      scale: breathPhase === 'inhale' ? 1 : breathPhase === 'hold1' ? 1 : breathPhase === 'exhale' ? 0.5 : 0.5,
                    }}
                    transition={{ duration: breathPhase === 'inhale' ? 4 : breathPhase === 'exhale' ? 6 : 4, ease: "linear" }}
                    className={cn(
                      "w-48 h-48 rounded-full flex items-center justify-center transition-colors duration-700 z-10 border-4",
                      breathPhase === 'inhale' ? 'bg-primary border-primary' : 
                      breathPhase === 'hold1' ? 'bg-primary/80 border-primary' : 
                      breathPhase === 'exhale' ? 'bg-surface border-border' : 
                      'bg-card border-border'
                    )}
                  >
                    <Wind className={cn("w-16 h-16 transition-colors duration-700", breathPhase.includes('hold') ? 'text-text-muted' : 'text-text-main')} />
                  </motion.div>
                </div>

                <div className="mt-20">
                  <p className="text-text-muted text-sm font-medium tracking-widest uppercase">
                    Cycle {cycles + 1} of 3
                  </p>
                </div>
              </motion.div>
            )}

            {phase === 'anchoring' && (
              <motion.div 
                key="anchoring"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full text-center space-y-8"
              >
                <div className="w-20 h-20 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-success dark:text-[#4ade80]" />
                </div>
                <h1 className="text-3xl font-black uppercase tracking-widest text-text-main">Nervous System Stabilized</h1>
                <div className="space-y-4 text-left bg-card border border-border p-6 rounded-2xl">
                  <h3 className="text-text-muted font-bold mb-4">Immediate Action Required:</h3>
                  <div className="p-4 bg-card rounded-xl">
                    <p className="text-sm font-medium text-text-main">1. Do not reply to the trigger message.</p>
                  </div>
                  <div className="p-4 bg-card rounded-xl">
                    <p className="text-sm font-medium text-text-main">2. Close the tab that caused the spin.</p>
                  </div>
                  <div className="p-4 bg-card rounded-xl">
                    <p className="text-sm font-medium text-text-main">3. Pick ONE microscopic task to execute next.</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    if (onComplete) onComplete();
                  }}
                  className="w-full py-4 mt-8 bg-success text-success-foreground font-black text-lg uppercase tracking-widest rounded-xl hover:bg-success transition-colors"
                >
                  Return to Dashboard
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
