import { motion } from 'motion/react';
import { AlertCircle, TrendingUp, Sun, Moon } from 'lucide-react';
import { cn } from '../lib/utils';

export const RelapseRadar = () => {
  const triggers = [
    { label: 'Sleep Quality', value: 45, status: 'Low', textColor: 'text-destructive dark:text-[#f87171]', barColor: 'bg-destructive' },
    { label: 'Caffeine Intake', value: 80, status: 'High', textColor: 'text-[#9a3412] dark:text-warning', barColor: 'bg-warning' },
    { label: 'Back-to-back Meetings', value: 95, status: 'Critical', textColor: 'text-destructive dark:text-[#f87171]', barColor: 'bg-destructive' },
    { label: 'Exercise Frequency', value: 20, status: 'At Risk', textColor: 'text-destructive dark:text-[#f87171]', barColor: 'bg-destructive' },
  ];

  return (
    <div className="space-y-6">
      <div className="card space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-light text-text-main">Relapse Radar</h3>
            <p className="text-xs text-text-muted uppercase tracking-widest font-black">Sample: illustrative 7-Day Indicators</p>
          </div>
          <AlertCircle className="w-6 h-6 text-destructive animate-pulse" aria-hidden="true" />
        </div>
        <p className="text-xs text-text-muted -mt-4">Live tracking of your actual sleep, caffeine, meetings, and exercise isn't built yet — the numbers below are an example of what this view will show.</p>

        <div className="space-y-5">
          {triggers.map(t => (
            <div key={t.label} className="space-y-2">
              <div className="flex justify-between items-center text-xs uppercase tracking-widest font-black">
                <span className="text-text-muted">{t.label}</span>
                <span className={t.textColor}>{t.status}</span>
              </div>
              <div className="h-1.5 bg-surface dark:bg-card rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${t.value}%` }}
                  className={cn("h-full", t.barColor)}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-[#b91c1c]">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs uppercase font-black tracking-widest">Early Warning</span>
          </div>
          <p className="text-sm text-text-muted italic">
            Example: "Your weekend recovery was 30% lower than your weekday expenditure. This creates a 'Carryover Crash' cycle by Wednesday."
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5 bg-card border-none text-text-main overflow-hidden relative group">
          <div className="relative z-10 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[#9a3412] dark:text-primary">
              <Sun className="w-4 h-4" />
              <span className="text-[11px] uppercase font-black tracking-widest">Circadian Peak</span>
            </div>
            <div className="text-2xl font-light">10:45 AM</div>
            <p className="text-xs text-text-muted italic">High Executive Peak</p>
          </div>
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
                  </div>
      </div>
    </div>
  );
};
