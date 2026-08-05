import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { secureApiFetch } from '../lib/secure-api';


import {
  TrendingUp,
  Users,
  ShieldCheck,
  Sparkles,
  Lock,
  Building,
  MessageSquare,
  AlertTriangle,
  Lightbulb,
  LineChart as LineChartIcon,
  HeartPulse,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { OrgDashboardValue } from './OrgDashboardValue';
import { OrgDashboardMoments } from './OrgDashboardMoments';

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

const BODY_SIGNAL_LABELS: Record<string, string> = {
  jaw_tension: 'Jaw Tension',
  shoulder_tension: 'Shoulder/Neck Tension',
  shallow_breathing: 'Shallow Breathing',
  headache: 'Headaches',
  fatigue: 'Fatigue',
  restlessness: 'Restlessness',
  stomach_discomfort: 'Stomach Discomfort',
};

export const OrgDashboard = () => {
  const [activeSubTab, setActiveSubTab] = useState<'climate' | 'pulse' | 'value' | 'moments'>('pulse');
  const [alertEnabled, setAlertEnabled] = useState(false);

  const [orgStatus, setOrgStatus] = useState<{ organisationId: string | null; organisationName?: string; isOrgAdmin?: boolean } | null>(null);
  const [dashboardData, setDashboardData] = useState<{
    locked: boolean;
    cohortSize: number;
    threshold: number;
    windowDays?: number;
    engagementRate?: number;
    moodDistribution?: { positive: number; negative: number; neutral: number };
    avgMoodIntensity?: number | null;
    topBodySignals?: { signal: string; count: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const meRes = await secureApiFetch('/api/org/me');
        const me = await meRes.json();
        setOrgStatus(me);
        if (me.organisationId && me.isOrgAdmin) {
          const dashRes = await secureApiFetch(`/api/org/${me.organisationId}/dashboard`);
          const dash = await dashRes.json();
          if (!dashRes.ok) {
            setError(dash.error || "Could not load your organisation's dashboard.");
          } else {
            setDashboardData(dash);
          }
        }
      } catch (e) {
        setError("Could not load your organisation's dashboard.");
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!orgStatus?.organisationId) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-surface dark:bg-surface/50 rounded-xl border border-dashed border-border dark:border-border">
        <Building className="w-12 h-12 text-text-muted mb-4" />
        <h3 className="text-xl font-bold text-text-main mb-2">No Organisation Linked</h3>
        <p className="text-text-muted text-sm max-w-md">
          Join your employer's organisation from the Trust &amp; Privacy Centre to see this dashboard, or ask your admin to set one up.
        </p>
      </div>
    );
  }

  if (!orgStatus.isOrgAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-surface dark:bg-surface/50 rounded-xl border border-dashed border-border dark:border-border">
        <Lock className="w-12 h-12 text-text-muted mb-4" />
        <h3 className="text-xl font-bold text-text-main mb-2">Admin Access Required</h3>
        <p className="text-text-muted text-sm max-w-md">
          This aggregate dashboard is only visible to your organisation's designated admin. You're a member of {orgStatus.organisationName || 'your organisation'}, but don't have admin access to this view.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-destructive/5 border border-dashed border-destructive/20 rounded-xl">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-text-muted text-sm max-w-md">{error}</p>
      </div>
    );
  }

  const cohortSize = dashboardData?.cohortSize ?? 0;
  const minimumThreshold = dashboardData?.threshold ?? 5;

  if (dashboardData?.locked) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-surface dark:bg-surface/50 rounded-xl border border-dashed border-border dark:border-border">
        <Lock className="w-12 h-12 text-text-muted mb-4" />
        <h3 className="text-xl font-bold text-text-main mb-2">Insufficient Cohort Size</h3>
        <p className="text-text-muted text-sm max-w-md">
          {cohortSize} of {minimumThreshold} required teammates have opted in to anonymized sharing so far. Encourage your team to opt in from their own Privacy Centre — aggregate insight only becomes available once enough people have joined in, to keep any one person from being identifiable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

        {activeSubTab === 'pulse' && dashboardData && (
          <motion.div key="pulse" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-12 pb-24">
            <div className="relative overflow-hidden rounded-xl bg-card border border-border p-8 pt-12">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <HeartPulse className="w-64 h-64 text-text-main" />
              </div>
              <div className="relative z-10 max-w-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="tag bg-surface dark:bg-card/10 text-text-main border-white/20">Organizational Resilience Pulse</div>
                </div>
                <h3 className="text-4xl font-display font-bold text-text-main tracking-tight leading-tight mb-4">
                  Team Mood, Last {dashboardData.windowDays || 7} Days
                </h3>
                <p className="text-base text-text-muted font-medium leading-relaxed max-w-2xl mb-8">
                  Aggregated from {dashboardData.cohortSize} teammates who've opted in to anonymized sharing. Individual data is never revealed — only these totals.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                   <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl flex-1 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-destructive">Negative Mood Logs</span>
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">{dashboardData.moodDistribution?.negative ?? 0} <span className="text-sm font-normal text-destructive">logs</span></p>
                  </div>
                  <div className="p-4 bg-warning/10 border border-warning/20 rounded-2xl flex-1 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-warning">Neutral Mood Logs</span>
                      <TrendingUp className="w-4 h-4 text-warning" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">{dashboardData.moodDistribution?.neutral ?? 0} <span className="text-sm font-normal text-warning">logs</span></p>
                  </div>
                  <div className="p-4 bg-success/10 border border-success/20 rounded-2xl flex-1 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs uppercase font-bold tracking-widest text-success">Positive Mood Logs</span>
                      <ShieldCheck className="w-4 h-4 text-success" />
                    </div>
                    <p className="text-3xl font-display font-bold text-text-main">{dashboardData.moodDistribution?.positive ?? 0} <span className="text-sm font-normal text-success">logs</span></p>
                  </div>
                </div>

                <div className="mt-8 relative z-10 max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-surface dark:bg-card/40 border border-border rounded-xl">
                    <span className="text-xs uppercase font-bold tracking-widest text-text-muted block mb-1">Weekly Engagement</span>
                    <p className="text-3xl font-display font-bold text-text-main">{dashboardData.engagementRate ?? 0}%</p>
                    <p className="text-xs text-text-muted mt-1">of opted-in teammates logged at least one check-in this week.</p>
                  </div>
                  <div className="p-5 bg-surface dark:bg-card/40 border border-border rounded-xl">
                    <span className="text-xs uppercase font-bold tracking-widest text-text-muted block mb-1">Avg. Mood Intensity</span>
                    <p className="text-3xl font-display font-bold text-text-main">{dashboardData.avgMoodIntensity != null ? `${dashboardData.avgMoodIntensity}/10` : '—'}</p>
                    <p className="text-xs text-text-muted mt-1">across all mood check-ins this week.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card space-y-6">
              <div>
                <h4 className="font-bold text-text-main flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-warning" /> Most Common Body Signals</h4>
                <p className="text-xs text-text-muted">What your team has most reported feeling physically this week, aggregated.</p>
              </div>
              {dashboardData.topBodySignals && dashboardData.topBodySignals.length > 0 ? (
                <div className="space-y-3">
                  {dashboardData.topBodySignals.map(({ signal, count }) => {
                    const max = dashboardData.topBodySignals![0].count || 1;
                    return (
                      <div key={signal} className="p-4 bg-surface dark:bg-card/40 border border-border rounded-xl">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-bold text-text-main">{BODY_SIGNAL_LABELS[signal] || signal}</span>
                          <span className="text-xs font-black uppercase tracking-widest text-text-muted bg-surface dark:bg-surface px-2 py-1 rounded">{count} reports</span>
                        </div>
                        <div className="h-2 w-full bg-surface dark:bg-surface rounded-full overflow-hidden">
                          <div className="h-full bg-warning" style={{ width: `${Math.max(8, (count / max) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-text-muted py-8 text-center">No body check-ins logged by your team this week yet.</p>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'climate' && (
          <motion.div key="climate" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-12 pb-24">
            {/* Header */}
            <div className="relative overflow-hidden rounded-xl bg-card border border-border p-8 pt-12">
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
              </div>
            </div>

            <div className="card space-y-6 border border-dashed border-border bg-surface/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface text-text-muted flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-text-main text-lg">Team Climate Survey — Not Yet Available</h4>
                  <p className="text-xs text-text-muted">This view would need a genuine periodic HSE-style climate survey, which isn't built yet.</p>
                </div>
              </div>
              <p className="text-sm text-text-muted leading-relaxed max-w-2xl">
                A real version of this tab means designing an actual recurring questionnaire covering the standard six work-design areas (Demands, Control, Support, Relationships, Role, Change), collecting genuine responses from your team, and aggregating those — not inferring it from data that was never collected for this purpose. For real, available-today insight into how your team is actually doing, see the <strong className="text-text-main">Resilience Pulse</strong> tab, which reflects real mood and body check-in data from teammates who've opted in.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Action Library & Anonymous Voice */}
              <div className="space-y-6">
                <div className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-5 h-5 text-warning" />
                    <h4 className="font-bold text-text-main">Example Coaching Themes</h4>
                  </div>
                  <p className="text-xs text-text-muted mb-4">Illustrative starting points — not generated from your team's actual data, since there's no anonymous suggestion channel built yet.</p>
                  <div className="space-y-3">
                    {SUGGESTIONS.map((s, i) => (
                      <div key={i} className="flex items-start gap-4 p-3 bg-surface border border-border rounded-xl">
                        <div className="w-8 h-8 rounded-full bg-surface dark:bg-surface flex items-center justify-center shrink-0 font-bold text-xs text-text-muted">
                          <Lightbulb className="w-4 h-4" />
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
