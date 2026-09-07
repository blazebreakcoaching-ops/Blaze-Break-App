import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import {
  Heart,
  TrendingUp,
  AlertTriangle,
  Activity,
  Info,
  Calendar,
  Sparkles,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { secureApiFetch } from '../lib/secure-api';

interface DayData {
  date: string;
  energyOutput: number;
  recoveryInput: number;
  balance: number;
  notes: string;
}

// Derives the diagnostic annotation from a real day's balance - the numbers
// themselves now come from the person's own logged activity via
// /api/recovery/velocity-map, not a generated sine/cosine curve.
const annotateDay = (energyOutput: number, recoveryInput: number): DayData => {
  const balance = recoveryInput - energyOutput;
  let notes = "Steady state dynamic.";
  if (balance < -15) {
    notes = "High Output Deficit.";
  } else if (balance > 15) {
    notes = "Active Restoration.";
  } else if (balance < 0) {
    notes = "High Pressure Right Now.";
  }
  return { date: '', energyOutput, recoveryInput, balance, notes };
};

// Custom high-contrast tooltip conforming to premium dark palette
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload as DayData;
    const isDeficit = dataPoint.balance < 0;

    return (
      <div className="bg-card/95 border border-border/80 p-4 rounded-xl shadow-2xl backdrop-blur-md max-w-xs space-y-3 font-sans transition-colors duration-500 text-text-main">
        <div className="flex items-center gap-1.5 text-xs text-text-muted font-bold font-mono">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          {dataPoint.date}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between items-center gap-6">
            <span className="text-text-muted flex items-center gap-1">
              <Activity className="w-3 h-3 text-primary" /> Energy Output
            </span>
            <span className="font-mono font-black text-[#9a3412] dark:text-primary">
              {dataPoint.energyOutput}%
            </span>
          </div>

          <div className="flex justify-between items-center gap-6">
            <span className="text-text-muted flex items-center gap-1">
              <Heart className="w-3 h-3 text-success dark:text-[#4ade80]" /> Recovery Input
            </span>
            <span className="font-mono font-black text-success dark:text-[#4ade80]">
              {dataPoint.recoveryInput}%
            </span>
          </div>
        </div>

        <div className="h-px bg-border/40 my-1" />

        <div className="flex justify-between items-center text-xs">
          <span className="font-bold text-text-muted uppercase tracking-wider text-[10px]">
            Velocity Balance
          </span>
          <span className={cn(
            "font-mono font-black px-1.5 py-0.5 rounded",
            isDeficit
              ? "bg-destructive/10 text-destructive dark:text-[#f87171]"
              : "bg-success/10 text-success dark:text-[#4ade80]"
          )}>
            {isDeficit ? "" : "+"}{dataPoint.balance}% {isDeficit ? "Deficit" : "Surplus"}
          </span>
        </div>

        <p className="text-[10px] text-text-muted italic leading-snug font-serif pr-1">
          "{dataPoint.notes}"
        </p>
      </div>
    );
  }
  return null;
};

export const RecoveryVelocityMap = () => {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasAnyData, setHasAnyData] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'recovery' | 'energy'>('all');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await secureApiFetch('/api/recovery/velocity-map');
        if (res.ok) {
          const json = await res.json();
          const mapped: DayData[] = (json.days || []).map((d: any) => ({
            ...annotateDay(d.energyOutput ?? 0, d.recoveryInput ?? 0),
            date: d.date,
          }));
          setData(mapped);
          setHasAnyData(!!json.hasAnyData);
        }
      } catch (e) {
        // Leaves data empty - the honest "not enough logged yet" state below.
      }
      setLoading(false);
    };
    load();
  }, []);

  // Only days with genuinely logged activity count toward these averages -
  // a day with no real signal isn't a "0", it's simply unknown.
  const daysWithData = data.filter(d => d.energyOutput > 0 || d.recoveryInput > 0);
  const averageEnergy = daysWithData.length > 0 ? Math.round(daysWithData.reduce((acc, curr) => acc + curr.energyOutput, 0) / daysWithData.length) : 0;
  const averageRecovery = daysWithData.length > 0 ? Math.round(daysWithData.reduce((acc, curr) => acc + curr.recoveryInput, 0) / daysWithData.length) : 0;
  const deficitDays = daysWithData.filter(d => d.balance < 0).length;
  const netVelocityBalance = averageRecovery - averageEnergy;

  // Analytical coaching suggestions from Nova based on computed results
  const getNovaDirectComment = () => {
    if (daysWithData.length < 5) {
      return {
        text: "Not enough activity logged yet to spot a real pattern here. Keep using the app's recovery tools and daily check-ins, and this will start reflecting your actual rhythm.",
        alert: false,
        action: "Log a check-in or complete a recovery tool to start building this picture."
      };
    } else if (netVelocityBalance < -5) {
      return {
        text: "Your neural fuel reserves are leaking. Your cumulative energy output rate is consistently outrunning autonomic regulation inputs. This is not a sustainable operational pace — you are borrowing against next month's cognitive baseline. Patch this leak now.",
        alert: true,
        action: "Schedule a 10-minute micro-somatic break before 3 PM today."
      };
    } else if (deficitDays > 12) {
      return {
        text: `You have triggered ${deficitDays} output deficits this cycle. While weekend restoration exists, somatic recovery is episodic rather than continuous. Continuous tactical load demands continuous neural resets. Adapt your workflow before relapse.`,
        alert: true,
        action: "Try the 'One Less Thing' worksheet to renegotiate one tomorrow's meeting."
      };
    } else {
      return {
        text: "You're in a steady, sustainable rhythm right now. Keep doing what's working — small consistent habits build real momentum over time.",
        alert: false,
        action: "Maintain current streak of micro-somatic resets."
      };
    }
  };

  const novaCommentary = getNovaDirectComment();

  return (
    <div className="space-y-6 font-sans text-text-main transition-colors duration-500">
      {/* Header and Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">30-Day Recovery Velocity Map</h3>
            <p className="text-xs uppercase font-black tracking-widest text-text-muted">
              Correlation Matrix of Structural Load vs Restoration Adaptive Inputs
            </p>
          </div>
        </div>

        {/* Dynamic Buttons to Toggle Map Modes */}
        <div className="flex items-center bg-surface/50 dark:bg-card/40 border border-border/80 rounded-xl p-1 gap-1 self-start md:self-center">
          <button
            onClick={() => setViewMode('all')}
            aria-pressed={viewMode === 'all'}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
              viewMode === 'all' 
                ? "bg-primary text-primary-foreground shadow" 
                : "text-text-muted hover:text-text-main hover:bg-surface/20"
            )}
          >
            Dual View
          </button>
          <button
            onClick={() => setViewMode('recovery')}
            aria-pressed={viewMode === 'recovery'}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
              viewMode === 'recovery' 
                ? "bg-success text-white shadow" 
                : "text-text-muted hover:text-success dark:hover:text-[#4ade80] hover:bg-success/5"
            )}
          >
            Recovery Input
          </button>
          <button
            onClick={() => setViewMode('energy')}
            aria-pressed={viewMode === 'energy'}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
              viewMode === 'energy' 
                ? "bg-primary text-primary-foreground shadow" 
                : "text-text-muted hover:text-[#9a3412] dark:hover:text-primary hover:bg-primary/5"
            )}
          >
            Energy Output
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !hasAnyData ? (
        <div className="py-16 text-center border-2 border-dashed border-border rounded-2xl space-y-2">
          <TrendingUp className="w-8 h-8 mx-auto text-text-muted opacity-30" />
          <p className="text-text-muted text-sm font-medium max-w-sm mx-auto">Nothing logged yet. Use energy budgets, focus sessions, check-ins, or wins, and this will start reflecting your real trend.</p>
        </div>
      ) : (
      <>
      {/* Primary Analytics Summary Band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface/30 dark:bg-card/20 border border-border/40 p-4 rounded-2xl transition-all hover:border-border duration-500">
          <span className="text-[10px] font-black uppercase text-text-muted tracking-widest block mb-1">
            Average Energy Output
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-[#9a3412] dark:text-primary font-mono">
              {averageEnergy}%
            </span>
            <span className="text-[10px] text-text-muted">Load</span>
          </div>
        </div>

        <div className="bg-surface/30 dark:bg-card/20 border border-border/40 p-4 rounded-2xl transition-all hover:border-border duration-500">
          <span className="text-[10px] font-black uppercase text-text-muted tracking-widest block mb-1">
            Average Recovery Input
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-success dark:text-[#4ade80] font-mono">
              {averageRecovery}%
            </span>
            <span className="text-[10px] text-text-muted">Reset</span>
          </div>
        </div>

        <div className="bg-surface/30 dark:bg-card/20 border border-border/40 p-4 rounded-2xl transition-all hover:border-border duration-500">
          <span className="text-[10px] font-black uppercase text-text-muted tracking-widest block mb-1">
            Net Deficit Cycles
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className={cn(
              "text-2xl font-black font-mono",
              deficitDays > 10 ? "text-destructive dark:text-[#f87171]" : "text-[#9a3412] dark:text-warning"
            )}>
              {deficitDays}
            </span>
            <span className="text-[10px] text-text-muted">Days</span>
          </div>
        </div>

        <div className="bg-surface/30 dark:bg-card/20 border border-border/40 p-4 rounded-2xl transition-all hover:border-border duration-500">
          <span className="text-[10px] font-black uppercase text-text-muted tracking-widest block mb-1">
            Net Velocity Buffer
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className={cn(
              "text-2xl font-black font-mono",
              netVelocityBalance >= 0 ? "text-success dark:text-[#4ade80]" : "text-destructive dark:text-[#f87171]"
            )}>
              {netVelocityBalance >= 0 ? "+" : ""}{netVelocityBalance}%
            </span>
            <span className="text-[10px] text-text-muted">Balance</span>
          </div>
        </div>
      </div>

      {/* The Map Chart Visualization */}
      <div className="h-64 sm:h-72 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="velocityEnergy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="velocityRecovery" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.25} />
            <XAxis 
              dataKey="date" 
              tick={{ fill: '#64748b', fontSize: 10 }} 
              axisLine={false} 
              tickLine={false} 
              minTickGap={25} 
            />
            <YAxis 
              tick={{ fill: '#64748b', fontSize: 10 }} 
              axisLine={false} 
              tickLine={false} 
              domain={[10, 100]} 
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Energy Area and Line */}
            {(viewMode === 'all' || viewMode === 'energy') && (
              <Area 
                type="monotone" 
                dataKey="energyOutput" 
                stroke="transparent" 
                fill="url(#velocityEnergy)" 
              />
            )}
            
            {/* Recovery Area and Line */}
            {(viewMode === 'all' || viewMode === 'recovery') && (
              <Area 
                type="monotone" 
                dataKey="recoveryInput" 
                stroke="transparent" 
                fill="url(#velocityRecovery)" 
              />
            )}

            {/* Main paths */}
            {(viewMode === 'all' || viewMode === 'energy') && (
              <Line 
                type="monotone" 
                dataKey="energyOutput" 
                stroke="#6366f1" 
                strokeWidth={2.5} 
                dot={false}
                activeDot={{ r: 5 }}
              />
            )}
            
            {(viewMode === 'all' || viewMode === 'recovery') && (
              <Line 
                type="monotone" 
                dataKey="recoveryInput" 
                stroke="#10b981" 
                strokeWidth={2.5} 
                dot={false}
                activeDot={{ r: 5 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      </>
      )}

      {/* Nova Coaching Diagnostics Panel */}
      <div className={cn(
        "p-5 rounded-2xl border flex flex-col sm:flex-row items-start gap-4 transition-colors duration-500",
        novaCommentary.alert 
          ? "bg-warning/5 dark:bg-warning/5 border-warning/20" 
          : "bg-success/5 border-success/10"
      )}>
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
          novaCommentary.alert 
            ? "bg-warning/10 text-[#9a3412] dark:text-warning border-warning/10 animate-pulse" 
            : "bg-success/10 text-success dark:text-[#4ade80] border-success/10"
        )}>
          {novaCommentary.alert ? (
            <AlertTriangle className="w-5 h-5" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
        </div>
        <div className="space-y-3 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-text-muted tracking-widest">
              Nova Coaching Diagnostics
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
            <span className="text-[10px] font-black uppercase font-mono text-[#9a3412] dark:text-primary tracking-widest">
              Realtime Neural Feed
            </span>
          </div>
          <p className="text-text-muted text-sm leading-relaxed font-serif">
            "{novaCommentary.text}"
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Info className="w-3.5 h-3.5 text-[#9a3412] dark:text-primary shrink-0" />
            <span className="text-xs font-bold text-text-main">
              Recommended Next Step: {novaCommentary.action}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
