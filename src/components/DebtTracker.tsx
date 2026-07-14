import { motion } from 'motion/react';
import { History, TrendingDown, Clock, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { Debt } from '../types';

export const DebtTracker = ({ debts }: { debts: Debt[] }) => {
  return (
    <div className="card space-y-8 bg-card border-border shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="space-y-1">
          <h3 className="text-xl font-light text-text-main tracking-tight">Recovery Debt Inventory</h3>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-text-muted ">Real-time physiological audit</p>
        </div>
        <div className="p-2 bg-surface dark:bg-surface rounded-lg">
          <History className="w-5 h-5 text-primary" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {debts.map(d => (
          <div key={d.label} className="group space-y-4">
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-primary">{d.label}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-light text-text-main tabular-nums tracking-tighter">{d.value}</span>
                  <span className="text-lg text-text-muted font-light">{d.unit}</span>
                </div>
              </div>
              <div className="text-right space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted  italic block">Stress Potential</span>
                <div className={cn("text-xs font-bold font-mono px-2 py-1 rounded bg-surface dark:bg-surface", d.color)}>
                  {Math.round((d.value / d.max) * 100)}%
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="h-2 bg-surface dark:bg-surface rounded-full overflow-hidden">
                <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${(d.value / d.max) * 100}%` }}
                   className={cn("h-full transition-all duration-1000", d.color.replace('text-', 'bg-'))}
                />
              </div>
              <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-text-muted ">
                <span>Safe Range: 0-2</span>
                <span>Critical Collapse: {d.max}{d.unit}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                   <span className="text-[11px] font-black uppercase tracking-widest text-destructive">Biological Impact</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed font-serif italic border-l-2 border-rose-100 pl-4">
                  {d.impact}
                </p>
                {d.label === 'Sleep Debt' && (
                  <p className="text-xs text-text-muted  leading-relaxed pl-4">
                    Example: You might find yourself snapping at a direct report or over-explaining a simple decision to your manager.
                  </p>
                )}
                {d.label === 'Neural Fatigue' && (
                  <p className="text-xs text-text-muted  leading-relaxed pl-4">
                    Example: Reading the same email three times without understanding it, or "spacing out" during a critical strategic call.
                  </p>
                )}
                {d.label === 'Social Overlap' && (
                  <p className="text-xs text-text-muted  leading-relaxed pl-4">
                    Example: Agreeing to a Friday night dinner you're too tired for, then resenting the person who invited you.
                  </p>
                )}
              </div>
              
              <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 relative overflow-hidden flex flex-col justify-between">
                <div className="relative z-10 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-primary">Nova's Surgical Commentary</span>
                  </div>
                  <p className="text-sm text-text-main font-medium leading-relaxed italic">"{d.novaNote}"</p>
                </div>
                
                <div className="mt-4 pt-4 border-t border-primary/5">
                  <span className="text-[11px] font-black uppercase tracking-widest text-text-muted ">Counter-Move</span>
                  <p className="text-xs font-bold text-primary mt-1">
                    {d.label === 'Sleep Debt' ? "Implement a 20min Non-Sleep Deep Rest (NSDR) protocol." : 
                     d.label === 'Neural Fatigue' ? "Binary focus session: 45min deep work, 15min pitch black rest." : 
                     "Script a 'Polite No' for the next two invitations."}
                  </p>
                </div>
                <div className="absolute right-0 bottom-0 w-24 h-24 bg-primary/5 rounded-full blur-[40px]" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-card border-none rounded-xl flex items-center gap-4 text-text-main">
        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-warning">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold text-text-main uppercase tracking-widest mb-1">Clearance Protocol</p>
          <p className="text-xs text-text-muted">Requires 2 days of "Low Effort" budget to clear sleep debt.</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest rounded-lg">Apply Protocol</button>
      </div>
    </div>
  );
};
