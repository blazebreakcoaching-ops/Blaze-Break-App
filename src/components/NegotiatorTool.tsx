import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Briefcase, Calendar, Clock, Send, Copy, CheckCircle2, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

export const NegotiatorTool = () => {
  const [step, setStep] = useState(0);
  const [request, setRequest] = useState({
    type: 'Extension',
    reason: 'Executive Fatigue',
    intensity: 'Firm',
    project: ''
  });
  const [generatedScript, setGeneratedScript] = useState('');

  const types = ['Extension', 'Delegation', 'Scope Reduction', 'Meeting Opt-out'];
  const reasons = ['Executive Fatigue', 'Capacity Overflow', 'Strategic Realignment', 'Health Priority'];
  const intensities = ['Collaborative', 'Firm', 'Non-Negotiable'];

  const generate = () => {
    const scripts: Record<string, string> = {
      'Extension-Firm': `I've audited the project timeline for [Project]. Given my current executive bandwidth, I'm adjusting the delivery to [Date] to maintain our quality standards. This ensures we don't rush the final review phase.`,
      'Delegation-Firm': `To ensure [Project] stays on track while I focus on [Core Task], I'm transitioning these responsibilities to [Name]. I've prepared a handoff doc to ensure a seamless shift.`,
      'Scope Reduction-Collaborative': `I'm seeing a conflict between the current deadline and the required scope for [Project]. If we want to hit the [Date] target, I recommend we move the [Feature] to Phase 2. How does that align with your priorities?`,
      'Meeting Opt-out-Non-Negotiable': `I'm declining this meeting as I'm currently at my cognitive limit for today and need to protect my execution blocks. Please send the recording or notes; I'll provide my input asynchronously by tomorrow.`,
    };

    const key = `${request.type}-${request.intensity}`;
    setGeneratedScript(scripts[key] || `I am requesting a ${request.type} for the project due to ${request.reason}. I appreciate your understanding as I prioritize high-quality output.`);
    setStep(2);
  };

  return (
    <div className="card border-primary/20 bg-surface dark:bg-card/30">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
          <Briefcase className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-light text-text-main">Workload Negotiator</h3>
          <p className="text-xs uppercase font-black tracking-widest text-text-muted">Data-Driven Communication Builder</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="step0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-widest text-text-muted">1. What do you need?</label>
              <div className="grid grid-cols-2 gap-2">
                {types.map(t => (
                  <button 
                    key={t}
                    onClick={() => setRequest({ ...request, type: t })}
                    className={cn(
                      "p-4 rounded-xl border text-xs font-bold text-left transition-all",
                      request.type === t ? "bg-primary text-primary-foreground border-primary shadow-lg" : "bg-card text-text-muted border-border hover:border-primary"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => setStep(1)} className="w-full btn-primary py-4 rounded-xl text-xs uppercase tracking-widest font-black">Next Phase</button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-widest text-text-muted">2. Why? (Internal Justification)</label>
              <div className="grid grid-cols-2 gap-2">
                {reasons.map(r => (
                  <button 
                    key={r}
                    onClick={() => setRequest({ ...request, reason: r })}
                    className={cn(
                      "p-4 rounded-xl border text-xs font-bold text-left transition-all",
                      request.reason === r ? "bg-primary text-primary-foreground border-primary shadow-lg" : "bg-card text-text-muted border-border hover:border-primary"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-widest text-text-muted">3. Tone Intensity</label>
              <div className="flex gap-2">
                {intensities.map(i => (
                  <button 
                    key={i}
                    onClick={() => setRequest({ ...request, intensity: i })}
                    className={cn(
                      "flex-1 p-3 rounded-lg border text-xs font-black uppercase tracking-widest transition-all",
                      request.intensity === i ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-card text-text-muted border-border hover:border-border"
                    )}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-muted">Back</button>
              <button onClick={generate} className="flex-[2] btn-primary py-4 rounded-xl text-xs uppercase tracking-widest font-black shadow-lg shadow-primary/20">Generate Script</button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6 text-center">
            <div className="p-8 bg-card text-text-main rounded-3xl relative overflow-hidden text-left mb-6 shadow-sm border border-border">
              <p className="text-xl font-light leading-relaxed mb-8 italic">"{generatedScript}"</p>
              <div className="flex gap-3 relative z-10">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(generatedScript);
                  }}
                  className="flex-1 bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all"
                >
                  <Copy className="w-4 h-4" /> Copy Script
                </button>
                <button 
                   onClick={() => setStep(0)}
                   className="flex-1 border border-border hover:border-text-muted py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all"
                >
                  Reset
                </button>
              </div>
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Send className="w-12 h-12" />
              </div>
            </div>

            <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl flex gap-3 text-left">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <p className="text-xs text-warning-foreground uppercase font-black leading-tight tracking-wide">
                NEGOTIATION TIP: If they push back, immediately pivot to a "priority swap" question. Do not apologize for the budget.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
