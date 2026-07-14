import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  Zap, 
  Target, 
  ArrowRight, 
  CheckCircle2, 
  Calendar, 
  ShieldAlert, 
  Sparkles, 
  AlertCircle, 
  RefreshCw, 
  Settings 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';
import { useAuth } from '../lib/auth';

interface MicroRecoveryProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type Duration = '30s' | '2m' | '5m' | '10m' | '20m';

const ACTIONS: Record<Duration, { time: string, description: string, details: string[] }> = {
  '30s': {
    time: '30 Seconds',
    description: 'Rapid physiological interrupt.',
    details: [
      'Stand up immediately.',
      'Unclench your jaw and drop your shoulders.',
      'Take one deep double-inhale and a long exhale.',
      'Look at something 20 feet away.'
    ]
  },
  '2m': {
    time: '2 Minutes',
    description: 'Quick recalibration protocol.',
    details: [
      'Stand up, unclench your jaw, breathe slowly.',
      'Drink a full glass of water.',
      'Choose one thing to remove from today’s list.',
      'Send one boundary message ("I will look at this tomorrow").'
    ]
  },
  '5m': {
    time: '5 Minutes',
    description: 'Nervous system downshift.',
    details: [
      'Close your laptop and step away from the desk.',
      'Do 5 rounds of Box Breathing (4s in, 4s hold, 4s out, 4s hold).',
      'Stretch your neck and back.',
      'Review your top 3 priorities, delete everything else.'
    ]
  },
  '10m': {
    time: '10 Minutes',
    description: 'Cognitive reset.',
    details: [
      'Walk outside or do a quick lap around the office/house.',
      'No phone, no notifications.',
      'Just observe your surroundings (Name 5 things you see).',
      'Return to work and focus only on the next physical action.'
    ]
  },
  '20m': {
    time: '20 Minutes',
    description: 'Deep somatic rest.',
    details: [
      'Lie down on the floor or a comfortable surface.',
      'Set an alarm for 15 minutes of non-sleep deep rest (NSDR).',
      'After the alarm, drink water and slowly transition back.',
      'Acknowledge that rest is a high-performance requirement.'
    ]
  }
};

interface CalendarEvent {
  summary: string;
  start: string; // ISO or human display
  end: string;   // ISO or human display
  durationMinutes: number;
}

interface BreakSuggestion {
  id: string;
  sourceType: 'back_to_back' | 'prolonged';
  meetingA: string;
  meetingB?: string;
  timeLabel: string;
  reason: string;
  recommendedDuration: Duration;
}

const MOCK_EVENTS = [
  { summary: "Quarterly Org Alignment Sync", start: "10:00", end: "11:30", durationMinutes: 90 },
  { summary: "Escalation & Backlog Crisis Grooming", start: "11:30", end: "12:30", durationMinutes: 60 },
  { summary: "Performance evaluation marathon", start: "14:00", end: "16:00", durationMinutes: 120 }
];

export const MicroRecovery = ({ fingerprint, onAwardPoints }: MicroRecoveryProps) => {
  const { accessToken, signInWithCalendar } = useAuth();
  
  const [selectedDuration, setSelectedDuration] = useState<Duration | null>(null);
  const [inProgress, setInProgress] = useState(false);
  const [completed, setCompleted] = useState(false);
  
  // Google Calendar Integration states
  const [isDemoMode, setIsDemoMode] = useState(true);
  const [realEvents, setRealEvents] = useState<CalendarEvent[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BreakSuggestion[]>([]);

  // Calculate suggestions based on active mode
  useEffect(() => {
    const activeEvents = isDemoMode ? MOCK_EVENTS : realEvents;
    const computedSuggestions: BreakSuggestion[] = [];

    for (let i = 0; i < activeEvents.length; i++) {
      const current = activeEvents[i];
      
      // Prolonged meeting rule: over 90 mins
      if (current.durationMinutes >= 90) {
        computedSuggestions.push({
          id: `prolonged-${i}`,
          sourceType: 'prolonged',
          meetingA: current.summary,
          timeLabel: `${current.start} - ${current.end}`,
          reason: `"${current.summary}" runs for ${current.durationMinutes}m, triggering heavy neural fatigue.`,
          recommendedDuration: current.durationMinutes >= 120 ? '10m' : '5m'
        });
      }

      // Back-to-back meeting rule: gap <= 10 mins
      const next = activeEvents[i + 1];
      if (next) {
        // Simple time calculations for the mock or real strings
        let gapMinutes = 15; // default safe
        if (isDemoMode) {
          if (current.end === next.start) {
            gapMinutes = 0;
          }
        } else {
          // Parse as date objects if they are full ISO dates
          try {
            const endMs = new Date(current.end).getTime();
            const startMs = new Date(next.start).getTime();
            gapMinutes = Math.floor((startMs - endMs) / 60000);
          } catch (e) {
            gapMinutes = 5;
          }
        }

        if (gapMinutes <= 10 && gapMinutes >= 0) {
          computedSuggestions.push({
            id: `b2b-${i}`,
            sourceType: 'back_to_back',
            meetingA: current.summary,
            meetingB: next.summary,
            timeLabel: `${current.end} transition`,
            reason: `Back-to-back meetings without downtime: "${current.summary}" and "${next.summary}".`,
            recommendedDuration: '2m'
          });
        }
      }
    }

    setSuggestions(computedSuggestions);
  }, [isDemoMode, realEvents]);

  const fetchRealCalendar = async () => {
    if (!accessToken) return;
    setLoadingCalendar(true);
    setCalendarError(null);
    try {
      // Find today start / end
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startOfDay)}&timeMax=${encodeURIComponent(endOfDay)}&singleEvents=true&orderBy=startTime`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        throw new Error(`Google API returned status ${res.status}`);
      }
      const data = await res.json();
      
      if (data.items) {
        const parsed: CalendarEvent[] = data.items
          .filter((item: any) => item.start?.dateTime && item.end?.dateTime)
          .map((item: any) => {
            const startDt = new Date(item.start.dateTime);
            const endDt = new Date(item.end.dateTime);
            const diffMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
            
            const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

            return {
              summary: item.summary || 'Focus Event',
              start: startDt.toISOString(), // keep ISO for computation
              end: endDt.toISOString(),
              durationMinutes: diffMin,
              // for display
              displayStart: formatTime(startDt),
              displayEnd: formatTime(endDt)
            };
          });

        // Map format times for compute
        const formatted = parsed.map(ev => ({
          ...ev,
          start: (ev as any).displayStart || ev.start,
          end: (ev as any).displayEnd || ev.end
        }));

        setRealEvents(formatted);
        setIsDemoMode(false);
      } else {
        setRealEvents([]);
      }
    } catch (e: any) {
      console.error(e);
      setCalendarError(`Authorization complete but failed to pull events: ${e.message || e}. Using demo simulation.`);
      setIsDemoMode(true);
    } finally {
      setLoadingCalendar(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchRealCalendar();
    }
  }, [accessToken]);

  const handleStart = () => {
    setInProgress(true);
  };

  const handleComplete = () => {
    setInProgress(false);
    setCompleted(true);
    if (selectedDuration) {
      const activeAction = ACTIONS[selectedDuration];
      localStorage.setItem('blaze_micro_recovery', JSON.stringify({
        duration: selectedDuration,
        time: activeAction.time,
        description: activeAction.description,
        details: activeAction.details,
        completedAt: new Date().toISOString()
      }));
    }
    if (onAwardPoints) onAwardPoints(10, 'Micro-Recovery Protocol Completed');
    setTimeout(() => {
      setSelectedDuration(null);
      setCompleted(false);
    }, 3000);
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 0 / Micro-Interventions</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Micro-Recovery Menu</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "How much time do you have? Pick an intervention or sync GCal for smart recommendations."
            </p>
          </div>
        </div>
      </div>

      {/* Google Calendar Smart Recommendation Panel */}
      <div className="card p-6 border-primary/20 bg-primary/5 rounded-2xl space-y-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <h4 className="text-lg font-bold text-text-main flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Google Calendar Break Advisor
              {isDemoMode ? (
                <span className="text-[11px] px-2 py-0.5 bg-primary/10 text-primary font-black uppercase tracking-widest rounded-full">Demo Simulation</span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 bg-success/10 text-success font-black uppercase tracking-widest rounded-full">Live Connected</span>
              )}
            </h4>
            <p className="text-xs text-text-muted max-w-xl">
              Nova scans your calendar for meetings over 90 mins or back-to-backs to suggest restorative buffers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {accessToken ? (
              <button 
                onClick={fetchRealCalendar}
                disabled={loadingCalendar}
                className="btn-primary py-2.5 px-4 text-xs tracking-widest uppercase font-black bg-surface hover:bg-border dark:bg-surface dark:hover:bg-surface text-text-main border-none flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loadingCalendar && "animate-spin")} />
                {loadingCalendar ? "Syncing..." : "Sync Events"}
              </button>
            ) : (
              <button 
                onClick={signInWithCalendar}
                className="btn-primary py-2.5 px-4 text-xs tracking-widest uppercase font-black bg-primary text-primary-foreground flex items-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                Connect Calendar
              </button>
            )}

            <button
              onClick={() => setIsDemoMode(!isDemoMode)}
              className="py-2 px-3 border border-border bg-white dark:bg-card text-xs uppercase font-black tracking-widest text-text-muted hover:text-text-main rounded-xl cursor-pointer"
            >
              {isDemoMode ? "See Sandbox" : "Load Demo Sandbox"}
            </button>
          </div>
        </div>

        {calendarError && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-xl border border-rose-200/50 text-xs text-rose-700 dark:text-destructive flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{calendarError}</span>
          </div>
        )}

        {/* Suggested Interventions */}
        <div className="space-y-3 relative z-10">
          <label className="text-xs uppercase tracking-widest font-black text-text-muted flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-primary" /> Active Fatigue Risks Detected
          </label>

          {suggestions.length === 0 ? (
            <div className="p-8 bg-white dark:bg-card border border-dashed border-border rounded-xl text-center space-y-1">
              <p className="text-xs font-bold text-text-main">No Immediate Risks Blocked</p>
              <p className="text-xs text-text-muted leading-relaxed">Today's meeting schedules are spacious. Keep buffers and rest intervals stable.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suggestions.map(s => (
                <div 
                  key={s.id}
                  className="p-4 bg-white dark:bg-card border border-border rounded-xl space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-warning/10 text-warning dark:text-warning rounded-full">
                        {s.sourceType === 'back_to_back' ? 'Back-to-Back Gap Risk' : 'Prolonged Focus Strain'}
                      </span>
                      <span className="text-xs font-mono text-text-muted">{s.timeLabel}</span>
                    </div>
                    <p className="text-xs text-text-main font-bold leading-relaxed">
                      {s.reason}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedDuration(s.recommendedDuration);
                      setInProgress(false);
                      setCompleted(false);
                      
                      // Smooth scroll down to intervention card
                      setTimeout(() => {
                        document.getElementById('recovery-protocol-anchor')?.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    }}
                    className="w-full py-2 bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary text-[11px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Apply Suggested Break ({ACTIONS[s.recommendedDuration].time})
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {(Object.keys(ACTIONS) as Duration[]).map((duration) => (
           <button
             key={duration}
             onClick={() => {
               setSelectedDuration(duration);
               setInProgress(false);
               setCompleted(false);
             }}
             className={cn(
               "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
               selectedDuration === duration
                 ? "bg-primary border-primary text-primary-foreground shadow-xl shadow-primary/20 scale-105 z-10"
                 : "glass hover:border-primary/50 text-text-main hover:bg-surface dark:hover:bg-surface"
             )}
           >
             <div className="flex flex-col gap-2 relative z-10">
               <Clock className={cn("w-6 h-6", selectedDuration === duration ? "text-white" : "text-primary")} />
               <span className="text-2xl font-display font-black">{ACTIONS[duration].time}</span>
             </div>
             {selectedDuration === duration && (
               <motion.div layoutId="duration-highlight" className="absolute inset-0 bg-primary/20 blur-xl" />
             )}
           </button>
        ))}
      </div>

      {/* Anchor point for scrolling */}
      <div id="recovery-protocol-anchor" />

      <AnimatePresence mode="wait">
        {selectedDuration && !completed && (
          <motion.div
            key={selectedDuration}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="card glass border-primary/20 bg-primary/5 p-10 relative overflow-hidden"
          >
            <div className="relative z-10 space-y-8">
              <div className="space-y-2">
                <h4 className="text-3xl font-display font-bold text-text-main">
                  Nova Protocol: {ACTIONS[selectedDuration].time}
                </h4>
                <p className="text-lg text-text-muted font-medium">
                  {ACTIONS[selectedDuration].description}
                </p>
              </div>

              <div className="space-y-4">
                {ACTIONS[selectedDuration].details.map((detail, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-start gap-4 bg-white/50 dark:bg-surface/50 p-4 rounded-xl border border-border/50"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <ArrowRight className="w-3 h-3 font-black" />
                    </div>
                    <span className="text-text-main font-bold text-lg">{detail}</span>
                  </motion.div>
                ))}
              </div>

              <div className="pt-6 border-t border-border/50 flex items-center justify-end">
                 {!inProgress ? (
                   <button onClick={handleStart} className="btn-primary">
                     <Target className="w-4 h-4" />
                     Begin Integration
                   </button>
                 ) : (
                   <button onClick={handleComplete} className="btn-primary bg-primary hover:bg-primary border-primary">
                     <CheckCircle2 className="w-4 h-4" />
                     Mark as Completed
                   </button>
                 )}
              </div>
            </div>
            <div className="absolute right-[-10%] top-[-10%] w-96 h-96 bg-primary/10 rounded-full blur-[100px]" />
          </motion.div>
        )}

        {completed && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card glass border-success/20 bg-success/5 p-10 flex flex-col items-center justify-center text-center py-20"
          >
             <div className="w-20 h-20 bg-success rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-success/20">
               <CheckCircle2 className="w-10 h-10" />
             </div>
             <h4 className="text-3xl font-display font-bold text-text-main mb-2">Protocol Executed</h4>
             <p className="text-lg text-text-muted font-medium">Neural and physiological baseline adjusted. Points awarded.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
