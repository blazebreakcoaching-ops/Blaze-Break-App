import { auth } from '../lib/firebase';
import { ConnectedEnergyBudget } from './ConnectedRecoveryModules.tsx';
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, ShieldAlert, CheckCircle2, TrendingDown, Crosshair, ArrowRight, Activity, ArchiveX, BatteryWarning, BatteryCharging, Network } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';

interface Commitment {
  id: string;
  name: string;
  energyDrain: number; // 0-100
  type: 'professional' | 'social' | 'emotional' | 'logistical';
  status: 'active' | 'dropped' | 'delegated' | 'restructured';
}

export const EnergyBudgetMatrix = ({ onPointsEarned }: { onPointsEarned: (pts: number, reason: string) => void }) => {
  const [commitments, setCommitments] = useState<Commitment[]>([
    { id: '1', name: 'Weekly sync with marketing', energyDrain: 45, type: 'professional', status: 'active' },
    { id: '2', name: 'Managing team conflict', energyDrain: 80, type: 'emotional', status: 'active' },
    { id: '3', name: 'Hosting dinner for in-laws', energyDrain: 60, type: 'social', status: 'active' },
    { id: '4', name: 'Writing Q3 Report', energyDrain: 70, type: 'professional', status: 'active' },
  ]);

  const [input, setInput] = useState('');
  const [drainSlider, setDrainSlider] = useState(50);
  const [selectedType, setSelectedType] = useState<Commitment['type']>('professional');

  if (auth.currentUser) return <ConnectedEnergyBudget />;

  const addCommitment = () => {
    if (!input.trim()) return;
    setCommitments([
      ...commitments,
      {
        id: Date.now().toString(),
        name: input,
        energyDrain: drainSlider,
        type: selectedType,
        status: 'active'
      }
    ]);
    setInput('');
    setDrainSlider(50);
  };

  const handleAction = (id: string, action: Commitment['status']) => {
    setCommitments(prev => prev.map(c => {
      if (c.id === id) {
        onPointsEarned(action === 'dropped' ? 20 : 10, `Energy ${action}: ${c.name}`);
        return { ...c, status: action };
      }
      return c;
    }));
  };

  const activeTotal = commitments.filter(c => c.status === 'active').reduce((sum, c) => sum + c.energyDrain, 0);
  const recoveredTotal = commitments.filter(c => c.status !== 'active').reduce((sum, c) => sum + c.energyDrain, 0);
  const maxCapacity = 200; // Arbitrary limit for visual

  const overloadPercentage = (activeTotal / maxCapacity) * 100;
  const isOverloaded = overloadPercentage > 85;

  const velocityData = useMemo(() => Array.from({ length: 7 }).map((_, i) => {
    const daysAgo = 6 - i;
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return {
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      drain: 120 + Math.floor(Math.random() * 80) + (i * -10),
      completed: 40 + Math.floor(Math.random() * 60) + (i * 15)
    };
  }), []);

  return (
    <div className="space-y-12 pb-24 font-sans max-w-[1400px] mx-auto">
      {/* Executive Header */}
      <div className="relative overflow-hidden rounded-xl bg-background border border-border p-6 sm:p-8 md:p-10">
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="flex items-center gap-4">
             <div className="w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
               <BatteryCharging className="w-7 h-7" />
             </div>
             <div>
                <h2 className="text-3xl lg:text-4xl font-display font-bold text-text-main tracking-tight">Energy Delta Management</h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5"><Network className="w-3 h-3" /> Core Pillar: Rebuild</span>
                </div>
             </div>
          </div>
          <p className="text-sm lg:text-base text-text-muted leading-relaxed font-serif italic max-w-2xl border-l-[3px] border-primary/30 pl-5 py-1">
            "Burnout isn't just working too much — it's taking on more commitments than your actual energy can fund. Find where the gap is, and start closing it."
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Input & Capacity Gauge */}
        <div className="lg:col-span-4 space-y-8">
          <div className="card bg-card border border-border p-8 space-y-8 relative overflow-hidden group/gauge">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted flex items-center justify-between">
              <span>Energy Capacity</span>
              <Activity className="w-4 h-4 text-text-muted" />
            </h4>
            
            <div className="relative h-56 flex items-center justify-center">
              <svg className="w-48 h-48 transform -rotate-90">
                <circle cx="96" cy="96" r="80" fill="none" className="stroke-border" strokeWidth="12" />
                <motion.circle
                  cx="96" cy="96" r="80" fill="none"
                  className={cn("transition-colors duration-700 shadow-glow", isOverloaded ? 'stroke-destructive' : 'stroke-primary')}  
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray="502.6"
                  animate={{ strokeDashoffset: 502.6 - (502.6 * Math.min(100, overloadPercentage)) / 100 }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className={cn("text-4xl font-black font-display tracking-tighter drop-shadow-lg", isOverloaded ? 'text-destructive' : 'text-text-main')}>
                   {Math.round(overloadPercentage)}%
                </span>
                <span className="text-xs font-black uppercase tracking-widest text-text-muted mt-1">Load</span>
              </div>
            </div>

            {isOverloaded && (
              <div className="bg-destructive/10 rounded-2xl p-5 border border-destructive/20 flex items-start gap-4 shadow-inner">
                <BatteryWarning className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-destructive">System Critical</p>
                  <p className="text-xs font-semibold text-rose-200/80 leading-relaxed">Deficit-spending detected. Auto-recovery blocked. Shed load immediately.</p>
                </div>
              </div>
            )}
          </div>

          <div className="card bg-background border-white/[0.05] p-8 space-y-6 shadow-xl">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted border-b border-white/5 pb-4">Log a Stressor</h4>
            
            <div className="space-y-6">
               <div className="space-y-2">
                 <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Stressor Identifier</label>
                 <input
                   type="text"
                   value={input}
                   onChange={(e) => setInput(e.target.value)}
                   placeholder="e.g. Hostile code review..."
                   className="w-full bg-surface border border-white/10 rounded-xl px-4 py-4 text-sm text-text-main placeholder:text-text-muted focus:ring-1 focus:ring-primary/50 focus:border-primary outline-none transition-all font-mono"
                 />
               </div>
              
              <div className="space-y-4 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex justify-between text-xs font-black text-text-muted uppercase tracking-widest">
                  <span>Energy Drain Coefficient</span>
                  <span className="text-primary px-2 py-0.5 bg-primary/10 rounded">{drainSlider}</span>
                </div>
                <input 
                  type="range" min="10" max="100" step="5"
                  value={drainSlider} onChange={(e) => setDrainSlider(Number(e.target.value))}
                  className="w-full h-1.5 bg-card rounded-lg appearance-none cursor-pointer accent-primary transition-all"
                />
              </div>

              <div className="space-y-3">
                 <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Category</label>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                   {(['professional', 'emotional', 'social', 'logistical'] as const).map(type => (
                     <button
                       key={type}
                       onClick={() => setSelectedType(type)}
                       className={cn(
                         "text-[11px] font-black uppercase tracking-widest py-3 px-3 rounded-xl border transition-all",
                         selectedType === type ? "bg-primary/20 border-primary/50 text-primary shadow-inner" : "bg-card border-border text-text-muted hover:border-border"
                       )}
                     >
                       {type}
                     </button>
                   ))}
                 </div>
              </div>

              <button
                onClick={addCommitment}
                disabled={!input.trim()}
                className="w-full bg-surface dark:bg-card text-text-main py-4 rounded-xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-[0.2em] disabled: hover:bg-border transition-colors shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                <Crosshair className="w-4 h-4" /> Inject into Audit
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Board */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Workload Velocity Chart Dashboard */}
          <div className="card bg-background p-8 border border-border space-y-6 text-text-main relative overflow-hidden">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted flex items-center justify-between">
              <span>7-Day Biometric Workload Velocity</span>
              <Activity className="w-4 h-4 text-text-muted" />
            </h4>
            <div className="h-56 w-full font-mono text-xs">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={velocityData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorDrain" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="day" stroke="#475569" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#475569" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px' }}
                    itemStyle={{ fontWeight: 'bold' }}
                    labelStyle={{ color: '#64748b', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                  />
                  <Area type="monotone" dataKey="drain" name="Energy Output" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorDrain)" />
                  <Area type="monotone" dataKey="completed" name="Recovery Input" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorCompleted)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-card border border-border rounded-2xl p-8 relative overflow-hidden group shadow-lg">
               <p className="text-xs font-black text-text-muted uppercase tracking-widest mb-3">Gross Energy Expenditure</p>
               <h3 className="text-5xl font-display font-black text-text-main tracking-tighter">{activeTotal.toLocaleString()} <span className="text-xl text-text-muted font-medium tracking-normal">units</span></h3>
             </div>
             
             <div className="bg-primary-dark/30 border border-primary/20 rounded-2xl p-8 relative overflow-hidden group shadow-lg">
               <p className="text-xs font-black text-primary/80 uppercase tracking-widest mb-3">Recovered Bandwidth</p>
               <h3 className="text-5xl font-display font-black text-primary tracking-tighter">+{recoveredTotal.toLocaleString()} <span className="text-xl text-primary font-medium tracking-normal">saved</span></h3>
             </div>
          </div>

          <div className="card bg-card border border-border p-8 flex-1 space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">Live Audit Ledger</h4>
              <span className="text-xs font-mono text-text-muted bg-card px-3 py-1 rounded">{commitments.filter(c => c.status === 'active').length} Nodes</span>
            </div>
            
            <div className="space-y-4">
              <AnimatePresence>
                {commitments.filter(c => c.status === 'active').map(commitment => (
                  <motion.div
                    key={commitment.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-5 rounded-2xl border border-white/[0.05] bg-background/50 hover:bg-background hover:border-primary/30 transition-all group shadow-sm"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center shrink-0 shadow-inner group-hover:border-primary/30 transition-colors">
                        <span className="text-sm font-mono font-bold text-text-muted">{commitment.energyDrain}</span>
                      </div>
                      <div>
                        <h5 className="font-bold text-text-main tracking-tight">{commitment.name}</h5>
                        <div className="flex items-center gap-2 mt-1.5">
                           <span className="text-[11px] uppercase tracking-widest text-text-muted font-black">{commitment.type}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleAction(commitment.id, 'delegated')} className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary/20 hover:text-blue-300 transition-colors border border-primary/20">
                        Delegate
                      </button>
                      <button onClick={() => handleAction(commitment.id, 'restructured')} className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary transition-colors border border-primary/20">
                        Boundary
                      </button>
                      <button onClick={() => handleAction(commitment.id, 'dropped')} className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-rose-300 transition-colors border border-destructive/20 flex items-center gap-1.5">
                        <ArchiveX className="w-3.5 h-3.5" /> Drop
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {commitments.filter(c => c.status === 'active').length === 0 && (
                <div className="py-16 text-center text-text-muted bg-surface rounded-xl border border-border">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <p className="font-medium text-sm">Nothing pending — you're all caught up.</p>
                </div>
              )}
            </div>

            {/* Resolved Section */}
            {recoveredTotal > 0 && (
              <div className="pt-8 mt-8 border-t border-white/[0.05]">
                <h4 className="text-xs font-black uppercase tracking-[0.2em] text-text-muted mb-5 flex items-center gap-2">
                  <TrendingDown className="w-3.5 h-3.5 text-success" /> Shed Load Archive ({commitments.filter(c => c.status !== 'active').length})
                </h4>
                <div className="flex flex-wrap gap-3">
                  {commitments.filter(c => c.status !== 'active').map(c => (
                    <motion.div 
                      key={c.id} 
                      layout 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="px-3.5 py-2 rounded-lg bg-background border border-white/5 text-xs font-bold text-text-muted flex items-center gap-3 shadow-inner"
                    >
                      <span className="line-through opacity-70">{c.name}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest font-black",
                        c.status === 'dropped' ? 'bg-destructive/20 text-destructive' :
                        c.status === 'delegated' ? 'bg-primary/20 text-primary' :
                        'bg-primary/20 text-primary'
                      )}>{c.status}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
