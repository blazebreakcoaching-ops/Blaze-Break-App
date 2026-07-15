import { motion } from 'motion/react';
import { ShieldAlert, Battery, Waves, Zap, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface SHIPStage {
  id: 'Safety' | 'Habits' | 'Identity' | 'Purpose';
  label: string;
  icon: any;
  color: string;
  desc: string;
  tasks: string[];
}

const STAGES: SHIPStage[] = [
  { 
    id: 'Safety', 
    label: 'Safety', 
    icon: ShieldAlert, 
    color: 'amber', 
    desc: 'Emergency boundary setting and nervous system stabilization.',
    tasks: ['Set emergency "No" auto-responder', 'Identify 3 immediate drainers to delegating', 'Establish 8pm digital blackout']
  },
  { 
    id: 'Habits', 
    label: 'Habits', 
    icon: Battery, 
    color: 'rose', 
    desc: 'Deep physiological rest and replenishment.',
    tasks: ['15 mins mandatory daily boredom', 'Nervous system regulation exercise', 'Sleep debt reconciliation']
  },
  { 
    id: 'Identity', 
    label: 'Identity', 
    icon: Waves, 
    color: 'sky', 
    desc: 'Redesigning workflows to prevent relapse.',
    tasks: ['Energy-indexed task scheduling', 'Weekly boundary audit', 'Biophilic workspace update']
  },
  { 
    id: 'Purpose', 
    label: 'Purpose', 
    icon: Zap, 
    color: 'teal', 
    desc: 'Expanding ambition without sacrificing health.',
    tasks: ['Value-aligned mission planning', 'Sustainable growth metrics', 'Mentorship & teaching']
  }
];

export const ShipJourney = ({ currentStage }: { currentStage: SHIPStage['id'] }) => {
  const currentIndex = STAGES.findIndex(s => s.id === currentStage);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start gap-4">
        {STAGES.map((s, i) => {
          const isActive = i === currentIndex;
          const isCompleted = i < currentIndex;
          const colorClass = {
            amber: 'bg-warning',
            rose: 'bg-destructive',
            sky: 'bg-info',
            teal: 'bg-teal-500'
          }[s.color as 'amber' | 'rose' | 'sky' | 'teal'];

          return (
            <div key={s.id} className="flex-1 flex flex-col items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 relative",
                isActive ? `${colorClass} text-white shadow-xl scale-110 ring-4 ring-white` : 
                isCompleted ? "bg-teal-50 text-teal-600 border-2 border-teal-200" : 
                "bg-surface text-text-muted border-2 border-border"
              )}>
                {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <s.icon className="w-5 h-5" />}
                {isActive && (
                  <motion.div 
                    layoutId="pulse"
                    className={cn("absolute inset-0 rounded-full animate-ping opacity-20", colorClass)}
                  />
                )}
              </div>
              <div className="text-center">
                <span className={cn(
                  "text-xs uppercase tracking-widest font-black block",
                  isActive ? "text-text-main" : "text-text-muted"
                )}>
                  {s.label}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className="hidden md:block absolute left-0 w-full h-[2px] bg-surface dark:bg-card -z-10 top-6" />
              )}
            </div>
          );
        })}
      </div>

      <div className="card border-primary/10 bg-gradient-to-br from-white to-slate-50/50">
        <div className="flex items-center gap-4 mb-6">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg",
            {
              amber: 'bg-warning',
              rose: 'bg-destructive',
              sky: 'bg-info',
              teal: 'bg-teal-500'
            }[STAGES[currentIndex].color as 'amber' | 'rose' | 'sky' | 'teal']
          )}>
            {(() => {
              const Icon = STAGES[currentIndex].icon;
              return <Icon className="w-7 h-7" />;
            })()}
          </div>
          <div>
            <h3 className="text-2xl font-light text-text-main">Phase: {STAGES[currentIndex].label}</h3>
            <p className="text-sm text-text-muted italic mt-1">{STAGES[currentIndex].desc}</p>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Current Recovery Quests</h4>
          {STAGES[currentIndex].tasks.map((task, i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/20 transition-all cursor-pointer group">
              <div className="w-6 h-6 rounded-full border-2 border-border flex items-center justify-center group-hover:border-primary transition-colors">
                <div className="w-2 h-2 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <span className="text-sm font-medium text-text-muted">{task}</span>
              <ChevronRight className="w-4 h-4 text-text-muted ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
