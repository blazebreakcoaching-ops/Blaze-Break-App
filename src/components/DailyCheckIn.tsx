import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Battery, ShieldAlert, Zap, Waves, Sparkles, Check, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface DailyCheckInProps {
  onComplete: (data: { energy: number; risk: string; stage: 'Safety' | 'Habits' | 'Identity' | 'Purpose'; blameStage: string }) => void;
  onClose: () => void;
}

const STAGES = [
  { id: 'Safety', label: 'Safety', icon: ShieldAlert, color: 'text-warning', bg: 'bg-warning/10', desc: 'Crisis management & safety.' },
  { id: 'Habits', label: 'Habits', icon: Battery, color: 'text-destructive', bg: 'bg-rose-50', desc: 'Rest & nervous system repair.' },
  { id: 'Identity', label: 'Identity', icon: Waves, color: 'text-text-main', bg: 'bg-sky-50', desc: 'Building boundaries & routines.' },
  { id: 'Purpose', label: 'Purpose', icon: Zap, color: 'text-teal-500', bg: 'bg-teal-50', desc: 'Intentional growth & expansion.' },
];

const BLAME_STAGES = [
  { id: 'B', label: 'B — Breathe and Become Aware', desc: 'Pause before reacting. Notice what is happening in your mind, body and emotions.' },
  { id: 'L', label: 'L — Locate the Root Cause', desc: 'Identify what is actually creating the pressure: workload, guilt, people-pleasing, conflict, exhaustion, fear or lack of boundaries.' },
  { id: 'A', label: 'A — Accept What You Can’t Control', desc: 'Separate what belongs to you from what does not. Stop carrying everything as if it is your personal responsibility.' },
  { id: 'M', label: 'M — Manage What You Can', desc: 'Choose one practical action: reduce a task, set a boundary, ask for support, rest, communicate clearly or change the plan.' },
  { id: 'E', label: 'E — Empower Yourself to Evolve', desc: 'Take the lesson forward. Build a stronger recovery habit, boundary or belief so the same pattern does not keep burning you out.' }
];

const RISKS = ['Low', 'Moderate', 'Elevated', 'High'];

export const DailyCheckIn = ({ onComplete, onClose }: DailyCheckInProps) => {
  const [step, setStep] = useState(0);
  const [energy, setEnergy] = useState(50);
  const [risk, setRisk] = useState('Moderate');
  const [stage, setStage] = useState<'Safety' | 'Habits' | 'Identity' | 'Purpose'>('Safety');
  const [blameStage, setBlameStage] = useState(BLAME_STAGES[0].id);

  const handleFinish = () => {
    const selectedBlame = BLAME_STAGES.find(b => b.id === blameStage)?.label || blameStage;
    onComplete({ energy, risk, stage, blameStage: selectedBlame });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-card/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md bg-card rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-text-main">Daily Pulse</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface dark:bg-card rounded-full transition-colors text-text-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div 
                key="step0"
                initial={{ opacity: 0, x: 10 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest font-black text-text-muted">Current Energy: {energy}%</label>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    value={energy}
                    onChange={(e) => setEnergy(parseInt(e.target.value))}
                    className="w-full h-1 bg-surface dark:bg-card rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs font-mono text-text-muted">
                    <span>Depleted</span>
                    <span>Radiant</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest font-black text-text-muted">Burnout Risk</label>
                  <div className="grid grid-cols-2 gap-2">
                    {RISKS.map(r => (
                      <button
                        key={r}
                        onClick={() => setRisk(r)}
                        className={cn(
                          "py-3 rounded-xl border text-xs font-bold transition-all",
                          risk === r ? "bg-primary text-primary-foreground border-primary shadow-lg" : "bg-surface dark:bg-card text-text-main border-border hover:border-text-muted"
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div 
                key="step1"
                initial={{ opacity: 0, x: 10 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                <label className="text-xs uppercase tracking-widest font-black text-text-muted">S.H.I.P Stage</label>
                <div className="space-y-2">
                  {STAGES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStage(s.id as any)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left",
                        stage === s.id ? "bg-card border-primary shadow-md ring-1 ring-primary/20" : "bg-surface border-transparent hover:bg-card hover:border-border"
                      )}
                    >
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", s.bg, s.color)}>
                        <s.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-text-main">{s.label}</span>
                          {stage === s.id && <Check className="w-4 h-4 text-primary" />}
                        </div>
                        <p className="text-xs text-text-muted italic uppercase tracking-tighter">{s.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div 
                key="step2"
                initial={{ opacity: 0, x: 10 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                <label className="text-xs uppercase tracking-widest font-black text-text-muted">B.L.A.M.E Identity Loop</label>
                <div className="space-y-2">
                  {BLAME_STAGES.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setBlameStage(b.id)}
                      className={cn(
                        "w-full flex flex-col p-4 rounded-2xl border transition-all text-left",
                        blameStage === b.id ? "bg-white border-destructive shadow-md ring-1 ring-rose-500/20" : "bg-surface border-transparent hover:bg-white hover:border-border"
                      )}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className={cn("font-bold text-sm", blameStage === b.id ? "text-rose-600" : "text-text-muted")}>{b.label}</span>
                        {blameStage === b.id && <Check className="w-4 h-4 text-destructive" />}
                      </div>
                      <p className={cn("text-xs leading-relaxed", blameStage === b.id ? "text-destructive/80" : "text-text-muted")}>
                        {b.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 bg-surface dark:bg-card border-t border-border flex gap-3">
          {step > 0 && (
            <button 
              onClick={() => setStep(step - 1)}
              className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-text-muted hover:text-text-muted transition-colors"
            >
              Back
            </button>
          )}
          <button 
            onClick={() => step < 2 ? setStep(step + 1) : handleFinish()}
            className="flex-[2] btn-primary py-4 rounded-xl text-xs uppercase tracking-widest shadow-lg shadow-primary/20"
          >
            {step < 2 ? "Next Step" : "Record Pulse"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
