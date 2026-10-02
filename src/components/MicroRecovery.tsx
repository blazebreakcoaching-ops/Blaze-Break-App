import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock,
  CheckCircle2,
  Calendar,
  ShieldAlert,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Users,
  Car,
  Focus,
  CircleDot,
  MinusCircle,
  ListTodo
} from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';
import { useAuth } from '../lib/auth';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { doc, setDoc } from 'firebase/firestore';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { loadLatestCapacityCheckIn, loadStressors } from '../lib/energy-delta-service';
import { computeEnergyDelta } from '../../energy-delta-engine';

interface MicroRecoveryProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
  // A real, already-tracked signal (FocusZone, mounted on the same
  // "Recover" tab) rather than a second, invented detector - "User is in
  // Deep Focus: offer a short visual or physical break."
  isFocusActive?: boolean;
}

type Duration = '30s' | '2m' | '5m' | '10m' | '20m';
const ALL_DURATIONS: Duration[] = ['30s', '2m', '5m', '10m', '20m'];

type SituationId = 'meeting' | 'commuting' | 'deep_focus' | 'none';

const SITUATIONS: { id: SituationId; label: string; icon: any }[] = [
  { id: 'meeting', label: 'In a meeting', icon: Users },
  { id: 'commuting', label: 'Commuting', icon: Car },
  { id: 'deep_focus', label: 'Deep Focus', icon: Focus },
  { id: 'none', label: 'Just need a reset', icon: CircleDot },
];

// Plain-language resets, never implying medical or neurological certainty
// (MICRO-RECOVERY: no "rapid physiological interrupt", "neural reset",
// "nervous system reboot" or "physiological recalibration"), and never
// forcing standing, movement or anything that might not fit the user's
// current environment. The 30-second sequence matches the brief's own
// example line for line.
const DEFAULT_ACTIONS: Record<Duration, { time: string; description: string; details: string[] }> = {
  '30s': {
    time: '30 Seconds',
    description: 'Just reset the next moment.',
    details: [
      'If you can, change your posture.',
      'Let your jaw soften and drop your shoulders.',
      'Take a slow breath in, then a longer breath out.',
      'Look away from the screen and let your eyes rest somewhere farther away.',
    ],
  },
  '2m': {
    time: '2 Minutes',
    description: 'Give yourself a short, real break.',
    details: [
      'Step away from the screen for a moment, if you can.',
      'Get a drink of water.',
      'Let your shoulders and jaw drop.',
      'Take a few slower breaths before you go back.',
    ],
  },
  '5m': {
    time: '5 Minutes',
    description: 'Let things come down a level.',
    details: [
      'Close your laptop or step away from your desk, if you can.',
      'Breathe slowly for a few minutes — in for a count of four, out for a count of four.',
      'Stretch your neck and shoulders gently.',
      "Notice what's actually in front of you right now, not what's next.",
    ],
  },
  '10m': {
    time: '10 Minutes',
    description: 'Properly step out of it for a bit.',
    details: [
      'If you can, go outside or somewhere different.',
      'Leave your phone where it is for a few minutes.',
      'Let your attention rest on your surroundings rather than your thoughts.',
      'Come back when the ten minutes are up, not before.',
    ],
  },
  '20m': {
    time: '20 Minutes',
    description: 'Give yourself a real rest.',
    details: [
      'Find somewhere you can sit or lie down comfortably.',
      "Set a timer so you don't have to keep track.",
      'Let yourself stop, without needing to make it productive.',
      'Ease back in slowly afterwards — a drink of water, a moment before you start again.',
    ],
  },
};

// A genuinely "invisible" seated version for the two durations that still
// make sense mid-meeting - never instructing the user to stand, leave or
// close their eyes.
const MEETING_ACTIONS: Partial<Record<Duration, { description: string; details: string[] }>> = {
  '30s': {
    description: 'An invisible reset, still in your seat.',
    details: [
      'Unclench your jaw and drop your shoulders, without anyone noticing.',
      'Press your feet flat on the floor.',
      'Take one slower breath in, and a longer one out.',
      'Soften your gaze for a second before looking back at the screen.',
    ],
  },
  '2m': {
    description: 'A short, seated reset you can take without leaving.',
    details: [
      'Stay seated and let your shoulders and jaw drop.',
      'Unclench your hands and let your feet rest flat on the floor.',
      'Take a few slower breaths, in through the nose if you can.',
      "Let your eyes rest somewhere soft for a moment before the next thing.",
    ],
  },
};

// Eyes stay open throughout, no screen-based instruction and nothing that
// asks the user to stop paying attention to their surroundings - "Do not
// instruct them to close their eyes or perform unsafe actions."
const COMMUTING_ACTIONS: Partial<Record<Duration, { description: string; details: string[] }>> = {
  '30s': {
    description: 'A quick reset you can do right where you are.',
    details: [
      'Let your jaw soften and drop your shoulders.',
      'Loosen your grip on whatever you\'re holding or the wheel.',
      'Take a slow breath in, then a longer breath out.',
      'Keep your eyes where they need to be.',
    ],
  },
  '2m': {
    description: 'Let the journey itself be the break.',
    details: [
      'Let your shoulders and jaw drop.',
      'Breathe a little slower than usual for a couple of minutes.',
      'Notice a few things around you rather than running through your list.',
      "No need to do anything else - this one's just about not adding to the load.",
    ],
  },
  '5m': {
    description: 'Use the rest of the journey to come down a level.',
    details: [
      'Let your shoulders and jaw drop, and keep them there.',
      'Breathe slowly for a few minutes.',
      'Let your mind wander rather than rehearsing what\'s next.',
      'Arrive without immediately picking the next thing up.',
    ],
  },
};

const situationActionsFor = (situation: SituationId, duration: Duration) => {
  const base = DEFAULT_ACTIONS[duration];
  if (situation === 'meeting' && MEETING_ACTIONS[duration]) return { ...base, ...MEETING_ACTIONS[duration] };
  if (situation === 'commuting' && COMMUTING_ACTIONS[duration]) return { ...base, ...COMMUTING_ACTIONS[duration] };
  return base;
};

// Meeting and commuting both narrow which durations make sense - never
// hiding the choice entirely, just not leading with a 20-minute lie-down
// while someone is mid-meeting.
const DURATIONS_FOR_SITUATION: Record<SituationId, Duration[]> = {
  meeting: ['30s', '2m'],
  commuting: ['30s', '2m', '5m'],
  deep_focus: ALL_DURATIONS,
  none: ALL_DURATIONS,
};

const RECOMMENDED_DURATION_FOR_SITUATION: Record<SituationId, Duration> = {
  meeting: '30s',
  commuting: '2m',
  deep_focus: '30s',
  none: '2m',
};

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  startIso?: string;
  endIso?: string;
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

type EscalationOption = 'another_reset' | 'remove_one_thing' | 'rebuild_plan';

export const MicroRecovery = ({ fingerprint, onAwardPoints, isFocusActive }: MicroRecoveryProps) => {
  const { accessToken, signInWithCalendar } = useAuth();

  const [selectedDuration, setSelectedDuration] = useState<Duration | null>(null);
  const [inProgress, setInProgress] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [manualSituation, setManualSituation] = useState<SituationId>('none');
  const [situationTouched, setSituationTouched] = useState(false);
  const [completionsThisSession, setCompletionsThisSession] = useState(0);
  const [showEscalation, setShowEscalation] = useState(false);

  // Real Energy Delta context - "Do not repeatedly prescribe breathing
  // exercises when workload reduction is more appropriate."
  const [energyDeltaNegative, setEnergyDeltaNegative] = useState<boolean | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    (async () => {
      const uid = auth.currentUser!.uid;
      const [checkIn, stressors] = await Promise.all([loadLatestCapacityCheckIn(uid), loadStressors(uid)]);
      if (!checkIn) { setEnergyDeltaNegative(null); return; }
      const result = computeEnergyDelta(checkIn.score, stressors.filter((s) => s.status === 'active'));
      setEnergyDeltaNegative(result.energyDelta < 0);
    })().catch(() => setEnergyDeltaNegative(null));
  }, []);

  // Google Calendar Integration states
  const [isDemoMode, setIsDemoMode] = useState(!accessToken);
  const [realEvents, setRealEvents] = useState<CalendarEvent[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BreakSuggestion[]>([]);

  const activeEvents = isDemoMode ? MOCK_EVENTS : realEvents;

  // A genuine "currently in a meeting" signal from the real, connected
  // calendar - never claimed when the calendar is still on demo data.
  const isCurrentlyInMeeting = useMemo(() => {
    if (isDemoMode) return false;
    const now = new Date().getTime();
    return realEvents.some((ev) => {
      if (!ev.startIso || !ev.endIso) return false;
      const start = new Date(ev.startIso).getTime();
      const end = new Date(ev.endIso).getTime();
      return now >= start && now <= end;
    });
  }, [isDemoMode, realEvents]);

  // Derived, not stored state: a detected situation only applies until
  // the user picks one themselves, and recomputes on every render rather
  // than needing an effect to sync it into state.
  const detectedSituation: SituationId | null = isFocusActive ? 'deep_focus' : isCurrentlyInMeeting ? 'meeting' : null;
  const situation: SituationId = situationTouched ? manualSituation : (detectedSituation ?? 'none');

  const handleSituationSelect = (id: SituationId) => {
    setSituationTouched(true);
    setManualSituation(id);
    // Switching situation may rule out the currently selected duration.
    if (selectedDuration && !DURATIONS_FOR_SITUATION[id].includes(selectedDuration)) {
      setSelectedDuration(null);
    }
  };

  // Calculate suggestions based on active mode
  useEffect(() => {
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
          reason: `"${current.summary}" runs for ${current.durationMinutes}m — long enough to leave you drained.`,
          recommendedDuration: current.durationMinutes >= 120 ? '10m' : '5m'
        });
      }

      // Back-to-back meeting rule: gap <= 10 mins
      const next = activeEvents[i + 1];
      if (next) {
        let gapMinutes = 15; // default safe
        if (isDemoMode) {
          if (current.end === next.start) {
            gapMinutes = 0;
          }
        } else {
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
  }, [isDemoMode, activeEvents]);

  const fetchRealCalendar = async () => {
    if (!accessToken) return;
    setLoadingCalendar(true);
    setCalendarError(null);
    try {
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
        const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const parsed: CalendarEvent[] = data.items
          .filter((item: any) => item.start?.dateTime && item.end?.dateTime)
          .map((item: any) => {
            const startDt = new Date(item.start.dateTime);
            const endDt = new Date(item.end.dateTime);
            const diffMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
            return {
              summary: item.summary || 'Focus Event',
              start: formatTime(startDt),
              end: formatTime(endDt),
              startIso: startDt.toISOString(),
              endIso: endDt.toISOString(),
              durationMinutes: diffMin,
            };
          });

        setRealEvents(parsed);
        setIsDemoMode(false);
      } else {
        setRealEvents([]);
        setIsDemoMode(false);
      }
    } catch (e: any) {
      console.error(e);
      setCalendarError(`Authorisation complete but failed to pull events: ${e.message || e}. Using demo simulation.`);
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

  const scrollToSection = (id: string) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const heading = el.querySelector<HTMLElement>('h3');
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }, 100);
  };

  const handleEscalationChoice = (choice: EscalationOption) => {
    setShowEscalation(false);
    if (choice === 'another_reset') {
      setSelectedDuration(null);
      setCompleted(false);
      return;
    }
    if (choice === 'remove_one_thing') {
      scrollToSection('one-less-thing-section');
      return;
    }
    scrollToSection('workload-reality-check-section');
  };

  const handleNeedMoreThanThis = () => {
    setInProgress(false);
    setCompleted(false);
    setShowEscalation(true);
  };

  const handleComplete = () => {
    setInProgress(false);
    setCompleted(true);
    const nextCount = completionsThisSession + 1;
    setCompletionsThisSession(nextCount);
    if (selectedDuration) {
      const activeAction = situationActionsFor(situation, selectedDuration);
      const sessionData = {
        duration: selectedDuration,
        time: DEFAULT_ACTIONS[selectedDuration].time,
        description: activeAction.description,
        details: activeAction.details,
        situation,
        completedAt: new Date().toISOString()
      };
      if (auth.currentUser) {
        setDoc(doc(db, 'users', auth.currentUser.uid, 'micro_recovery', 'latest'), sessionData).catch(() => {
          // Non-fatal - the completion itself still counts even if this save fails.
        });
      }
      updateNovaMemoryBySourceAndType('Micro Recovery', 'state', {
        content: `Completed ${DEFAULT_ACTIONS[selectedDuration].time} micro-recovery: "${activeAction.description}".`,
        confidence: 'verified',
        canEdit: true,
      });
    }
    if (onAwardPoints) {
      onAwardPoints(
        fromSuggestion ? 30 : 20,
        fromSuggestion ? 'Applied Suggested Break' : 'Micro-Recovery Completed'
      );
    }

    // MICRO-RECOVERY ESCALATION: not after every intervention - only when
    // context (a repeat reset today, or a real capacity/load mismatch)
    // suggests the short reset alone isn't enough.
    const offerEscalation = nextCount >= 2 || energyDeltaNegative === true;

    setTimeout(() => {
      setSelectedDuration(null);
      setCompleted(false);
      setFromSuggestion(false);
      if (offerEscalation) setShowEscalation(true);
    }, 3000);
  };

  const availableDurations = DURATIONS_FOR_SITUATION[situation];
  const recommendedDuration = RECOMMENDED_DURATION_FOR_SITUATION[situation];

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Stabilise · Core Pillar: Rebuild</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Micro-Recovery</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "How much time have you got?"
            </p>
          </div>
        </div>
      </div>

      {/* Situation chips - adapts the intervention, never forces an action
          that doesn't fit where the user actually is. */}
      <div className="space-y-3">
        <label className="text-xs uppercase tracking-widest font-black text-text-muted">What's your situation right now?</label>
        <div className="flex flex-wrap gap-2.5">
          {SITUATIONS.map((s) => {
            const Icon = s.icon;
            const isAutoDetected = !situationTouched && ((s.id === 'deep_focus' && isFocusActive) || (s.id === 'meeting' && isCurrentlyInMeeting));
            return (
              <button
                key={s.id}
                onClick={() => handleSituationSelect(s.id)}
                aria-pressed={situation === s.id}
                className={cn(
                  "px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all cursor-pointer",
                  situation === s.id
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border text-text-muted hover:text-text-main hover:border-primary/40"
                )}
              >
                <Icon className="w-4 h-4" />
                {s.label}
                {isAutoDetected && situation === s.id && (
                  <span className="text-[9px] uppercase tracking-widest font-black opacity-80">Detected</span>
                )}
              </button>
            );
          })}
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
                <span className="text-[11px] px-2 py-0.5 bg-primary/10 text-[#9a3412] dark:text-primary font-black uppercase tracking-widest rounded-full">Demo Simulation</span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 bg-success/10 text-success dark:text-[#4ade80] font-black uppercase tracking-widest rounded-full">Live Connected</span>
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
          <div role="alert" className="p-3 bg-destructive dark:bg-destructive/20 rounded-xl border border-destructive/50 text-xs text-destructive-foreground dark:text-[#f87171] flex items-start gap-2">
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
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-warning/10 text-[#9a3412] dark:text-warning rounded-full">
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
                      setFromSuggestion(true);

                      setTimeout(() => {
                        document.getElementById('recovery-protocol-anchor')?.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    }}
                    className="w-full py-2 bg-primary/10 hover:bg-primary hover:text-primary-foreground text-[#9a3412] dark:text-primary text-[11px] font-black uppercase tracking-widest rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Apply Suggested Break ({DEFAULT_ACTIONS[s.recommendedDuration].time})
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {ALL_DURATIONS.map((duration) => {
          const enabled = availableDurations.includes(duration);
          return (
            <button
              key={duration}
              disabled={!enabled}
              onClick={() => {
                setSelectedDuration(duration);
                setInProgress(false);
                setCompleted(false);
                setFromSuggestion(false);
              }}
              aria-pressed={selectedDuration === duration}
              className={cn(
                "p-6 rounded-2xl border transition-all text-left group relative overflow-hidden",
                !enabled && "opacity-40 cursor-not-allowed",
                selectedDuration === duration
                  ? "bg-primary border-primary text-primary-foreground shadow-xl shadow-primary/20 scale-105 z-10"
                  : enabled && "border border-border hover:border-primary/50 text-text-main hover:bg-surface dark:hover:bg-surface"
              )}
            >
              <div className="flex flex-col gap-2 relative z-10">
                <Clock className={cn("w-6 h-6", selectedDuration === duration ? "text-primary-foreground" : "text-primary")} />
                <span className="text-2xl font-display font-black">{DEFAULT_ACTIONS[duration].time}</span>
                {duration === recommendedDuration && selectedDuration !== duration && (
                  <span className="text-[10px] uppercase tracking-widest font-black text-primary">Nova suggests this</span>
                )}
              </div>
              {selectedDuration === duration && (
                <motion.div layoutId="duration-highlight" className="absolute inset-0 bg-primary/20 blur-xl" />
              )}
            </button>
          );
        })}
      </div>

      {/* Anchor point for scrolling */}
      <div id="recovery-protocol-anchor" />

      <AnimatePresence mode="wait">
        {selectedDuration && !completed && !showEscalation && (
          <motion.div
            key={selectedDuration}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="card border border-primary/20 bg-primary/5 p-6 sm:p-8 md:p-10 relative overflow-hidden"
          >
            <div className="relative z-10 space-y-8">
              <div className="space-y-2">
                <h4 className="text-3xl font-display font-bold text-text-main">
                  Nova suggests: {DEFAULT_ACTIONS[selectedDuration].time}
                </h4>
                <p className="text-lg text-text-muted font-medium">
                  {situationActionsFor(situation, selectedDuration).description}
                </p>
              </div>

              <div className="space-y-4">
                {situationActionsFor(situation, selectedDuration).details.map((detail, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-start gap-4 bg-white/50 dark:bg-surface/50 p-4 rounded-xl border border-border/50"
                  >
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-[#9a3412] dark:text-primary flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-3 h-3 font-black" />
                    </div>
                    <span className="text-text-main font-bold text-lg">{detail}</span>
                  </motion.div>
                ))}
              </div>

              <div className="pt-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-end gap-3">
                 <button onClick={handleNeedMoreThanThis} className="text-sm font-bold text-text-muted hover:text-text-main transition-colors">
                   I need more than this
                 </button>
                 {!inProgress ? (
                   <button onClick={handleStart} className="btn-primary">
                     Begin
                   </button>
                 ) : (
                   <button onClick={handleComplete} className="btn-primary bg-primary hover:bg-primary border-primary">
                     <CheckCircle2 className="w-4 h-4" />
                     Done
                   </button>
                 )}
              </div>
            </div>
                      </motion.div>
        )}

        {completed && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            role="status"
            aria-live="polite"
            className="card border border-success/20 bg-success/5 p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center text-center py-20"
          >
             <div className="w-20 h-20 bg-success rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-success/20">
               <CheckCircle2 className="w-10 h-10" />
             </div>
             <h4 className="text-3xl font-display font-bold text-text-main mb-2">Done</h4>
             <p className="text-lg text-text-muted font-medium">Nice reset. Points awarded.</p>
          </motion.div>
        )}

        {/* MICRO-RECOVERY ESCALATION */}
        {showEscalation && (
          <motion.div
            key="escalation"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            role="status"
            aria-live="polite"
            className="card border border-primary/20 bg-primary/5 p-6 sm:p-8 md:p-10 space-y-6"
          >
            <div className="space-y-2">
              <h3 className="text-2xl font-display font-bold text-text-main">Need a little more recovery, or should we make the day smaller?</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleEscalationChoice('another_reset')}
                className="p-4 rounded-xl border border-border hover:border-primary/50 text-left space-y-1.5 transition-colors"
              >
                <Clock className="w-5 h-5 text-primary" />
                <span className="block font-bold text-text-main">Take another reset</span>
              </button>
              <button
                onClick={() => handleEscalationChoice('remove_one_thing')}
                className={cn(
                  "p-4 rounded-xl border text-left space-y-1.5 transition-colors",
                  energyDeltaNegative === true ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                )}
              >
                <MinusCircle className="w-5 h-5 text-primary" />
                <span className="block font-bold text-text-main">Remove one thing</span>
              </button>
              <button
                onClick={() => handleEscalationChoice('rebuild_plan')}
                className="p-4 rounded-xl border border-border hover:border-primary/50 text-left space-y-1.5 transition-colors"
              >
                <ListTodo className="w-5 h-5 text-primary" />
                <span className="block font-bold text-text-main">Rebuild today's plan</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
