import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, AlertTriangle, ShieldCheck, Clock, CheckCircle2, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { secureApiFetch } from '../lib/secure-api';
import { syncCalendarSignal } from '../lib/calendar-signals';
import {
  CalendarSignalState, RedZone, computeRedZones, hasAnyElevatedZone, isCalendarSignalFresh,
} from '../../calendar-workload-defence-engine';

const LEVEL_BADGE_CLASSES: Record<RedZone['level'], string> = {
  high: 'bg-destructive/10 text-destructive dark:text-[#f87171] border-destructive/20',
  moderate: 'bg-warning/10 text-[#9a3412] dark:text-warning border-warning/20',
  none: 'bg-success/10 text-[#166534] dark:text-[#4ade80] border-success/20',
};

const LEVEL_LABELS: Record<RedZone['level'], string> = { high: 'High', moderate: 'Moderate', none: 'Clear' };

// Demo visitors see the same banded-card layout as a real synced calendar,
// built from fixed illustrative counts run through the real computeRedZones
// engine - never a separate hand-written set of "Tuesday 1-5pm" cards that
// don't correspond to anything the engine would ever actually produce.
const DEMO_SIGNAL: CalendarSignalState = {
  totalMeetingHours: 24.5,
  meetingCount: 19,
  backToBackCount: 4,
  eveningMeetingCount: 3,
  weekendMeetingCount: 1,
  windowDays: 7,
  updatedAt: new Date().toISOString(),
};

export const CalendarDefenseView = ({ isDemoSession, onNavigate }: { isDemoSession?: boolean; onNavigate?: (tab: string) => void }) => {
  const { accessToken, signInWithCalendar } = useAuth();
  const [loading, setLoading] = useState(!isDemoSession);
  const [syncing, setSyncing] = useState(false);
  const [signal, setSignal] = useState<CalendarSignalState | null>(isDemoSession ? DEMO_SIGNAL : null);

  const loadSignal = useCallback(async () => {
    try {
      const res = await secureApiFetch('/api/signals/calendar');
      const data = await res.json();
      setSignal(data?.state || null);
    } catch (e) {
      // Leaves whatever was already shown in place rather than clearing it on a transient fetch error.
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isDemoSession) return;
    loadSignal();
  }, [isDemoSession, loadSignal]);

  const handleSync = async () => {
    if (syncing) return;
    if (!accessToken) {
      signInWithCalendar();
      return;
    }
    setSyncing(true);
    try {
      await syncCalendarSignal(accessToken);
      await loadSignal();
    } finally {
      setSyncing(false);
    }
  };

  const fresh = isDemoSession || isCalendarSignalFresh(signal);
  const zones = fresh && signal ? computeRedZones(signal) : [];
  const elevated = hasAnyElevatedZone(zones);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-text-main tracking-tight">Calendar Workload Defence</h2>
          <p className="text-sm text-text-muted mt-2 font-mono uppercase tracking-widest">Real Signal / Overload Warning</p>
        </div>
        {!isDemoSession && signal && (
          <button onClick={handleSync} disabled={syncing} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Re-sync Calendar'}
          </button>
        )}
      </div>

      {isDemoSession && (
        <div className="px-4 py-3 bg-primary/10 border border-primary/20 text-text-main rounded-xl flex items-center gap-3 text-sm font-medium">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
          Demo sample data shown below - connect your own Google Calendar to see your real weekly load.
        </div>
      )}

      {!isDemoSession && !fresh && (
        <div className="card border-border bg-surface p-6 sm:p-8 md:p-12 text-center flex flex-col items-center justify-center space-y-6">
          <div className="w-20 h-20 bg-card rounded-full border border-primary/20 flex items-center justify-center">
            <Calendar className="w-8 h-8 text-primary" />
          </div>
          <div className="max-w-md space-y-3">
            <h3 className="text-xl font-bold text-text-main tracking-tight">See Your Real Meeting Load</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              {signal
                ? "Your last calendar sync is more than 2 weeks old, so it's treated as missing rather than shown as a stale snapshot. Sync again to see your current load."
                : "Connect your Google Calendar to see back-to-back meetings, evening/weekend load, and total meeting hours from your own last 7 days - no sample data, your real schedule."}
            </p>
          </div>
          <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2">
            {syncing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Syncing...</>
            ) : accessToken ? (
              <><RefreshCw className="w-4 h-4" /> Sync My Calendar</>
            ) : (
              <><ShieldCheck className="w-4 h-4" /> Connect Calendar</>
            )}
          </button>
        </div>
      )}

      {fresh && signal && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className={`px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-bold tracking-wide ${elevated ? 'bg-destructive/10 border border-destructive/20 text-destructive' : 'bg-success/10 border border-success/20 text-[#166534] dark:text-[#4ade80]'}`}>
            {elevated ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            {elevated
              ? `Based on your last ${signal.windowDays} days - one or more load patterns are elevated.`
              : `Based on your last ${signal.windowDays} days - no elevated load patterns found.`}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {zones.map((zone) => (
              <div key={zone.key} className={`card p-6 border relative overflow-hidden group ${zone.level === 'high' ? 'border-destructive/30' : zone.level === 'moderate' ? 'border-warning/30' : 'border-border'}`}>
                <div className="flex justify-between items-start mb-6">
                  <h4 className="text-lg font-bold text-text-main">{zone.label}</h4>
                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded border ${LEVEL_BADGE_CLASSES[zone.level]}`}>
                    {LEVEL_LABELS[zone.level]}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-text-main">
                  <Clock className="w-4 h-4 text-text-muted shrink-0" /> {zone.detail}
                </div>
              </div>
            ))}
          </div>

          <div className="card p-6 border-border mt-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-text-main mb-1">
                  {elevated ? 'Push back on what you can' : 'Nothing to push back on right now'}
                </h4>
                <p className="text-xs text-text-muted leading-relaxed">
                  {elevated
                    ? 'Boundary Architect can help you draft a real decline or renegotiation for a specific meeting - nothing is sent without your review.'
                    : "Your load looks clear this week. If that changes, Boundary Architect is where you'd draft a real pushback."}
                </p>
              </div>
              {onNavigate && (
                <button onClick={() => onNavigate('communicate')} className="btn-secondary shrink-0 flex items-center gap-2 text-xs">
                  Boundary Architect <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
