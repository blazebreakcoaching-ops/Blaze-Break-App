import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, Globe, MoonStar, ArrowRight, ShieldCheck, CheckCircle2, Feather } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface FaithValuesModeProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type GroundingMode = 'secular' | 'values' | 'faith' | 'islamic';

const MODES: Record<GroundingMode, { label: string, icon: any, description: string }> = {
  secular: { label: 'Secular / Biological', icon: Globe, description: 'Focus on physiology, neuroscience, and psychology.' },
  values: { label: 'Values-Driven', icon: Compass, description: 'Focus on ethics, core principles, and personal integrity.' },
  faith: { label: 'Faith-Friendly', icon: Feather, description: 'General spiritual grounding, gratitude, and trust.' },
  islamic: { label: 'Islamic Reflection', icon: MoonStar, description: 'Tawakkul (trust), Sabr (patience), and prayer integration.' }
};

const REFLECTIONS: Record<GroundingMode, Array<{title: string; content: string}>> = {
  secular: [
    { title: 'The Limits of Physiology', content: 'Your body is not a machine. It requires downtime to consolidate memory and repair cellular damage. Honoring this limit is logical, not lazy.' },
    { title: 'Circle of Control', content: 'You can only control your actions and your immediate responses. Everything else is external. Release the external.' },
  ],
  values: [
    { title: 'Integrity Check', content: 'Are your current commitments aligned with what you actually value, or are you operating out of obligation to others\' priorities?' },
    { title: 'The Virtue of Rest', content: 'Rest is not a reward for surviving burnout; it is a fundamental human right. Protecting your peace is an act of self-respect.' },
  ],
  faith: [
    { title: 'Release What Is Not Yours', content: 'You are responsible for the effort, not the outcome. Do your work with integrity, and release the results to a higher power.' },
    { title: 'Gratitude Anchor', content: 'In the midst of chaos, find three things that are holding you steady. Give thanks for the breath in your lungs and the strength you have been given.' },
  ],
  islamic: [
    { title: 'Tawakkul (Trust & Effort)', content: 'Tie your camel, then trust in Allah. You have put in the effort today. Now, step back and leave the outcome to the Most Merciful.' },
    { title: 'Sabr (Patience & Perseverance)', content: 'Patience is not passive suffering; it is maintaining your spiritual composure while navigating difficulty. Your endurance is recorded and rewarded.' },
    { title: 'Prayer Break Reminder', content: 'Salah is the ultimate boundary. It forces a complete pause from the material world to reconnect with the eternal. Guard your prayers, and they will guard you.' }
  ]
};

export const FaithValuesMode = ({ fingerprint, onAwardPoints }: FaithValuesModeProps) => {
  const [activeMode, setActiveMode] = useState<GroundingMode>('secular');
  const [completedReflection, setCompletedReflection] = useState<number | null>(null);

  const handleComplete = (idx: number) => {
    setCompletedReflection(idx);
    if (onAwardPoints) onAwardPoints(10, 'Completed Grounding Reflection');
    setTimeout(() => {
      setCompletedReflection(null);
    }, 3000);
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 19 / Grounding</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Faith & Values Grounding</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Burnout isolates us from our core. Choose the lens through which you want to process your recovery."
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(MODES) as GroundingMode[]).map((mode) => {
           const Icon = MODES[mode].icon;
           const isSelected = activeMode === mode;
           return (
             <button
               key={mode}
               onClick={() => setActiveMode(mode)}
               className={cn(
                 "p-6 rounded-2xl border transition-all text-left group",
                 isSelected 
                   ? "bg-primary border-primary text-primary-foreground shadow-xl shadow-primary/20 scale-[1.02]" 
                   : "border border-border/50 hover:border-primary/30 text-text-main hover:bg-surface dark:hover:bg-surface"
               )}
             >
               <div className={cn("w-10 h-10 rounded-full flex items-center justify-center mb-4 transition-colors", isSelected ? "bg-white/20" : "bg-surface dark:bg-surface text-text-muted group-hover:text-primary")}>
                 <Icon className="w-5 h-5" />
               </div>
               <h4 className="font-display font-bold text-lg mb-1">{MODES[mode].label}</h4>
               <p className={cn("text-xs font-medium leading-relaxed", isSelected ? "text-primary-foreground" : "text-text-muted")}>
                 {MODES[mode].description}
               </p>
             </button>
           );
        })}
      </div>

      <div className="mt-12">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-6 h-6 text-primary" />
          <h3 className="text-2xl font-display font-bold text-text-main">Your {MODES[activeMode].label} Reflections</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {REFLECTIONS[activeMode].map((ref, idx) => (
              <motion.div
                key={ref.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="card border border-primary/10 p-8 flex flex-col justify-between"
              >
                <div>
                  <h4 className="text-xl font-bold text-text-main mb-3">{ref.title}</h4>
                  <p className="text-text-muted font-medium leading-relaxed mb-6">
                    "{ref.content}"
                  </p>
                </div>
                
                {completedReflection !== idx ? (
                  <button 
                    onClick={() => handleComplete(idx)}
                    className="flex w-full justify-center items-center gap-2 p-4 rounded-xl border border-border/50 hover:bg-primary hover:text-primary-foreground transition-colors group text-text-main font-bold"
                  >
                    Acknowledge & Release <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                ) : (
                  <div className="flex w-full justify-center items-center gap-2 p-4 rounded-xl bg-success text-white font-bold transition-all">
                    <CheckCircle2 className="w-5 h-5" /> Grounded
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
