import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { secureApiFetch } from '../lib/secure-api';
import { auth } from '../lib/firebase';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';


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
  Loader2,
  UserMinus,
  ShieldPlus,
  Copy,
  Save,
  Mail,
  Send,
  X,
  Upload,
  RotateCw
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
  const [activeSubTab, setActiveSubTab] = useState<'climate' | 'pulse' | 'value' | 'moments' | 'team'>('pulse');
  const [alertEnabled, setAlertEnabled] = useState(false);

  const [orgStatus, setOrgStatus] = useState<{ organisationId: string | null; organisationName?: string; isOrgAdmin?: boolean; joinCode?: string; privacyThreshold?: number } | null>(null);
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
  const [climateData, setClimateData] = useState<{
    locked: boolean;
    cohortSize: number;
    threshold: number;
    responseCount?: number;
    responseRate?: number;
    averages?: Record<string, number>;
  } | null>(null);

  const [suggestions, setSuggestions] = useState<{ id: string; message: string }[]>([]);

  const [members, setMembers] = useState<{ uid: string; email: string | null; displayName: string | null; isAdmin: boolean }[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [memberActionUid, setMemberActionUid] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ uid: string; label: string } | null>(null);

  const [settingsName, setSettingsName] = useState('');
  const [settingsThreshold, setSettingsThreshold] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [currentJoinCode, setCurrentJoinCode] = useState('');

  const [inviteEmails, setInviteEmails] = useState('');
  const [sendingInvites, setSendingInvites] = useState(false);
  const [inviteResult, setInviteResult] = useState('');
  const [pendingInvites, setPendingInvites] = useState<{ id: string; email: string; emailSent: boolean }[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [cancelingInviteId, setCancelingInviteId] = useState<string | null>(null);
  const [csvError, setCsvError] = useState('');
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

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
          setSettingsName(me.organisationName || '');
          setSettingsThreshold(String(me.privacyThreshold || 5));
          setCurrentJoinCode(me.joinCode || '');

          const dashRes = await secureApiFetch(`/api/org/${me.organisationId}/dashboard`);
          const dash = await dashRes.json();
          if (!dashRes.ok) {
            setError(dash.error || "Could not load your organisation's dashboard.");
          } else {
            setDashboardData(dash);
          }

          try {
            const climateRes = await secureApiFetch(`/api/org/${me.organisationId}/climate`);
            const climate = await climateRes.json();
            if (climateRes.ok) setClimateData(climate);
          } catch (e) {
            // Non-fatal - the pulse dashboard above still works even if this fails.
          }

          fetchMembers(me.organisationId);
          fetchInvites(me.organisationId);
          fetchSuggestions(me.organisationId);
        }
      } catch (e) {
        setError("Could not load your organisation's dashboard.");
      }
      setLoading(false);
    };
    load();
  }, []);

  const fetchMembers = async (currentOrgId: string) => {
    setMembersLoading(true);
    setMembersError('');
    try {
      const res = await secureApiFetch(`/api/org/${currentOrgId}/members`);
      const data = await res.json();
      if (!res.ok) {
        setMembersError(data.error || 'Could not load your team roster.');
      } else {
        setMembers(data.members || []);
      }
    } catch (e) {
      setMembersError('Could not load your team roster.');
    }
    setMembersLoading(false);
  };

  const handleRemoveMember = async (memberUid: string) => {
    if (!orgStatus?.organisationId) return;
    setMemberActionUid(memberUid);
    setMembersError('');
    try {
      const res = await secureApiFetch(`/api/org/${orgStatus.organisationId}/members/${memberUid}/remove`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMembersError(data.error || 'Could not remove that person.');
      } else {
        await fetchMembers(orgStatus.organisationId);
      }
    } catch (e) {
      setMembersError('Could not remove that person.');
    }
    setMemberActionUid(null);
    setMemberToRemove(null);
  };

  const handleMakeAdmin = async (memberUid: string) => {
    if (!orgStatus?.organisationId) return;
    setMemberActionUid(memberUid);
    setMembersError('');
    try {
      const res = await secureApiFetch(`/api/org/${orgStatus.organisationId}/members/${memberUid}/make-admin`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMembersError(data.error || 'Could not promote that person.');
      } else {
        await fetchMembers(orgStatus.organisationId);
      }
    } catch (e) {
      setMembersError('Could not promote that person.');
    }
    setMemberActionUid(null);
  };

  const handleRevokeAdmin = async (memberUid: string) => {
    if (!orgStatus?.organisationId) return;
    setMemberActionUid(memberUid);
    setMembersError('');
    try {
      const res = await secureApiFetch(`/api/org/${orgStatus.organisationId}/members/${memberUid}/revoke-admin`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMembersError(data.error || 'Could not revoke that admin access.');
      } else {
        await fetchMembers(orgStatus.organisationId);
      }
    } catch (e) {
      setMembersError('Could not revoke that admin access.');
    }
    setMemberActionUid(null);
  };

  const handleSaveSettings = async () => {
    if (!orgStatus?.organisationId) return;
    const threshold = Number(settingsThreshold);
    if (!settingsName.trim() || !Number.isFinite(threshold) || threshold < 3) {
      setMembersError('Please enter a name and a minimum cohort size of at least 3.');
      return;
    }
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const res = await secureApiFetch(`/api/org/${orgStatus.organisationId}/settings`, {
        method: 'POST',
        data: { name: settingsName.trim(), privacyThreshold: threshold },
      });
      const data = await res.json();
      if (!res.ok) {
        setMembersError(data.error || 'Could not save those settings.');
      } else {
        setSettingsSaved(true);
        setOrgStatus(prev => prev ? { ...prev, organisationName: settingsName.trim(), privacyThreshold: threshold } : prev);
        setTimeout(() => setSettingsSaved(false), 3000);
      }
    } catch (e) {
      setMembersError('Could not save those settings.');
    }
    setSavingSettings(false);
  };

  const handleRegenerateCode = async () => {
    if (!orgStatus?.organisationId) return;
    setRegeneratingCode(true);
    try {
      const res = await secureApiFetch(`/api/org/${orgStatus.organisationId}/regenerate-join-code`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) setCurrentJoinCode(data.joinCode);
    } catch (e) {
      // Non-critical - the existing code just stays valid if this fails.
    }
    setRegeneratingCode(false);
  };

  const fetchInvites = async (currentOrgId: string) => {
    setInvitesLoading(true);
    try {
      const res = await secureApiFetch(`/api/org/${currentOrgId}/invites`);
      const data = await res.json();
      if (res.ok) setPendingInvites(data.invites || []);
    } catch (e) {
      // Non-fatal - the rest of the Team & Settings tab still works.
    }
    setInvitesLoading(false);
  };

  const fetchSuggestions = async (currentOrgId: string) => {
    try {
      const res = await secureApiFetch(`/api/org/${currentOrgId}/suggestions`);
      const data = await res.json();
      if (res.ok) setSuggestions(data.suggestions || []);
    } catch (e) {
      // Non-fatal - falls back to the illustrative examples shown below.
    }
  };

  const handleSendInvites = async () => {
    if (!orgStatus?.organisationId || !inviteEmails.trim()) return;
    setSendingInvites(true);
    setInviteResult('');
    try {
      const emails = inviteEmails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
      const res = await secureApiFetch(`/api/org/${orgStatus.organisationId}/invite`, {
        method: 'POST',
        data: { emails },
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteResult(data.error || 'Could not send those invites.');
      } else {
        const sentCount = (data.results || []).filter((r: any) => r.sent).length;
        setInviteResult(`Sent ${sentCount} of ${(data.results || []).length} invites.`);
        setInviteEmails('');
        await fetchInvites(orgStatus.organisationId);
      }
    } catch (e) {
      setInviteResult('Could not send those invites.');
    }
    setSendingInvites(false);
  };

  // Extracts email addresses from an uploaded CSV, regardless of whether it's
  // a bare one-per-line list or a full multi-column export with an "email"
  // header - pulling out anything email-shaped is simpler and more forgiving
  // than requiring a specific column layout, and the person still reviews
  // the extracted list in the textarea before anything actually sends.
  const handleCsvUpload = (file: File) => {
    setCsvError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const found = text.match(/[^\s@,;"']+@[^\s@,;"']+\.[^\s@,;"']+/g) || [];
      const unique = Array.from(new Set(found.map(f => f.toLowerCase())));
      if (unique.length === 0) {
        setCsvError("Couldn't find any email addresses in that file.");
        return;
      }
      setInviteEmails(prev => {
        const existing = prev.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
        const combined = Array.from(new Set([...existing, ...unique]));
        return combined.join('\n');
      });
    };
    reader.onerror = () => setCsvError('Could not read that file.');
    reader.readAsText(file);
  };

  const handleResendInvite = async (email: string) => {
    if (!orgStatus?.organisationId) return;
    setResendingEmail(email);
    try {
      await secureApiFetch(`/api/org/${orgStatus.organisationId}/invite`, {
        method: 'POST',
        data: { emails: [email] },
      });
      await fetchInvites(orgStatus.organisationId);
    } catch (e) {
      // Non-critical - the invite stays listed either way, they can just try again.
    }
    setResendingEmail(null);
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!orgStatus?.organisationId) return;
    setCancelingInviteId(inviteId);
    try {
      await secureApiFetch(`/api/org/${orgStatus.organisationId}/invites/${inviteId}/cancel`, { method: 'POST' });
      await fetchInvites(orgStatus.organisationId);
    } catch (e) {
      // Non-critical - the invite just stays listed if this fails.
    }
    setCancelingInviteId(null);
  };

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
           { id: 'moments', label: 'Blaze Bright Moments', icon: Sparkles },
           { id: 'team', label: 'Team & Settings', icon: Users }
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
                  {climateData && !climateData.locked && (
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-success bg-success/10 px-3 py-1 rounded-full border border-success/20">
                      <ShieldCheck className="w-3 h-3" /> {climateData.responseCount} responses this quarter
                    </div>
                  )}
                </div>
                <h3 className="text-4xl sm:text-5xl font-display font-bold text-text-main tracking-tight leading-tight mb-4">
                  Measure Conditions, Not People.
                </h3>
                <p className="text-base text-text-muted font-medium leading-relaxed max-w-2xl">
                  A real, HSE-aligned climate survey across your six work-design areas — Demands, Control, Support, Relationships, Role, and Change. Individual responses are never shown; only combined averages, once enough teammates have responded.
                </p>
              </div>
            </div>

            {climateData?.locked ? (
              <div className="card space-y-4 text-center py-12">
                <ShieldCheck className="w-10 h-10 mx-auto text-text-muted" />
                <h4 className="font-bold text-text-main">Not Enough Responses Yet</h4>
                <p className="text-sm text-text-muted max-w-md mx-auto">
                  {climateData.cohortSize} of {climateData.threshold} needed teammates have completed the survey this quarter. Ask your team to take it from their own Privacy Centre — it takes about a minute.
                </p>
              </div>
            ) : climateData?.averages ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="card space-y-6">
                  <div>
                    <h4 className="font-bold text-text-main">Team Climate, Six Dimensions</h4>
                    <p className="text-xs text-text-muted">Average score per dimension (1–5), from real survey responses.</p>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart
                        cx="50%" cy="50%" outerRadius="75%"
                        data={[
                          { subject: 'Demands', value: climateData.averages.demands },
                          { subject: 'Control', value: climateData.averages.control },
                          { subject: 'Support', value: climateData.averages.support },
                          { subject: 'Relationships', value: climateData.averages.relationships },
                          { subject: 'Role', value: climateData.averages.role },
                          { subject: 'Change', value: climateData.averages.change },
                        ]}
                      >
                        <PolarGrid stroke="#78716c" strokeOpacity={0.3} />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#78716c', fontSize: 11, fontWeight: 600 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                        <Radar name="Team Average" dataKey="value" stroke="#ea580c" fill="#ea580c" fillOpacity={0.35} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #3a3532', borderRadius: '8px' }}
                          itemStyle={{ color: '#fff', fontSize: '12px' }}
                          formatter={(value: any) => [`${value}/5`, 'Average']}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card space-y-4">
                  <h4 className="font-bold text-text-main">Breakdown</h4>
                  <div className="space-y-3">
                    {Object.entries(climateData.averages).map(([dim, value]) => (
                      <div key={dim} className="flex items-center justify-between">
                        <span className="text-sm text-text-main capitalize">{dim}</span>
                        <div className="flex items-center gap-3 flex-1 max-w-[60%]">
                          <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${(value / 5) * 100}%` }} />
                          </div>
                          <span className="text-xs font-mono font-bold text-text-main w-8 text-right">{value}/5</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted pt-3 border-t border-border">
                    Response rate: {climateData.responseRate}% of opted-in teammates this quarter.
                  </p>
                </div>
              </div>
            ) : (
              <div className="card space-y-4 text-center py-12">
                <Lock className="w-10 h-10 mx-auto text-text-muted" />
                <p className="text-sm text-text-muted max-w-md mx-auto">No survey data available yet.</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Action Library & Anonymous Voice */}
              <div className="space-y-6">
                <div className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare className="w-5 h-5 text-warning" />
                    <h4 className="font-bold text-text-main">{suggestions.length > 0 ? 'Anonymous Team Voice' : 'Example Coaching Themes'}</h4>
                  </div>
                  {suggestions.length > 0 ? (
                    <>
                      <p className="text-xs text-text-muted mb-4">Submitted anonymously by your team — no name or account is ever attached to these.</p>
                      <div className="space-y-3">
                        {suggestions.map((s) => (
                          <div key={s.id} className="flex items-start gap-4 p-3 bg-surface border border-border rounded-xl">
                            <div className="w-8 h-8 rounded-full bg-surface dark:bg-surface flex items-center justify-center shrink-0 font-bold text-xs text-text-muted">
                              <Lightbulb className="w-4 h-4" />
                            </div>
                            <p className="text-sm font-medium text-text-main">"{s.message}"</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-text-muted mb-4">Illustrative starting points — no anonymous suggestions submitted yet. Your team can submit one from their own Privacy Centre, and real ones will show up here instead.</p>
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
                    </>
                  )}
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

        {activeSubTab === 'team' && (
          <motion.div key="team" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-8 pb-24">
            {membersError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl">{membersError}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <h4 className="font-bold text-text-main flex items-center gap-2"><Users className="w-5 h-5 text-primary" /> Team Roster ({members.length})</h4>
                {membersLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : members.length === 0 ? (
                  <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
                    <p className="text-text-muted text-sm">No members yet — share your join code to get your team started.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map(member => {
                      const isSelf = member.uid === auth.currentUser?.uid;
                      return (
                      <div key={member.uid} className="card flex items-center justify-between p-4">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-text-main truncate">{member.displayName || member.email || member.uid}</p>
                          {member.email && member.displayName && (
                            <p className="text-xs text-text-muted truncate">{member.email}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isSelf ? (
                            <span className="text-xs font-bold uppercase tracking-widest text-text-muted bg-surface px-2 py-1 rounded">You</span>
                          ) : member.isAdmin ? (
                            <button
                              onClick={() => handleRevokeAdmin(member.uid)}
                              disabled={memberActionUid === member.uid}
                              className="text-xs font-bold text-primary hover:opacity-70 transition-opacity flex items-center gap-1 disabled:opacity-50"
                              title="Revoke admin access"
                            >
                              {memberActionUid === member.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                              Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMakeAdmin(member.uid)}
                              disabled={memberActionUid === member.uid}
                              className="text-xs font-bold text-text-muted hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-50"
                              title="Make organisation admin"
                            >
                              <ShieldPlus className="w-3.5 h-3.5" /> Make Admin
                            </button>
                          )}
                          {!isSelf && (
                            <button
                              onClick={() => setMemberToRemove({ uid: member.uid, label: member.displayName || member.email || 'this person' })}
                              disabled={memberActionUid === member.uid}
                              className="text-xs font-bold text-text-muted hover:text-destructive transition-colors flex items-center gap-1 disabled:opacity-50"
                              title="Remove from organisation"
                            >
                              {memberActionUid === member.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="card space-y-4">
                  <h4 className="font-bold text-text-main text-sm">Organisation Settings</h4>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1.5">Display Name</label>
                    <input
                      type="text"
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-text-muted block mb-1.5">Minimum Cohort Size</label>
                    <input
                      type="number"
                      min="3"
                      max="100"
                      value={settingsThreshold}
                      onChange={(e) => setSettingsThreshold(e.target.value)}
                      className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:border-primary"
                    />
                    <p className="text-[11px] text-text-muted mt-1">Aggregate dashboards stay locked below this many opted-in members.</p>
                  </div>
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="w-full py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : settingsSaved ? <ShieldCheck className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {settingsSaved ? 'Saved' : 'Save Settings'}
                  </button>
                </div>

                <div className="card space-y-3">
                  <h4 className="font-bold text-text-main text-sm">Join Code</h4>
                  <p className="text-xs text-text-muted">Share this with employees so they can link their account.</p>
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-lg font-bold text-text-main bg-surface px-3 py-2 rounded-lg border border-border tracking-widest flex-1 text-center">{currentJoinCode}</div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(currentJoinCode); }}
                      className="p-2 text-text-muted hover:text-primary transition-colors"
                      title="Copy join code"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={handleRegenerateCode}
                    disabled={regeneratingCode}
                    className="w-full py-2 border border-border rounded-xl text-xs font-bold text-text-muted hover:text-text-main transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {regeneratingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Regenerate Code
                  </button>
                  <p className="text-[11px] text-text-muted">Regenerating invalidates the old code — anyone who hasn't joined yet will need the new one.</p>
                </div>

                <div className="card space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-text-main text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Invite by Email</h4>
                    <label className="text-[11px] font-bold uppercase tracking-widest text-primary hover:opacity-80 transition-opacity cursor-pointer flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" /> Upload CSV
                      <input
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCsvUpload(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-text-muted">One email per line, or separated by commas. Up to 50 at once.</p>
                  {csvError && (
                    <div className="p-2.5 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg">{csvError}</div>
                  )}
                  {inviteResult && (
                    <div className="p-2.5 bg-primary/5 border border-primary/20 text-primary text-xs rounded-lg">{inviteResult}</div>
                  )}
                  <textarea
                    value={inviteEmails}
                    onChange={(e) => setInviteEmails(e.target.value)}
                    placeholder="jane@company.com&#10;alex@company.com"
                    className="w-full h-20 bg-surface border border-border rounded-xl p-3 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary resize-none font-mono"
                  />
                  <button
                    onClick={handleSendInvites}
                    disabled={sendingInvites || !inviteEmails.trim()}
                    className="w-full py-2.5 bg-primary hover:opacity-90 text-primary-foreground text-xs font-bold uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sendingInvites ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send Invites
                  </button>

                  {!invitesLoading && pendingInvites.length > 0 && (
                    <div className="pt-3 border-t border-border space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Pending ({pendingInvites.length})</span>
                      {pendingInvites.map(invite => (
                        <div key={invite.id} className="flex items-center justify-between text-xs">
                          <span className="text-text-main truncate">{invite.email}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {!invite.emailSent && (
                              <span className="text-[10px] text-warning uppercase font-bold">No email sent</span>
                            )}
                            <button
                              onClick={() => handleResendInvite(invite.email)}
                              disabled={resendingEmail === invite.email}
                              className="text-text-muted hover:text-primary transition-colors disabled:opacity-50"
                              title="Resend invite"
                            >
                              {resendingEmail === invite.email ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleCancelInvite(invite.id)}
                              disabled={cancelingInviteId === invite.id}
                              className="text-text-muted hover:text-destructive transition-colors disabled:opacity-50"
                              title="Cancel invite"
                            >
                              {cancelingInviteId === invite.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {memberToRemove && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setMemberToRemove(null)}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/50" />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative card bg-card border border-border shadow-lg p-6 max-w-sm w-full space-y-4"
            >
              <div>
                <h4 className="text-lg font-bold text-text-main">Remove {memberToRemove.label}?</h4>
                <p className="text-sm text-text-muted mt-2">
                  They'll be unlinked from {orgStatus?.organisationName || 'this organisation'} and their data-sharing consent will be turned off. This doesn't affect their own Blaze Break account or personal data.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setMemberToRemove(null)}
                  className="flex-1 px-4 py-2.5 border border-border rounded-xl text-sm font-bold text-text-muted hover:text-text-main transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRemoveMember(memberToRemove.uid)}
                  disabled={memberActionUid === memberToRemove.uid}
                  className="flex-1 px-4 py-2.5 bg-destructive text-destructive-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {memberActionUid === memberToRemove.uid ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
