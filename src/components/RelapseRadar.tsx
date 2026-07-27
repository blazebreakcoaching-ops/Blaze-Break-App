import { motion } from 'motion/react';
import { AlertCircle, TrendingUp, Sun, Moon, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

export const RelapseRadar = () => {
  const triggers = [
    { label: 'Sleep Quality', value: 45, status: 'Low', color: 'text-destructive' },
    { label: 'Caffeine Intake', value: 80, status: 'High', color: 'text-warning' },
    { label: 'Back-to-back Meetings', value: 95, status: 'Critical', color: 'text-rose-600' },
    { label: 'Exercise Frequency', value: 20, status: 'At Risk', color: 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <div className="card space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-light text-text-main">Relapse Radar</h3>
            <p className="text-xs text-text-muted uppercase tracking-widest font-black">7-Day Burnout Indicators</p>
          </div>
          <AlertCircle className="w-6 h-6 text-destructive animate-pulse" />
        </div>

        <div className="space-y-5">
          {triggers.map(t => (
            <div key={t.label} className="space-y-2">
              <div className="flex justify-between items-center text-xs uppercase tracking-widest font-black">
                <span className="text-text-muted">{t.label}</span>
                <span className={t.color}>{t.status}</span>
              </div>
              <div className="h-1.5 bg-surface dark:bg-card rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${t.value}%` }}
                  className={cn("h-full", t.color.replace('text-', 'bg-'))}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-rose-600">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs uppercase font-black tracking-widest">Early Warning</span>
          </div>
          <p className="text-sm text-text-muted italic">
            "Your weekend recovery was 30% lower than your weekday expenditure. This creates a 'Carryover Crash' cycle by Wednesday."
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5 bg-card border-none text-text-main overflow-hidden relative group">
          <div className="relative z-10 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary">
              <Sun className="w-4 h-4" />
              <span className="text-[11px] uppercase font-black tracking-widest">Circadian Peak</span>
            </div>
            <div className="text-2xl font-light">10:45 AM</div>
            <p className="text-xs text-text-muted italic">High Executive Peak</p>
          </div>
          <div className="absolute right-[-10%] bottom-[-10%] w-24 h-24 bg-primary/20 rounded-full blur-2xl group-hover:bg-primary/30 transition-colors" />
        </div>

        <div className="card p-5 bg-card border-none text-text-main overflow-hidden relative group">
          <div className="relative z-10 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-text-main">
              <Moon className="w-4 h-4" />
              <span className="text-[11px] uppercase font-black tracking-widest">Wind Down</span>
            </div>
            <div className="text-2xl font-light">08:30 PM</div>
            <p className="text-xs text-text-muted italic">Mandatory Shutdown</p>
          </div>
          <div className="absolute right-[-10%] bottom-[-10%] w-24 h-24 bg-text-main/20 rounded-full blur-2xl group-hover:bg-text-main/30 transition-colors" />
        </div>
      </div>
    </div>
  );
};
