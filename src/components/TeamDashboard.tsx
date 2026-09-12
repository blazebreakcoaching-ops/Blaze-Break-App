import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { secureApiFetch } from '../lib/secure-api';
import { cn } from '../lib/utils';
import { Users, Lock, Loader2, AlertTriangle, ShieldCheck, ArrowUp, ArrowDown, Minus, HeartPulse } from 'lucide-react';

interface TeamIndicator {
  key: string;
  label: string;
  level: number | null;
  severity: 'low' | 'moderate' | 'elevated' | null;
  direction: 'improving' | 'worsening' | 'stable' | 'unknown';
  delta: number | null;
  note: string;
}

interface TeamEntry {
  team: string;
  locked: boolean;
  cohortSize: number;
  threshold: number;
  overallConcern?: number | null;
  moodConcern?: number | null;
  climateConcern?: number | null;
  engagementRate?: number;
  indicators?: TeamIndicator[];
  nudge?: { title: string; message: string } | null;
}

const sevClasses: Record<string, string> = {
  elevated: 'bg-destructive/10 text-destructive dark:text-[#f87171] border-destructive/20',
  moderate: 'bg-warning/10 text-[#9a3412] dark:text-warning border-warning/20',
  low: 'bg-success/10 text-[#166534] dark:text-[#4ade80] border-success/20',
};

const dirClasses: Record<string, string> = {
  worsening: 'text-destructive dark:text-[#f87171]',
  improving: 'text-[#166534] dark:text-[#4ade80]',
  stable: 'text-text-muted',
  unknown: 'text-text-muted',
};

const DirIcon = ({ direction }: { direction: TeamIndicator['direction'] }) =>
  direction === 'worsening' ? <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
  : direction === 'improving' ? <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
  : <Minus className="w-3.5 h-3.5" aria-hidden="true" />;

// The manager's own view of their team(s): aggregate, anonymised
// strain/engagement signals only - never anything at the level of a named
// person. Reuses the exact visual vocabulary OrgDashboard.tsx already
// established (severity badges, direction colors/icons, locked-state
// panel) so this reads as the same product, not a different one.
export const TeamDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [ackNotes, setAckNotes] = useState<Record<string, string>>({});
  const [acknowledgingTeam, setAcknowledgingTeam] = useState<string | null>(null);
  const [ackConfirmed, setAckConfirmed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const meRes = await secureApiFetch('/api/org/me');
        const me = await meRes.json();
        if (!me.organisationId) {
          setError('no_org');
          setLoading(false);
          return;
        }
        setOrgId(me.organisationId);
        const res = await secureApiFetch(`/api/org/${me.organisationId}/team-dashboard`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Could not load your team dashboard.');
        } else {
          setTeams(data.teams || []);
        }
      } catch (e) {
        setError('Could not load your team dashboard.');
      }
      setLoading(false);
    };
    load();
  }, []);

  // A factual "I addressed this" record HR can read - not a verified fact,
  // and never a score. See docs/TEAM_WELFARE_DASHBOARDS.md.
  const handleAcknowledge = async (team: string) => {
    if (!orgId) return;
    setAcknowledgingTeam(team);
    try {
      const res = await secureApiFetch(`/api/org/${orgId}/team-dashboard/${encodeURIComponent(team)}/acknowledge`, {
        method: 'POST',
        data: { note: ackNotes[team]?.trim() || undefined },
      });
      if (res.ok) {
        setAckConfirmed(prev => ({ ...prev, [team]: true }));
        setAckNotes(prev => ({ ...prev, [team]: '' }));
      }
    } catch (e) {
      // Non-critical - the manager can just try again.
    }
    setAcknowledgingTeam(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error === 'no_org') {
    return null; // Nothing to show - shouldn't normally happen since the nav entry itself is gated on managing a team.
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-destructive/5 border border-dashed border-destructive/20 rounded-xl">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-text-muted text-sm max-w-md">{error}</p>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-surface dark:bg-surface/50 rounded-xl border border-dashed border-border">
        <Users className="w-12 h-12 text-text-muted mb-4" />
        <h3 className="text-xl font-bold text-text-main mb-2">No Team Assigned</h3>
        <p className="text-text-muted text-sm max-w-md">You aren't currently designated as the manager of a team. Ask your org admin if this is unexpected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h3 className="text-xl font-bold text-text-main flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" /> My Team
      </h3>
      <AnimatePresence mode="wait">
        {teams.map((entry) => (
          <motion.div key={entry.team} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-6">
            <h4 className="font-bold text-text-main text-lg">{entry.team}</h4>

            {entry.locked ? (
              <div className="flex flex-col items-center justify-center p-6 text-center bg-surface dark:bg-surface/50 rounded-xl border border-dashed border-border">
                <Lock className="w-10 h-10 text-text-muted mb-3" />
                <h5 className="font-bold text-text-main mb-1">Insufficient Cohort Size</h5>
                <p className="text-text-muted text-sm max-w-md">
                  {entry.cohortSize} of {entry.threshold} required teammates on this team have opted in to anonymised sharing so far. Aggregate insight only becomes available once enough people have joined in, to keep any one person from being identifiable.
                </p>
              </div>
            ) : (
              <>
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3 text-sm font-medium text-text-main">
                  <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                  <span><strong>Privacy Rule Active:</strong> Aggregated and anonymised. Cohort size: {entry.cohortSize} teammates.</span>
                </div>

                {entry.nudge && (
                  <div role="status" className="bg-warning/10 border border-warning/20 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <HeartPulse className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="font-bold text-text-main text-sm">{entry.nudge.title}</p>
                        <p className="text-text-muted text-sm mt-0.5">{entry.nudge.message}</p>
                      </div>
                    </div>
                    {ackConfirmed[entry.team] ? (
                      <p
                        ref={(el) => { el?.focus(); }}
                        tabIndex={-1}
                        className="text-xs font-bold text-[#166534] dark:text-[#4ade80] pl-8"
                      >
                        Logged - thank you.
                      </p>
                    ) : (
                      <div className="pl-8 space-y-2">
                        <label htmlFor={`ack-note-${entry.team}`} className="sr-only">Optional note about how you addressed this</label>
                        <input
                          id={`ack-note-${entry.team}`}
                          type="text"
                          value={ackNotes[entry.team] || ''}
                          onChange={(e) => setAckNotes(prev => ({ ...prev, [entry.team]: e.target.value }))}
                          placeholder="Optional note, e.g. 'Held a 1:1 on Friday'"
                          maxLength={500}
                          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary/50"
                        />
                        <button
                          onClick={() => handleAcknowledge(entry.team)}
                          disabled={acknowledgingTeam === entry.team}
                          className="text-xs font-bold text-[#9a3412] dark:text-primary hover:opacity-70 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {acknowledgingTeam === entry.team ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          Log that I addressed this
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-surface dark:bg-card/40 border border-border rounded-xl">
                    <span className="text-xs uppercase font-bold tracking-widest text-text-muted block">Engagement This Week</span>
                    <span className="text-3xl font-display font-bold text-text-main block mt-1">
                      {entry.engagementRate != null ? `${entry.engagementRate}%` : '—'}
                    </span>
                    <p className="text-xs text-text-muted mt-1">Share of consenting teammates with any activity in the last 7 days - never who.</p>
                  </div>
                  <div className="p-5 bg-surface dark:bg-card/40 border border-border rounded-xl">
                    <span className="text-xs uppercase font-bold tracking-widest text-text-muted block">Overall Strain</span>
                    <span className="text-3xl font-display font-bold text-text-main block mt-1">
                      {entry.overallConcern != null ? entry.overallConcern : '—'}
                    </span>
                    <p className="text-xs text-text-muted mt-1">Scale 0-100, higher means more strain.</p>
                  </div>
                </div>

                {entry.indicators && entry.indicators.length > 0 && (
                  <ul className="space-y-2.5">
                    {entry.indicators.map((ind) => (
                      <li key={ind.key} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface/60 dark:bg-card/40">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-text-main truncate">{ind.label}</p>
                          <p className={cn('text-xs flex items-center gap-1 mt-0.5', dirClasses[ind.direction])}>
                            {ind.direction !== 'unknown' && <DirIcon direction={ind.direction} />}
                            <span className="text-text-muted">{ind.note}</span>
                          </p>
                        </div>
                        {ind.severity ? (
                          <span className={cn('shrink-0 text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border', sevClasses[ind.severity])}>
                            {ind.severity}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[11px] text-text-muted">no data yet</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
