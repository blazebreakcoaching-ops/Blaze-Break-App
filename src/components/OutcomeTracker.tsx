import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ShieldCheck, Moon, Shield, BatteryCharging, Briefcase, Star, ArrowUpRight, Activity, Loader2 } from 'lucide-react';
import { BurnoutFingerprint } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, Legend } from 'recharts';
import { secureApiFetch } from '../lib/secure-api';

interface OutcomeTrackerProps {
  fingerprint: BurnoutFingerprint | null;
}

interface WeekData {
  week: string;
  recovery: number | null;
  burnoutRisk: number | null;
  boundary: number | null;
  overcapacity: number | null;
  hasData: boolean;
}

interface OutcomeData {
  weeks: WeekData[];
  hasAnyData: boolean;
  kpis: {
    boundaryScriptsLogged: number;
    winsLogged: number;
    avgTriggerSeverity: number | null;
    overcapacityDaysPerWeek: number | null;
    sleepConsistency: null;
    returnToWorkConfidence: null;
    userRatedHelpfulness: null;
  };
}

export const OutcomeTracker = ({ fingerprint }: OutcomeTrackerProps) => {
  const [data, setData] = useState<OutcomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await secureApiFetch('/api/user/outcome-tracker');
        if (res.ok) {
          setData(await res.json());
        }
      } catch (e) {
        // Leaves data null - the honest "not enough data yet" state renders below.
      }
      setLoading(false);
    };
    load();
  }, []);

  const KPIs = data ? [
    { label: 'Boundary Scripts Logged', value: `${data.kpis.boundaryScriptsLogged}`, metric: 'Last 6 weeks', icon: Shield, tracked: true },
    { label: 'Recovery Actions Logged', value: `${data.kpis.winsLogged}`, metric: 'Last 6 weeks', icon: TrendingUp, tracked: true },
    { label: 'Avg. Trigger Intensity', value: data.kpis.avgTriggerSeverity !== null ? `${data.kpis.avgTriggerSeverity}/10` : '\u2014', metric: data.kpis.avgTriggerSeverity !== null ? 'Last 6 weeks' : 'No data yet', icon: ShieldCheck, tracked: data.kpis.avgTriggerSeverity !== null },
    { label: 'Overcapacity Days', value: data.kpis.overcapacityDaysPerWeek !== null ? `${data.kpis.overcapacityDaysPerWeek}/wk` : '\u2014', metric: data.kpis.overcapacityDaysPerWeek !== null ? 'Current estimate' : 'No data yet', icon: BatteryCharging, tracked: data.kpis.overcapacityDaysPerWeek !== null },
    { label: 'Sleep Consistency', value: '\u2014', metric: 'Not tracked yet', icon: Moon, tracked: false },
    { label: 'Return-to-Work Confidence', value: '\u2014', metric: 'Not tracked yet', icon: Briefcase, tracked: false },
    { label: 'User-Rated Helpfulness', value: '\u2014', metric: 'Not tracked yet', icon: Star, tracked: false },
  ] : [];

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 21 / Evidence & ROI</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Outcome Tracker</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              Real numbers from what you've actually logged - not a projection. Some metrics below aren't tracked yet, and say so honestly rather than showing a placeholder statistic.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {KPIs.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`card p-6 border relative overflow-hidden group ${kpi.tracked ? 'border-success/20' : 'border-border'}`}
          >
             <div className="flex items-center justify-between mb-4 relative z-10">
               <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.tracked ? 'bg-success/10 text-success dark:text-[#4ade80]' : 'bg-surface text-text-muted'}`}>
                 <kpi.icon className="w-5 h-5" />
               </div>
               {kpi.tracked && (
                 <div className="px-2 py-1 rounded bg-success/10 text-[#166534] dark:text-[#4ade80] text-xs font-bold flex items-center gap-1">
                   <ArrowUpRight className="w-3 h-3" />
                   {kpi.value}
                 </div>
               )}
             </div>
             <div className="relative z-10">
               <h4 className="text-sm font-black uppercase tracking-wider text-text-muted mb-1">{kpi.label}</h4>
               <p className={`text-2xl font-display font-bold ${kpi.tracked ? 'text-text-main' : 'text-text-muted'}`}>{kpi.tracked ? kpi.value : kpi.metric}</p>
             </div>
          </motion.div>
        ))}
      </div>

      {!data?.hasAnyData && (
        <p className="text-sm text-text-muted italic text-center py-4">Not enough activity logged yet for weekly trends. Use the app's recovery tools over the next few weeks and real trajectories will appear here.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Recovery vs Burnout Risk Chart */}
        <div className="card border border-border p-8">
           <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-display font-bold text-text-main">Recovery Progression</h3>
                <p className="text-sm text-text-muted mt-1 uppercase tracking-widest font-bold">6-Week Trajectory</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
           </div>
           
           <div className="h-72 w-full" role="img" aria-label="Line chart comparing weekly recovery activity and burnout risk over the last 6 weeks. Full values are in the chart's legend and tooltips.">
             <ResponsiveContainer width="100%" height="100%" minWidth={0}>
               <AreaChart data={data?.weeks || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                 <defs>
                   <linearGradient id="colorRecovery" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                   </linearGradient>
                   <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                     <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                 <XAxis dataKey="week" stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                   itemStyle={{ color: '#e2e8f0' }}
                 />
                 <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                 <Area type="monotone" dataKey="recovery" name="Recovery Activity" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRecovery)" connectNulls />
                 <Area type="monotone" dataKey="burnoutRisk" name="Burnout Risk" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" connectNulls />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Boundary Activity */}
        <div className="card border border-border p-8">
           <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-display font-bold text-text-main">Boundary Activity</h3>
                <p className="text-sm text-text-muted mt-1 uppercase tracking-widest font-bold">6-Week Trajectory</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-warning/10 text-[#9a3412] dark:text-warning flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
           </div>
           
           <div className="h-72 w-full" role="img" aria-label="Line chart of boundary scripts logged per week over the last 6 weeks. Full values are in the chart's tooltips.">
             <ResponsiveContainer width="100%" height="100%" minWidth={0}>
               <LineChart data={data?.weeks || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                 <XAxis dataKey="week" stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                 />
                 <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                 <Line type="monotone" dataKey="boundary" name="Boundary Scripts Logged" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
               </LineChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Energy Budget Allocation */}
        <div className="card border border-border p-8 lg:col-span-2">
           <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-display font-bold text-text-main">Energy Budget Allocation</h3>
                <p className="text-sm text-text-muted mt-1 uppercase tracking-widest font-bold">6-Week Trajectory (% of capacity allocated)</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
                <BatteryCharging className="w-5 h-5" />
              </div>
           </div>

           <div className="h-64 w-full" role="img" aria-label="Bar chart of weekly capacity allocated as a percentage, over the last 6 weeks. Full values are in the chart's tooltips.">
             <ResponsiveContainer width="100%" height="100%" minWidth={0}>
               <BarChart data={data?.weeks || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={8}>
                 <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                 <XAxis dataKey="week" stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                   cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                 />
                 <Bar dataKey="overcapacity" name="Capacity Allocated (%)" fill="#ef4444" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>

      </div>
      </>
      )}
    </div>
  );
};
