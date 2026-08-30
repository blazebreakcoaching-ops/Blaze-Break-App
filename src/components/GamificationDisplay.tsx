import { motion } from 'motion/react';
import { Trophy, Zap, Star, Award, Sparkles } from 'lucide-react';
import { UserStats, BADGES, BurnoutFingerprint } from '../types';
import * as LucideIcons from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';

interface GamificationDisplayProps {
  stats: UserStats;
  fingerprint?: BurnoutFingerprint | null;
  shipStage?: string;
  pulseHistory?: { date: string; score: number }[];
}

export const GamificationDisplay = ({ stats, fingerprint, shipStage = 'Safety', pulseHistory = [] }: GamificationDisplayProps) => {
  const Icon = (name: string) => {
    const LucideIcon = (LucideIcons as any)[name];
    return LucideIcon ? <LucideIcon className="w-4 h-4" /> : <Star className="w-4 h-4" />;
  };

  const lastSeven = (pulseHistory || []).slice(-7);
  const chartData = lastSeven.map(entry => ({
    day: entry.date,
    score: entry.score
  }));

  // "Engagement Rhythm" shows day-over-day volatility of the recovery score, not the
  // same absolute values as the chart above — otherwise the two charts would be showing
  // identical numbers under different labels.
  const volatilityData = lastSeven.map((entry, i) => {
    const prev = i > 0 ? lastSeven[i - 1].score : entry.score;
    return {
      day: entry.date,
      delta: Math.round(entry.score - prev),
    };
  });

  const renderTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card p-3 rounded-xl shadow-md border border-border">
          <p className="text-xs font-black uppercase tracking-widest text-text-muted mb-1">{label}</p>
          <div className="flex flex-col gap-1">
            {payload.map((entry: any, index: number) => (
              <p key={index} className="text-xs font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}: {entry.value}
              </p>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8">
      {/* Nova Insight Panel */}
      <div className="card border border-primary/20 bg-primary/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-display font-bold text-text-main tracking-tight">Nova's Weekly Summary</h3>
              <p className="text-[11px] uppercase tracking-[0.2em] font-black text-[#9a3412] dark:text-primary">Biometric & Behavioral Review</p>
            </div>
          </div>
          <div className="tag text-[11px] bg-white/5 border border-white/10 text-text-muted shrink-0 w-fit">
            Status: {stats.streak < 3 ? 'Learning Profile' : 'Pattern Forming'}
          </div>
        </div>
        <p className="text-sm text-text-main leading-relaxed font-medium">
          {stats.streak < 1 
            ? "Welcome. Nova is ready to learn what genuinely supports your recovery. Complete your first check-in to begin tracking patterns."
            : stats.streak < 3
              ? "Today's snapshot is based on your recent check-ins. Patterns appear over time, not from one day. Keep checking in."
              : fingerprint 
                ? `"Based on your ${fingerprint.profile || 'High Achiever'} profile, your energy recovery is currently stabilizing. An early pattern is forming across your ${stats.streak} day streak. Keep checking in to improve accuracy."`
                : `"Your engagement streak stands at ${stats.streak} days, with ${stats.points} points accumulated. Run your Burnout Fingerprint diagnostic to receive personalized baseline recommendations."`}
        </p>
      </div>

      {/* Overall Recovery Progress & Journey Map */}
      <div className="card bg-surface dark:bg-card border border-border p-6 space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-2">Overall Recovery Progress</h3>
          <p className="text-xs text-text-muted">Your points and active recovery stage on the SHIP Pathway.</p>
        </div>

        {/* Level & Points Progress Bar */}
        <div className="bg-white dark:bg-card/40 border border-border/80 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-[#9a3412] dark:text-primary flex items-center justify-center font-black text-sm">
                Lvl {Math.floor(stats.points / 500) + 1}
              </div>
              <div>
                <h4 className="font-bold text-text-main text-sm">
                  {Math.floor(stats.points / 500) + 1 >= 5 ? 'Zen Master' : Math.floor(stats.points / 500) + 1 >= 3 ? 'Resilient Healer' : 'Initiate Practitioner'}
                </h4>
                <p className="text-[10px] text-text-muted uppercase tracking-wider">Overall Level</p>
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-text-main">{stats.points} Total Point{stats.points !== 1 ? 's' : ''}</span>
              <p className="text-[10px] text-text-muted">Next Level in {(500 - (stats.points % 500)) % 500} pts</p>
            </div>
          </div>

          <div className="relative w-full h-3 bg-surface dark:bg-surface rounded-full overflow-hidden">
            <motion.div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${((stats.points % 500) / 500) * 100}%` }}
              transition={{ type: "spring", stiffness: 45, damping: 14, delay: 0.1 }}
            />
          </div>
        </div>

        {/* SHIP Stage Journey Map */}
        <div className="space-y-4 pt-2">
          <h4 className="text-xs font-black uppercase tracking-widest text-text-muted mb-4">SHIP Pathway Milestone Map</h4>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
            {[
              { id: 'Safety', label: '1. Safety', desc: 'Crisis Safety & Control', icon: 'ShieldAlert', reward: 'Baseline Setup' },
              { id: 'Habits', label: '2. Habits', desc: 'Nervous System Repair', icon: 'Battery', reward: 'Energy Budget' },
              { id: 'Identity', label: '3. Identity', desc: 'Boundary Scripting', icon: 'Waves', reward: 'Interventions' },
              { id: 'Purpose', label: '4. Purpose', desc: 'Career & Alignment', icon: 'Zap', reward: 'Future Simulator' }
            ].map((stageItem) => {
              const stagesOrder = ['Safety', 'Habits', 'Identity', 'Purpose'];
              const currentIdx = stagesOrder.indexOf(shipStage);
              const itemIdx = stagesOrder.indexOf(stageItem.id);
              
              const isCompleted = itemIdx < currentIdx;
              const isActive = itemIdx === currentIdx;

              return (
                <div 
                  key={stageItem.id}
                  className={`relative p-4 rounded-xl border transition-all ${
                    isActive 
                      ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary/10' 
                      : isCompleted 
                        ? 'bg-success/5 border-success/30' 
                        : 'bg-surface/50 dark:bg-surface/30 border-border/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] uppercase tracking-widest font-black ${
                      isActive 
                        ? 'text-[#9a3412] dark:text-primary' 
                        : isCompleted 
                          ? 'text-success dark:text-[#4ade80]' 
                          : 'text-text-muted'
                    }`}>
                      {stageItem.label}
                    </span>
                    <div className={`p-1 rounded-md ${
                      isActive 
                        ? 'bg-primary text-primary-foreground' 
                        : isCompleted 
                          ? 'bg-success text-white' 
                          : 'bg-surface dark:bg-surface text-text-muted'
                    }`}>
                      {isCompleted ? (
                        <LucideIcons.Check className="w-3 h-3 stroke-[3px]" />
                      ) : (
                        Icon(stageItem.icon)
                      )}
                    </div>
                  </div>
                  <h5 className="font-bold text-xs text-text-main mb-1">{stageItem.desc}</h5>
                  <p className="text-[10px] text-text-muted leading-snug">{stageItem.reward}</p>
                  
                  {isActive && (
                    <span className="absolute -top-1.5 right-2 bg-primary text-primary-foreground text-[8px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded-full shadow">
                      Current Stage
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Points History Chart */}
        <div className="card border-border dark:border-border bg-surface dark:bg-card/50 p-6 flex flex-col justify-between min-h-[340px]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-warning/10 text-[#9a3412] dark:text-warning rounded-xl flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="font-display font-bold text-text-main text-sm">Energy Tracking</h3>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">7-Day Recovery Score Trend</p>
            </div>
          </div>
          {stats.streak < 3 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
              <p className="text-xs text-text-muted font-medium max-w-xs">
                Chart reveals itself once a 3-day pattern is established.
              </p>
            </div>
          ) : (
            <div className="h-56 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorScoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip content={renderTooltip} />
                  <Area type="monotone" dataKey="score" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorScoreGrad)" name="Recovery Score" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Streak History Chart */}
        <div className="card border-border dark:border-border bg-surface dark:bg-card/50 p-6 flex flex-col justify-between min-h-[340px]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h3 className="font-display font-bold text-text-main text-sm">Engagement Rhythm</h3>
              <p className="text-[10px] text-text-muted uppercase tracking-wider">Day-over-Day Score Movement</p>
            </div>
          </div>
          {stats.streak < 3 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
              <p className="text-xs text-text-muted font-medium max-w-xs">
                Complete more check-ins to unlock rhythm visualizations.
              </p>
            </div>
          ) : (
            <div className="h-56 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volatilityData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={renderTooltip} />
                  <Bar dataKey="delta" fill="#6366f1" radius={[4, 4, 0, 0]} name="Score Change" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Badges Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider">Milestones & Badges</h3>
          <span className="text-xs font-bold text-[#9a3412] dark:text-primary uppercase tracking-widest bg-primary/5 px-2 py-0.5 rounded">
            {stats.unlockedBadges.length} / {BADGES.length} Unlocked
          </span>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {BADGES.map(badge => {
            const isUnlocked = stats.unlockedBadges.includes(badge.id);
            
            // Calculate progress for specific badges
            let progress = isUnlocked ? 100 : 0;
            if (!isUnlocked) {
               if (badge.id === 'point_1000') progress = (stats.points / 1000) * 100;
               if (badge.id === 'master_healer') progress = (stats.points / 2500) * 100;
               if (badge.id === 'consistency_3') progress = (stats.streak / 3) * 100;
               if (badge.id === 'consistency_7') progress = (stats.streak / 7) * 100;
               if (badge.id === 'boundary_set') progress = (stats.rehearsalCount / 5) * 100;
               if (badge.id === 'boundary_boss') progress = (stats.rehearsalCount / 10) * 100;
               if (badge.id === 'consistent_sleep') {
                 const sleepDebt = stats.debts?.find(d => d.label === 'Sleep Debt')?.value ?? 8;
                 progress = sleepDebt <= 4 ? 100 : Math.max(0, ((15 - sleepDebt) / 11) * 100);
               }
               if (badge.id === 'master_boundaries') progress = (stats.rehearsalCount / 15) * 100;
            }
            progress = Math.min(Math.max(progress, 0), 100);

            return (
              <motion.div
                key={badge.id}
                whileHover={{ y: -4, scale: 1.02 }}
                className={`flex flex-col items-center text-center p-4 rounded-2xl border transition-all relative group overflow-hidden ${
                  isUnlocked 
                    ? 'bg-white dark:bg-card border-primary shadow-lg shadow-primary/5' 
                    : 'bg-surface dark:bg-surface/50 border-border opacity-60'
                }`}
              >
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-all ${
                  isUnlocked 
                    ? 'bg-primary text-primary-foreground rotate-0' 
                    : 'bg-border dark:bg-surface text-text-muted rotate-3'
                }`}>
                  {Icon(badge.icon)}
                </div>
                <h4 className="text-xs font-black uppercase tracking-tight text-text-main leading-tight mb-1">{badge.name}</h4>
                <p className="text-[10px] text-text-muted leading-tight px-1 mb-3">{badge.description}</p>
                
                {/* Progress Bar for Locked */}
                {!isUnlocked && (
                  <div className="w-full h-1 bg-border dark:bg-surface rounded-full overflow-hidden mt-auto">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: "spring", stiffness: 60, damping: 12, delay: 0.1 }}
                      className="h-full bg-primary/40"
                    />
                  </div>
                )}

                {isUnlocked && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1"
                  >
                    <div className="bg-teal-500 text-[#1c1917] p-1 rounded-full shadow-lg">
                      <LucideIcons.Check className="w-2 h-2 stroke-[4px]" />
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Rewards Card (Placeholder style) */}
      <div className="card bg-surface dark:bg-card border-dashed flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white dark:bg-card border border-border rounded-xl flex items-center justify-center text-text-muted">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-text-main">Next Milestone</h4>
            <p className="text-xs text-text-muted italic">"Recovery Alchemist" — Earn {(500 - (stats.points % 500)) % 500} more points</p>
          </div>
        </div>
        <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-primary rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((stats.points % 500) / 500) * 100}%` }}
            transition={{ type: "spring", stiffness: 45, damping: 14, delay: 0.2 }}
          />
        </div>
      </div>
    </div>
  );
};
