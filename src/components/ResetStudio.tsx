import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { BurnoutFingerprint } from '../types';
import { RESET_STUDIO_STATE_ORDER, RESET_STUDIO_STATES, ResetStudioState } from '../../reset-studio-engine';
import { RuminationFurnace } from './RuminationFurnace';
import { PressureValve } from './PressureValve';
import { StaticSweep } from './StaticSweep';
import { MakeItSmaller } from './MakeItSmaller';
import { SparkCheck } from './SparkCheck';
import { UntangleWithNova } from './UntangleWithNova';

interface ResetStudioProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
  onOpenCrisisSupport?: () => void;
}

// CORE RESET STUDIO MODEL: the user chooses the feeling, Blaze Break
// chooses the tool - never "which intervention would you like?". This is
// the one entry point; everything below it is a single focused tool for
// the state picked, never a dashboard or a library of cards.
export const ResetStudio = ({ fingerprint, onAwardPoints, onNavigate, onOpenCrisisSupport }: ResetStudioProps) => {
  const [selected, setSelected] = useState<ResetStudioState | null>(null);

  const handleBack = () => setSelected(null);

  // Lets a tool elsewhere on the same "reset" tab (the Breathing &
  // Guided Reset experience, demoted into "More ways to reset") hand off
  // into one of these six states without threading a callback prop
  // through App.tsx - same window-event pattern already used throughout
  // this codebase (navigate_tab, open_crisis_support).
  useEffect(() => {
    const handleSelectState = (e: Event) => {
      const detail = (e as CustomEvent<ResetStudioState>).detail;
      if (RESET_STUDIO_STATE_ORDER.includes(detail)) {
        setSelected(detail);
        document.getElementById('reset-studio-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('reset_studio_select_state', handleSelectState);
    return () => window.removeEventListener('reset_studio_select_state', handleSelectState);
  }, []);

  return (
    <div id="reset-studio-section" className="space-y-8">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="tag">Stabilise · Core Pillar: Rebuild</div>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="space-y-4">
          <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Reset Studio</h3>
          <p className="text-xl text-text-muted font-medium max-w-2xl">
            Too much going on upstairs? Start with what it feels like right now.
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!selected && (
          <motion.div key="picker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <p className="text-2xl font-display font-medium text-text-main text-center">What's happening in your head?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {RESET_STUDIO_STATE_ORDER.map((id) => {
                const state = RESET_STUDIO_STATES[id];
                return (
                  <button
                    key={id}
                    onClick={() => setSelected(id)}
                    className="card p-6 border border-border hover:border-primary/50 text-left space-y-2 transition-colors"
                  >
                    <span className="block text-2xl font-display font-bold text-text-main">{state.label}</span>
                    <span className="block text-sm text-text-muted">{state.description}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {selected && (
          <motion.div key={selected} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <button onClick={handleBack} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Reset Studio
            </button>

            {selected === 'looping' && <RuminationFurnace onCleared={() => onAwardPoints?.(20, 'Rumination Cleared')} />}
            {selected === 'fuming' && <PressureValve />}
            {selected === 'scattered' && <StaticSweep />}
            {selected === 'flooded' && <MakeItSmaller />}
            {selected === 'flat' && <SparkCheck onNavigate={onNavigate} onOpenCrisisSupport={onOpenCrisisSupport} />}
            {selected === 'stuck' && <UntangleWithNova fingerprint={fingerprint} onAwardPoints={onAwardPoints} onNavigate={onNavigate} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
