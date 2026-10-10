import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { secureApiFetch } from '../lib/secure-api';
import { ShieldCheck, Lock, Loader2, AlertTriangle, CheckCircle2, CircleDashed, Calendar, FlaskConical } from 'lucide-react';
import { WorkDesignSignalCard, type WorkDesignSignal } from './WorkDesignSignalCard';
import { WorkDesignDemoPreview } from './WorkDesignDemoPreview';

interface ActiveIntervention {
  id: string;
  proposedChange: string;
  status: string;
}

interface FollowUp {
  status: 'acknowledged' | 'no_recent_acknowledgment';
  lastAcknowledgedAt: string | null;
  lastAcknowledgedBy: string | null;
  note: string | null;
}

interface HrTeamEntry {
  team: string;
  cohortSize: number;
  followUp: FollowUp;
  workDesignSignals?: WorkDesignSignal[];
  activeIntervention?: ActiveIntervention | null;
}

// HR's escalation view: every qualifying team at once (unlike the
// manager's own single-team view), the same aggregate signals a manager
// sees, plus each team's real follow-up status. The follow-up chip is
// deliberately just a factual "acknowledged" / "no acknowledgment yet" -
// never a score or grade on the manager. See
// docs/TEAM_WELFARE_DASHBOARDS.md.
export const HrEscalationDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [cohortSize, setCohortSize] = useState(0);
  const [threshold, setThreshold] = useState(5);
  const [teams, setTeams] = useState<HrTeamEntry[]>([]);

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
        const res = await secureApiFetch(`/api/org/${me.organisationId}/hr-dashboard`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Could not load the HR escalation dashboard.');
        } else {
          setLocked(!!data.locked);
          setCohortSize(data.cohortSize || 0);
          setThreshold(data.threshold || 5);
          setTeams(data.teams || []);
        }
      } catch (e) {
        setError('Could not load the HR escalation dashboard.');
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

  if (error === 'no_org') return null;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-destructive/5 border border-dashed border-destructive/20 rounded-xl">
        <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-text-muted text-sm max-w-md">{error}</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 text-center bg-surface dark:bg-surface/50 rounded-xl border border-dashed border-border">
        <Lock className="w-12 h-12 text-text-muted mb-4" />
        <h3 className="text-xl font-bold text-text-main mb-2">Insufficient Cohort Size</h3>
        <p className="text-text-muted text-sm max-w-md mb-6">
          {cohortSize} of {threshold} required teammates have opted in to anonymised sharing so far.
        </p>
        <WorkDesignDemoPreview />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3 text-sm font-medium text-text-main">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
        <span><strong>Privacy Rule Active:</strong> Aggregated and anonymised, same as every other view. Cohort size: {cohortSize} teammates.</span>
      </div>

      {teams.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
          <p className="text-text-muted text-sm">No team currently has enough consenting members to show here.</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <div className="space-y-4">
            {teams.map((entry) => (
              <motion.div key={entry.team} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-bold text-text-main text-lg">{entry.team}</h4>
                  {entry.followUp.status === 'acknowledged' ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[#166534] dark:text-[#4ade80] bg-success/10 border border-success/20 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Acknowledged {entry.followUp.lastAcknowledgedAt ? new Date(entry.followUp.lastAcknowledgedAt).toLocaleDateString() : ''}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-text-muted bg-surface border border-border px-2.5 py-1 rounded-full">
                      <CircleDashed className="w-3.5 h-3.5" aria-hidden="true" />
                      No recent acknowledgment
                    </span>
                  )}
                </div>

                {entry.followUp.note && (
                  <p className="text-xs text-text-muted italic">"{entry.followUp.note}"</p>
                )}

                {entry.workDesignSignals && entry.workDesignSignals.length > 0 && (
                  <div className="space-y-3">
                    <h5 className="text-xs uppercase font-bold tracking-widest text-text-muted flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" /> Work Design Signals
                    </h5>
                    <ul className="space-y-2.5">
                      {entry.workDesignSignals.map((signal) => (
                        <WorkDesignSignalCard key={signal.key} signal={signal} />
                      ))}
                    </ul>
                    {entry.activeIntervention && (
                      <div className="flex items-center gap-2 text-xs font-bold text-primary bg-primary/5 border border-primary/20 px-3 py-2 rounded-xl">
                        <FlaskConical className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        Trial in progress: {entry.activeIntervention.proposedChange}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
};
