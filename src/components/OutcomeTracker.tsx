import { motion } from 'motion/react';
import { TrendingUp, ShieldCheck, Moon, Shield, Zap, BatteryCharging, Briefcase, Star, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { BurnoutFingerprint } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line, Legend } from 'recharts';

interface OutcomeTrackerProps {
  fingerprint: BurnoutFingerprint | null;
}

const WEEKLY_DATA = [
  { week: 'W1', recovery: 40, burnoutRisk: 85, sleep: 30, boundary: 20 },
  { week: 'W2', recovery: 45, burnoutRisk: 80, sleep: 40, boundary: 35 },
  { week: 'W3', recovery: 55, burnoutRisk: 70, sleep: 45, boundary: 45 },
  { week: 'W4', recovery: 60, burnoutRisk: 60, sleep: 65, boundary: 55 },
  { week: 'W5', recovery: 75, burnoutRisk: 50, sleep: 70, boundary: 70 },
  { week: 'W6', recovery: 85, burnoutRisk: 35, sleep: 80, boundary: 85 },
];

const OVERCAPACITY_DATA = [
  { day: 'Mon', initial: 1, current: 0 },
  { day: 'Tue', initial: 1, current: 1 },
  { day: 'Wed', initial: 1, current: 0 },
  { day: 'Thu', initial: 1, current: 0 },
  { day: 'Fri', initial: 1, current: 0 },
  { day: 'Sat', initial: 0, current: 0 },
  { day: 'Sun', initial: 0, current: 0 },
];

export const OutcomeTracker = ({ fingerprint }: OutcomeTrackerProps) => {

  const KPIs = [
    { label: 'Recovery Score Improvement', value: '+45%', metric: '85/100', icon: TrendingUp, trend: 'up' },
    { label: 'Burnout Risk Reduction', value: '-50%', metric: 'Low Risk', icon: ShieldCheck, trend: 'down' },
    { label: 'Sleep Consistency', value: '+50%', metric: '80/100', icon: Moon, trend: 'up' },
    { label: 'Boundary Confidence', value: '+65%', metric: '85/100', icon: Shield, trend: 'up' },
    { label: 'Energy Stability', value: 'High', metric: 'No Crashes', icon: Zap, trend: 'up' },
    { label: 'Overcapacity Days', value: '-80%', metric: '1 day/wk', icon: BatteryCharging, trend: 'down' },
    { label: 'Return-to-Work Confidence', value: '8/10', metric: 'Ready', icon: Briefcase, trend: 'up' },
    { label: 'User-Rated Helpfulness', value: '4.9/5', metric: 'Excellent', icon: Star, trend: 'up' }
  ];

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
              "We measure safety, benefit, usability, and outcomes. See the compounding returns of your recovery investment."
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {KPIs.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card p-6 border border-success/20 relative overflow-hidden group"
          >
             <div className="flex items-center justify-between mb-4 relative z-10">
               <div className="w-10 h-10 rounded-lg bg-success/10 text-success flex items-center justify-center">
                 <kpi.icon className="w-5 h-5" />
               </div>
               <div className="px-2 py-1 rounded bg-success/10 text-success text-xs font-bold flex items-center gap-1">
                 {kpi.trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                 {kpi.value}
               </div>
             </div>
             <div className="relative z-10">
               <h4 className="text-sm font-black uppercase tracking-wider text-text-muted mb-1">{kpi.label}</h4>
               <p className="text-2xl font-display font-bold text-text-main">{kpi.metric}</p>
             </div>
          </motion.div>
        ))}
      </div>

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
           
           <div className="h-72 w-full">
             <ResponsiveContainer width="100%" height="100%" minWidth={0}>
               <AreaChart data={WEEKLY_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                 <Area type="monotone" dataKey="recovery" name="Recovery Score" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRecovery)" />
                 <Area type="monotone" dataKey="burnoutRisk" name="Burnout Risk" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" />
               </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Boundary Confidence & Sleep Consistency */}
        <div className="card border border-border p-8">
           <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-display font-bold text-text-main">Biological & Behavioral Metrics</h3>
                <p className="text-sm text-text-muted mt-1 uppercase tracking-widest font-bold">6-Week Trajectory</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-warning/10 text-warning flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
           </div>
           
           <div className="h-72 w-full">
             <ResponsiveContainer width="100%" height="100%" minWidth={0}>
               <LineChart data={WEEKLY_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                 <XAxis dataKey="week" stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                 />
                 <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                 <Line type="monotone" dataKey="boundary" name="Boundary Confidence" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                 <Line type="monotone" dataKey="sleep" name="Sleep Consistency" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
               </LineChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Overcapacity Days Reduction */}
        <div className="card border border-border p-8 lg:col-span-2">
           <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-display font-bold text-text-main">Overcapacity Days</h3>
                <p className="text-sm text-text-muted mt-1 uppercase tracking-widest font-bold">Month 1 vs Current Month</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
                <BatteryCharging className="w-5 h-5" />
              </div>
           </div>

           <div className="h-64 w-full">
             <ResponsiveContainer width="100%" height="100%" minWidth={0}>
               <BarChart data={OVERCAPACITY_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={8}>
                 <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                 <XAxis dataKey="day" stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="currentColor" strokeOpacity={0.5} fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                   cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                 />
                 <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                 <Bar dataKey="initial" name="Month 1 (Overcapacity Days)" fill="#ef4444" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                 <Bar dataKey="current" name="Current Month (Overcapacity Days)" fill="#10b981" fillOpacity={0.9} radius={[4, 4, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
           </div>
        </div>

      </div>
    </div>
  );
};
