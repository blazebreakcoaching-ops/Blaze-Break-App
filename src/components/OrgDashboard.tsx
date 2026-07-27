import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart,
  Area,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { 
  TrendingUp, 
  Users,  
  ShieldCheck, 
  Target,
  Sparkles,
  Lock,
  Building,
  Brain,
  MessageSquare,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  LineChart as LineChartIcon,
  HeartPulse
} from 'lucide-react';
import { cn } from '../lib/utils';
import { OrgDashboardValue } from './OrgDashboardValue';
import { OrgDashboardMoments } from './OrgDashboardMoments';

const HSE_DATA = [
  { subject: 'Demands', A: 45, B: 80, fullMark: 100 },
  { subject: 'Control', A: 70, B: 90, fullMark: 100 },
  { subject: 'Support', A: 60, B: 80, fullMark: 100 },
  { subject: 'Relationships', A: 85, B: 90, fullMark: 100 },
  { subject: 'Role', A: 65, B: 85, fullMark: 100 },
  { subject: 'Change', A: 40, B: 75, fullMark: 100 },
];

const PRESSURE_TREND_DATA = [
  { date: 'Week 1', pressure: 45, morale: 80, boundaries: 70 },
  { date: 'Week 2', pressure: 52, morale: 75, boundaries: 65 },
  { date: 'Week 3', pressure: 68, morale: 60, boundaries: 55 },
  { date: 'Week 4', pressure: 85, morale: 45, boundaries: 40 },
];

const BURNOUT_PROGRESSION_DATA = [
  { stage: 'Baseline Stability', members: 12 },
  { stage: 'Acute Stress', members: 8 },
  { stage: 'Chronic Strain', members: 5 },
  { stage: 'Presenteeism', members: 3 },
  { stage: 'Exhaustion', members: 1 },
];

const SUGGESTIONS = [
  { theme: 'Meeting Overload', count: 18, text: 'Consider reducing recurring syncs to bi-weekly and implementing "No Meeting Wednesdays".' },
  { theme: 'After-hours Comms', count: 12, text: 'Agree on communication boundaries: no expected Slack replies after 6PM.' },
  { theme: 'Role Unclarity', count: 8, text: 'Review handover processes between design and engineering to reduce friction.' }
];

const ACTIONS = [
  { id: '1', title: 'Reduce Meeting Load', category: 'Demands', impact: 'High', effort: 'Medium' },
  { id: '2', title: 'Agree Comm Boundaries', category: 'Support', impact: 'High', effort: 'Low' },
  { id: '3', title: 'Introduce Appreciation Rhythm', category: 'Relationships', impact: 'Medium', effort: 'Low' },
  { id: '4', title: 'Make Workload Adjustments', category: 'Demands', impact: 'High', effort: 'High' }
];

export const OrgDashboard = () => {
  const [activeThreshold] = useState(true); // Pretend we reached the safe minimum threshold of contributors
  const [activeSubTab, setActiveSubTab] = useState<'climate' | 'pulse' | 'value' | 'moments'>('pulse');
  const [alertEnabled, setAlertEnabled] = useState(false);
  
  const cohortSize = 24;
  const minimumThreshold = 10;

  if (cohortSize < minimumThreshold) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-surface dark:bg-surface/50 rounded-3xl border border-dashed border-border dark:border-border">
        <Lock className="w-12 h-12 text-text-muted mb-4" />
        <h3 className="text-xl font-bold text-text-main mb-2">Insufficient Cohort Size</h3>
        <p className="text-text-muted text-sm max-w-md">
          Insufficient group size for anonymous insight. At least {minimumThreshold} contributors are required.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-warning/10 border border-warning/20 text-warning rounded-xl p-4 text-sm font-bold flex gap-2">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        Demo data only — not connected to live organisation data.
      </div>
      
      {/* Privacy Aggregation Banner */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm font-medium text-text-main">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <span><strong>Privacy Rule Active:</strong> All organizational data is aggregated and anonymized. Cohort size: {cohortSize} team members.</span>
          </div>
        </div>
        
        {/* Telemetry Shift Notification Toggle */}
        <div className="flex items-center gap-3 text-sm bg-surface/50 border border-primary/20 px-4 py-2 rounded-lg shrink-0">
          <AlertTriangle className={cn("w-4 h-4", alertEnabled ? "text-warning" : "text-text-muted")} />
          <span className="font-bold text-text-main mr-2">Decline Alerts</span>
          <button 
            onClick={() => setAlertEnabled(!alertEnabled)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-white/75",
              alertEnabled ? 'bg-primary' : 'bg-surface border border-border'
            )}
            role="switch"
            aria-checked={alertEnabled}
          >
            <span className="sr-only">Toggle decline alerts</span>
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                alertEnabled ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex flex-wrap gap-2 mb-8">
        {[
           { id: 'pulse', label: 'Resilience Pulse', icon: HeartPulse },
           { id: 'climate', label: 'Team Climate Dashboard', icon: LineChartIcon },
           { id: 'value', label: 'People Value Engine', icon: Building },
           { id: 'moments', label: 'Blaze Bright Moments', icon: Sparkles }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                activeSubTab === tab.id 
                  ? "bg-primary border-primary text-primary-foreground shadow-md"
                  : "bg-surface border border-border text-text-muted hover:border-text-muted"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait">

        {activeSubTab === 'pulse' && (
          <motion.div key="pulse" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-12 pb-24">
            <div className="relative overflow-hidden rounded-3xl bg-card border border-border p-8 pt-12">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <HeartPulse className="w-64 h-64 text-text-main" />
              </div>
              <div className="relative z-10 max-w-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="tag bg-surface dark:bg-card/10 text-text-main border-white/20">Organizational Resilience Pulse</div>
                </div>
                <h3 className="text-4xl font-display font-bold text-text-main tracking-tight leading-tight mb-4">
                  Team Burnout Risk Trends
                </h3>
                <p className="text-base text-text-muted font-medium leading-relaxed max-w-2xl mb-8">
                  A high-level projection of cohort burnout risk and physiological strain. This ensures individual private data is never revealed, projecting trends to help you steer the organization sustainably.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                   <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl flex-1 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-destructive">Critical Risk (Q3)</span>
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">18% <span className="text-sm font-normal text-destructive">of cohort</span></p>
                  </div>
                  <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl flex-1 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-warning">Elevated Strain</span>
                      <TrendingUp className="w-4 h-4 text-warning" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">42% <span className="text-sm font-normal text-warning">of cohort</span></p>
                  </div>
                  <div className="p-4 bg-success/10 border border-success/20 rounded-2xl flex-1 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-success">Stable Baseline</span>
                      <ShieldCheck className="w-4 h-4 text-success" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">40% <span className="text-sm font-normal text-success">of cohort</span></p>
                  </div>
                </div>
                
                <div className="mt-8 relative z-10 max-w-4xl">
                  <h4 className="font-bold text-text-main mb-4 tracking-tight">Organizational Resilience Pulse</h4>
                  <div className="h-64 w-full bg-surface dark:bg-card/40 border border-border rounded-xl p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={PRESSURE_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.4} />
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                          itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                        />
                        <Line type="monotone" dataKey="pressure" name="Aggregate Stress Trends" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, fill: "#f43f5e", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Early Warning Panel */}
              <div className="card space-y-6">
                <div>
                  <h4 className="font-bold text-text-main flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-warning" /> Early Warning Signals</h4>
                  <p className="text-xs text-text-muted">Predictive risk modeling based on historic presenteeism and strain progression.</p>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-surface dark:bg-card/40 border border-border rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-text-main">Engineering: Alpha Team</span>
                      <span className="text-xs font-black uppercase tracking-widest text-warning bg-warning/10 px-2 py-1 rounded">Moderate Risk</span>
                    </div>
                    <p className="text-xs text-text-muted mb-3">Sustained strain patterns detected over 3 weeks. Presenteeism likelihood rising.</p>
                    <div className="h-2 w-full bg-surface dark:bg-surface rounded-full overflow-hidden">
                       <div className="h-full bg-warning w-[65%]" />
                    </div>
                  </div>
                  <div className="p-4 bg-surface dark:bg-card/40 border border-border rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-text-main">Design Systems Squad</span>
                      <span className="text-xs font-black uppercase tracking-widest text-destructive bg-destructive/10 px-2 py-1 rounded">Critical Risk</span>
                    </div>
                    <p className="text-xs text-text-muted mb-3">Velocity drops and high evening communication spikes indicate imminent exhaustion.</p>
                    <div className="h-2 w-full bg-surface dark:bg-surface rounded-full overflow-hidden">
                       <div className="h-full bg-destructive w-[88%]" />
                    </div>
                  </div>
                  <div className="p-4 bg-surface dark:bg-card/40 border border-border rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-text-main">Marketing: Brand Team</span>
                      <span className="text-xs font-black uppercase tracking-widest text-success bg-success/10 px-2 py-1 rounded">Stable Baseline</span>
                    </div>
                    <p className="text-xs text-text-muted mb-3">Consistent boundaries and positive morale signals maintained.</p>
                    <div className="h-2 w-full bg-surface dark:bg-surface rounded-full overflow-hidden">
                       <div className="h-full bg-success w-[15%]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Burnout Progression Chart */}
              <div className="card space-y-6">
                <div>
                  <h4 className="font-bold text-text-main flex items-center gap-2">Burnout Progression</h4>
                  <p className="text-xs text-text-muted">Trends in workplace presenteeism & exhaustion risks.</p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={BURNOUT_PROGRESSION_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.4} />
                      <XAxis dataKey="stage" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                        itemStyle={{ color: '#f59e0b', fontSize: '12px', fontWeight: 'bold' }}
                        cursor={{fill: '#334155', opacity: 0.2}}
                      />
                      <Bar dataKey="members" name="Colleagues" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'climate' && (
          <motion.div key="climate" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-12 pb-24">
            {/* Header */}
            <div className="relative overflow-hidden rounded-3xl bg-card border border-border p-8 pt-12">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <LineChartIcon className="w-64 h-64 text-text-main" />
              </div>
              <div className="relative z-10 max-w-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="tag bg-surface dark:bg-card/10 text-text-main border-white/20">Team Climate Dashboard</div>
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-success bg-success/10 px-3 py-1 rounded-full border border-success/20">
                    <ShieldCheck className="w-3 h-3" /> Privacy Threshold Met ({cohortSize} members)
                  </div>
                </div>
                <h3 className="text-4xl sm:text-5xl font-display font-bold text-text-main tracking-tight leading-tight mb-4">
                  Measure Conditions, Not People.
                </h3>
                <p className="text-base text-text-muted font-medium leading-relaxed max-w-2xl mb-8">
                  Understand whether team conditions are supporting or draining your people. 
                  Aligned with the HSE Management Standards, this dashboard provides anonymous trends and actionable manager coaching without exposing any individual's private emotional data.
                </p>
                <div className="flex gap-4">
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex-1 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-success">Team Morale</span>
                      <TrendingUp className="w-4 h-4 text-success" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">45% <span className="text-sm font-normal text-destructive">-15%</span></p>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex-1 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-destructive">Workload Pressure</span>
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">85% <span className="text-sm font-normal text-destructive">+25%</span></p>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex-1 backdrop-blur-md hidden sm:block">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-warning">Support Needs</span>
                      <Users className="w-4 h-4 text-warning" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">High</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Nova Manager Coach (Leadership Coaching) */}
              <div className="card space-y-6 border-primary/30 shadow-xl shadow-primary/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-text-main text-lg">Leadership Coaching</h4>
                    <p className="text-xs text-text-muted">Proactive, non-intrusive management tips for high recovery debt.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-surface dark:bg-surface/50 p-4 rounded-xl border border-border">
                    <p className="text-sm font-medium text-text-main mb-3 leading-relaxed">
                      "A growing segment of your team (35%) is carrying high hidden <strong className="text-destructive">Recovery Debt</strong>. This often precedes sudden burnout."
                    </p>
                    <div className="flex items-start gap-2 pt-3 border-t border-border">
                      <Lightbulb className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                      <p className="text-sm text-text-muted">
                        <strong>Coaching Tip:</strong> Do not just ask "how are you?". During your 1:1s, ask: <em>"What is one non-essential task we can deprioritize this week to give you a breather?"</em> Provide explicit permission to drop lower-priority work.
                      </p>
                    </div>
                  </div>
                  <div className="bg-surface dark:bg-surface/50 p-4 rounded-xl border border-border">
                    <p className="text-sm font-medium text-text-main mb-3 leading-relaxed">
                      "Your team's <strong className="text-destructive">Recovery Velocity</strong> has been negative for 3 consecutive weeks, while output demands remain high."
                    </p>
                    <div className="flex items-start gap-2 pt-3 border-t border-border">
                      <Lightbulb className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                      <p className="text-sm text-text-muted">
                        <strong>Coaching Tip:</strong> Your team is running on empty. Do not ask for 'one last push'. Instead, proactively cancel non-essential recurring meetings next week to create a decompression buffer.
                      </p>
                    </div>
                  </div>
                  <div className="bg-surface dark:bg-surface/50 p-4 rounded-xl border border-border">
                    <p className="text-sm font-medium text-text-main mb-3 leading-relaxed">
                      "After-hours communication pressure is increasing rapidly, eroding decompression time."
                    </p>
                    <div className="flex items-start gap-2 pt-3 border-t border-border">
                      <Target className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-sm text-text-muted">
                        <strong>Coaching Tip:</strong> Lead by example. Schedule your own late emails to send at 9:00 AM the next day, and state publicly that you do not expect evening replies.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* HSE Radar */}
              <div className="card space-y-6">
                <div>
                  <h4 className="font-bold text-text-main">HSE-Aligned Team Signals</h4>
                  <p className="text-xs text-text-muted">Analyzing the 6 work-design areas linked to chronic stress.</p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={HSE_DATA}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Current Period" dataKey="A" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.4} />
                      <Radar name="Healthy Baseline" dataKey="B" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeDasharray="3 3"/>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-destructive/40 border border-destructive" />
                    <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Current</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-success/10 border border-success border-dashed" />
                    <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Baseline Goal</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Trend Area Chart */}
              <div className="card space-y-6">
                <div>
                  <h4 className="font-bold text-text-main">Ecosystem Pressure vs Morale</h4>
                  <p className="text-xs text-text-muted">4-Week moving average of aggregate signals.</p>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={PRESSURE_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPressure" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMorale" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.4} />
                      <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="pressure" name="Reported Pressure" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorPressure)" />
                      <Area type="monotone" dataKey="morale" name="Reported Morale" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorMorale)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Action Library & Anonymous Voice */}
              <div className="space-y-6">
                <div className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-5 h-5 text-warning" />
                    <h4 className="font-bold text-text-main">Anonymous Team Voice</h4>
                  </div>
                  <p className="text-xs text-text-muted mb-4">Thematic suggestions generated across the team.</p>
                  <div className="space-y-3">
                    {SUGGESTIONS.map((s, i) => (
                      <div key={i} className="flex items-start gap-4 p-3 bg-surface border border-border rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-surface dark:bg-surface flex items-center justify-center shrink-0 font-bold text-xs">
                          {s.count}
                        </div>
                        <div>
                          <span className="text-xs font-black uppercase tracking-widest text-primary block mb-1">{s.theme}</span>
                          <p className="text-sm font-medium text-text-main">"{s.text}"</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card bg-card border-border text-text-main">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-bold flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" /> Manager Action Library
                    </h4>
                    <button className="text-xs uppercase tracking-widest font-bold text-text-muted hover:text-text-main transition-colors flex items-center gap-1">
                      View All <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ACTIONS.map(action => (
                      <div key={action.id} className="p-4 rounded-xl bg-card/50 hover:bg-card border border-border transition-colors cursor-pointer group">
                        <span className="text-[11px] uppercase tracking-widest font-black text-text-muted block mb-1">{action.category}</span>
                        <p className="text-xs font-bold text-text-main mb-3 group-hover:text-primary transition-colors">{action.title}</p>
                        <div className="flex gap-2">
                          <span className={cn("text-[11px] px-1.5 py-0.5 rounded", action.impact === 'High' ? "bg-success/20 text-success" : "bg-surface text-text-muted")}>Impact: {action.impact}</span>
                          <span className={cn("text-[11px] px-1.5 py-0.5 rounded bg-surface text-text-muted")}>Effort: {action.effort}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {activeSubTab === 'value' && (
          <motion.div key="value" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
            <OrgDashboardValue />
          </motion.div>
        )}

        {activeSubTab === 'moments' && (
          <motion.div key="moments" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
            <OrgDashboardMoments />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

