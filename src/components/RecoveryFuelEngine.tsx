import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Coffee, Sun, Droplet, Apple, Heart, Info, ShieldAlert, Sparkles, Clock, Check,
  Wine, Activity, TrendingUp, ChevronDown, X, ListChecks, SlidersHorizontal,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { useAuth } from '../lib/auth';
import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { doc, getDoc, setDoc, deleteDoc, collection, query, orderBy, limit, getDocs, addDoc, updateDoc } from 'firebase/firestore';

import { SHIPStage } from '../types';
import { detectFuelPatterns, FUEL_PATTERN_COPY, FuelLogEntry } from '../../recovery-fuel-patterns';
import {
  FuelTriggerId, FUEL_TRIGGER_ORDER, FUEL_TRIGGER_LABELS, FuelContextSnapshot,
  getFuelOpening, getFuelFollowUpQuestion, getFuelRecommendation, getProactiveQuestion, getProactiveRecommendation,
  FuelAnswerId, FuelQuestion, FuelActionId, FUEL_ACTION_LABELS, FuelRecommendation,
  FUEL_PATTERN_CONFIDENCE_LABELS, computeMostHelpfulFuelAction, FuelHelpfulnessEntry, FuelHelpfulness,
} from '../../recovery-fuel-coach';
import { loadLatestCapacityCheckIn, loadStressors } from '../lib/energy-delta-service';
import { computeEnergyDelta } from '../../energy-delta-engine';
import { loadSleepTargetHours, loadRecentSleepNights } from '../lib/recovery-debt-service';
import { computeSleepShortfall } from '../../recovery-debt-engine';

interface RecoveryFuelEngineProps {
  fingerprint?: any;
  onAwardPoints?: (amount: number, reason: string) => void;
  currentStage?: SHIPStage;
  onNavigate?: (tab: string) => void;
  onOpenSomaticReset?: () => void;
}

// Recovery Fuel - "what basic recovery foundations might be making today
// harder, and what is one useful thing I can do now?" Nova-led coaching
// first (Nova Fuel Check, this file's default view), quick intervention
// second (Quick Actions, shown alongside it), tracking and patterns third
// (My Patterns, a clearly separate secondary view - never the landing
// screen). The adaptive question logic itself lives in
// recovery-fuel-coach.ts; this file only ever assembles real context,
// calls into that engine, and renders the result.

interface FuelCheckinRecord {
  id: string;
  trigger: FuelTriggerId | 'proactive';
  action: FuelActionId;
  helpful?: FuelHelpfulness;
  createdAt: string;
}

const CAPACITY_LOW_CUTOFF = 40; // same cutoff recovery-debt-engine's Social Load already uses
const SLEEP_SHORTFALL_HIGH_HOURS = 2;

export const RecoveryFuelEngine = ({
  fingerprint,
  onAwardPoints,
  currentStage = 'Safety',
  onNavigate,
  onOpenSomaticReset,
}: RecoveryFuelEngineProps) => {
  const { accessToken } = useAuth();
  const uid = auth.currentUser?.uid;

  // ---------- Top-level view ----------
  const [view, setView] = useState<'home' | 'patterns'>('home');

  // ---------- Age setting - the best available signal, since no
  // account-level birthdate exists anywhere in this app yet. Defaults to
  // the conservative (youth) state so age-restricted content never shows
  // before the person has actually said they're 18+. ----------
  const [isAdult, setIsAdult] = useState<boolean>(() => localStorage.getItem('blaze_user_is_adult') === 'true');
  const handleAgeChange = (value: boolean) => {
    setIsAdult(value);
    localStorage.setItem('blaze_user_is_adult', String(value));
  };

  // ---------- Real context Nova Fuel Check reads before asking anything ----------
  const [capacity, setCapacity] = useState<number | null>(null);
  const [energyDelta, setEnergyDelta] = useState<number | null>(null);
  const [sleepShortfall, setSleepShortfall] = useState<number | null>(null);
  const [todayAte, setTodayAte] = useState<boolean | null>(null);
  const [contextLoaded, setContextLoaded] = useState(false);

  useEffect(() => {
    const loadContext = async () => {
      if (!uid) { setContextLoaded(true); return; }
      try {
        const [checkIn, stressors, targetHours, nights, todayLog] = await Promise.all([
          loadLatestCapacityCheckIn(uid),
          loadStressors(uid),
          loadSleepTargetHours(uid),
          loadRecentSleepNights(uid),
          getDoc(doc(db, 'users', uid, 'recovery_fuel_logs', new Date().toISOString().split('T')[0]!)),
        ]);
        const cap = checkIn?.score ?? null;
        setCapacity(cap);
        if (cap !== null) {
          const energy = computeEnergyDelta(cap, stressors.filter((s) => s.status === 'active'));
          setEnergyDelta(energy.energyDelta);
        }
        setSleepShortfall(computeSleepShortfall(targetHours, nights));
        if (todayLog.exists()) {
          const data = todayLog.data();
          setTodayAte(typeof data.hasEaten === 'boolean' ? data.hasEaten : null);
        }
      } catch (e) {
        // Leaves context unknown - Nova Fuel Check just asks instead of guessing.
      }
      setContextLoaded(true);
    };
    loadContext();
  }, [uid]);

  const fuelContext: FuelContextSnapshot = useMemo(() => ({
    capacityLow: capacity === null ? null : capacity <= CAPACITY_LOW_CUTOFF,
    energyDeltaNegative: energyDelta === null ? null : energyDelta < 0,
    sleepShortfallHigh: sleepShortfall === null ? null : sleepShortfall > SLEEP_SHORTFALL_HIGH_HOURS,
    loggedAteToday: todayAte,
  }), [capacity, energyDelta, sleepShortfall, todayAte]);

  // ---------- Nova Fuel Check flow ----------
  type CheckPhase = 'opening' | 'question' | 'result';
  const [checkPhase, setCheckPhase] = useState<CheckPhase>('opening');
  const [selectedTrigger, setSelectedTrigger] = useState<FuelTriggerId | 'proactive' | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<FuelQuestion | null>(null);
  const [recommendation, setRecommendation] = useState<FuelRecommendation | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [completedAction, setCompletedAction] = useState<FuelActionId | null>(null);
  const [lastCheckinId, setLastCheckinId] = useState<string | null>(null);
  const [helpfulGiven, setHelpfulGiven] = useState(false);

  const opening = useMemo(() => getFuelOpening(fuelContext), [fuelContext]);

  const resetCheck = () => {
    setCheckPhase('opening');
    setSelectedTrigger(null);
    setActiveQuestion(null);
    setRecommendation(null);
    setShowMoreOptions(false);
    setCompletedAction(null);
    setLastCheckinId(null);
    setHelpfulGiven(false);
  };

  const handleTriggerSelect = (trigger: FuelTriggerId) => {
    setSelectedTrigger(trigger);
    const question = getFuelFollowUpQuestion(trigger, fuelContext);
    if (question) {
      setActiveQuestion(question);
      setCheckPhase('question');
    } else {
      setRecommendation(getFuelRecommendation(trigger, null, fuelContext));
      setCheckPhase('result');
    }
  };

  const handleProactiveStart = () => {
    setSelectedTrigger('proactive');
    setActiveQuestion(getProactiveQuestion());
    setCheckPhase('question');
  };

  const handleQuestionAnswer = (answer: FuelAnswerId) => {
    const rec = selectedTrigger === 'proactive'
      ? getProactiveRecommendation(answer)
      : getFuelRecommendation(selectedTrigger as FuelTriggerId, answer, fuelContext);
    setRecommendation(rec);
    setCheckPhase('result');
  };

  // Logs today's basics quietly in the background when a recommendation
  // implies a known answer (e.g. "not eaten" -> hasEaten: false), so the
  // same real data feeds Recovery Debt/My Patterns without a second,
  // separate log the user has to fill in.
  const quietlyLogBasics = (action: FuelActionId) => {
    if (!uid) return;
    const today = new Date().toISOString().split('T')[0];
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    // Mirrors each floor into the Manual Fuel Log's own local state too -
    // handleSaveCheckIn below sends that state as a full merge write, so
    // without this a save made after a quick action (with the field still
    // at its stale pre-action value locally) would silently overwrite the
    // floor just set in Firestore back down.
    if (action === 'eat') { updates.hasEaten = true; setHasEaten(true); }
    if (action === 'drink') { updates.hydrationGlasses = 1; setHydrationGlasses((g) => Math.max(g, 1)); }
    if (action === 'daylight') { updates.morningLight = true; setMorningLight(true); }
    setDoc(doc(db, 'users', uid, 'recovery_fuel_logs', today), updates, { merge: true }).catch(() => {});
    if (action === 'eat') setTodayAte(true);
  };

  const executeFuelAction = async (action: FuelActionId) => {
    quietlyLogBasics(action);
    setCompletedAction(action);

    if (uid && selectedTrigger) {
      try {
        const ref = await addDoc(collection(db, 'users', uid, 'recovery_fuel_checkins'), {
          trigger: selectedTrigger,
          action,
          createdAt: new Date().toISOString(),
        });
        setLastCheckinId(ref.id);
      } catch (e) {
        // Non-fatal - the action itself still happens even if this log fails.
      }
    }

    updateNovaMemoryBySourceAndType('Recovery Fuel Engine', 'state', {
      content: `Nova Fuel Check recommended "${FUEL_ACTION_LABELS[action]}" and the user took it.`,
      canEdit: false,
      confidence: 'medium',
    });
    if (onAwardPoints) onAwardPoints(10, `Recovery Fuel: ${FUEL_ACTION_LABELS[action]}`);

    switch (action) {
      case 'check_capacity':
      case 'one_less_thing':
      case 'reduce_load':
        onNavigate?.('recover');
        break;
      case 'wind_down':
        onNavigate?.('reset');
        break;
      case 'somatic_reset':
        onOpenSomaticReset?.();
        break;
      default:
        break; // eat/drink/daylight/take_break are logged in place, no navigation
    }
  };

  const handleHelpfulResponse = async (helpful: FuelHelpfulness) => {
    setHelpfulGiven(true);
    if (uid && lastCheckinId) {
      try {
        await updateDoc(doc(db, 'users', uid, 'recovery_fuel_checkins', lastCheckinId), { helpful });
      } catch (e) {
        // Non-fatal.
      }
    }
  };

  // ---------- My Patterns data ----------
  const [recentLogs, setRecentLogs] = useState<(FuelLogEntry & { id: string })[]>([]);
  const [recentCheckins, setRecentCheckins] = useState<FuelCheckinRecord[]>([]);
  const weeklyPatternMemoryWrittenRef = useRef(false);

  useEffect(() => {
    const loadPatterns = async () => {
      if (!uid) return;
      try {
        const [logsSnap, checkinsSnap] = await Promise.all([
          getDocs(query(collection(db, 'users', uid, 'recovery_fuel_logs'), orderBy('createdAt', 'desc'), limit(7))),
          getDocs(query(collection(db, 'users', uid, 'recovery_fuel_checkins'), orderBy('createdAt', 'desc'), limit(20))),
        ]);
        setRecentLogs(logsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as FuelLogEntry) })));
        setRecentCheckins(checkinsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FuelCheckinRecord, 'id'>) })));
      } catch (e) {
        // Leaves these empty - My Patterns just shows its honest empty state.
      }
    };
    loadPatterns();
  }, [uid]);

  const weeklyPatterns = detectFuelPatterns(recentLogs, { includeAlcohol: isAdult });

  useEffect(() => {
    if (weeklyPatternMemoryWrittenRef.current) return;
    if (weeklyPatterns.length === 0) return;
    weeklyPatternMemoryWrittenRef.current = true;
    const top = weeklyPatterns[0];
    updateNovaMemoryBySourceAndType('Recovery Fuel Engine - Weekly Pattern', 'state', {
      content: `Recurring fuel pattern detected: ${FUEL_PATTERN_COPY[top.id].nudgeMessage(top)}`,
      canEdit: false,
      confidence: 'medium',
    });
  }, [weeklyPatterns]);

  const mostHelpfulAction = useMemo(() => {
    const entries: FuelHelpfulnessEntry[] = recentCheckins
      .filter((c): c is FuelCheckinRecord & { helpful: FuelHelpfulness } => !!c.helpful)
      .map((c) => ({ action: c.action, helpful: c.helpful }));
    return computeMostHelpfulFuelAction(entries);
  }, [recentCheckins]);

  // ---------- Manual detailed log (optional, for people who want it) ----------
  const [hasEaten, setHasEaten] = useState<boolean | null>(null);
  const [skippedBreakfast, setSkippedBreakfast] = useState<boolean | null>(null);
  const [caffeineCount, setCaffeineCount] = useState<number>(0);
  const [caffeineTiming, setCaffeineTiming] = useState<'early' | 'late' | 'none'>('none');
  const [caffeineEmptyStomach, setCaffeineEmptyStomach] = useState<boolean | null>(null);
  const [hydrationGlasses, setHydrationGlasses] = useState<number>(0);
  const [morningLight, setMorningLight] = useState<boolean | null>(null);
  const [alcoholLogged, setAlcoholLogged] = useState<boolean | null>(null);
  const [shakyIrritable, setShakyIrritable] = useState<boolean | null>(null);
  const [isCheckInSubmitted, setIsCheckInSubmitted] = useState<boolean>(false);

  useEffect(() => {
    const loadTodayFuelLog = async () => {
      if (!uid) return;
      const today = new Date().toISOString().split('T')[0];
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'recovery_fuel_logs', today));
        if (snap.exists()) {
          const parsed = snap.data();
          setHasEaten(parsed.hasEaten ?? null);
          setSkippedBreakfast(parsed.skippedBreakfast ?? null);
          setCaffeineCount(parsed.caffeineCount ?? 0);
          setCaffeineTiming(parsed.caffeineTiming ?? 'none');
          setCaffeineEmptyStomach(parsed.caffeineEmptyStomach ?? null);
          setHydrationGlasses(parsed.hydrationGlasses ?? 0);
          setMorningLight(parsed.morningLight ?? null);
          setAlcoholLogged(parsed.alcoholLogged ?? null);
          setShakyIrritable(parsed.shakyIrritable ?? null);
          setIsCheckInSubmitted(Object.keys(parsed).length > 0);
        }
      } catch (e) {
        // Leaves the honest empty state in place rather than pretending today's log loaded.
      }
    };
    loadTodayFuelLog();
  }, [uid]);

  const handleSaveCheckIn = () => {
    const today = new Date().toISOString().split('T')[0];
    const fuelData = {
      hasEaten, skippedBreakfast, caffeineCount, caffeineTiming, caffeineEmptyStomach,
      hydrationGlasses, morningLight, alcoholLogged: isAdult ? alcoholLogged : null, shakyIrritable,
    };

    if (uid) {
      setDoc(doc(db, 'users', uid, 'recovery_fuel_logs', today), {
        ...fuelData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {});
    }
    setIsCheckInSubmitted(true);
    setTodayAte(hasEaten);
    setRecentLogs((prev) => [{ id: today, ...fuelData } as FuelLogEntry & { id: string }, ...prev.filter((l) => l.id !== today)].slice(0, 7));

    updateNovaMemoryBySourceAndType('Recovery Fuel Engine', 'state', {
      content: `Recovery Fuel log for today: ${hasEaten === false || skippedBreakfast ? 'meals skipped or delayed. ' : ''}${caffeineCount > 3 || caffeineTiming === 'late' ? 'higher or later caffeine. ' : ''}${hydrationGlasses < 5 ? 'hydration below usual. ' : ''}${morningLight === false ? 'no morning daylight. ' : ''}${isAdult && alcoholLogged ? 'alcohol logged. ' : ''}${shakyIrritable ? 'feeling shaky or flat. ' : ''}`,
      canEdit: false,
      confidence: 'high',
    });
    if (onAwardPoints) onAwardPoints(15, 'Logged today\'s Recovery Fuel basics');
  };

  const handleResetCheckIn = () => {
    const today = new Date().toISOString().split('T')[0];
    if (uid) deleteDoc(doc(db, 'users', uid, 'recovery_fuel_logs', today)).catch(() => {});
    setHasEaten(null); setSkippedBreakfast(null); setCaffeineCount(0); setCaffeineTiming('none');
    setCaffeineEmptyStomach(null); setHydrationGlasses(0); setMorningLight(null); setAlcoholLogged(null);
    setShakyIrritable(null); setIsCheckInSubmitted(false);
  };

  // ---------- Reminder preferences - real, working, in-app-only nudges.
  // Three categories (hydration, before meetings, recovery breaks) rather
  // than the full list a central nudge system could eventually cover -
  // each one genuinely fires on the schedule configured, there's no
  // background/push delivery here (confirmed: this only runs while this
  // component is mounted), so the UI says so honestly rather than
  // implying notifications work when the tab isn't open. ----------
  const [hydrationReminderEnabled, setHydrationReminderEnabled] = useState<boolean>(false);
  const [hydrationInterval, setHydrationInterval] = useState<number>(90);
  const [meetingReminderEnabled, setMeetingReminderEnabled] = useState<boolean>(false);
  const [meetingLeadMinutes, setMeetingLeadMinutes] = useState<number>(15);
  const [breakReminderEnabled, setBreakReminderEnabled] = useState<boolean>(false);
  const [breakInterval, setBreakInterval] = useState<number>(120);
  const [reminderPrefsLoaded, setReminderPrefsLoaded] = useState(false);
  const [activeNudge, setActiveNudge] = useState<{ type: 'hydration' | 'meeting' | 'break'; title: string; message: string } | null>(null);
  const [dismissedStreak, setDismissedStreak] = useState<Record<'hydration' | 'meeting' | 'break', number>>({ hydration: 0, meeting: 0, break: 0 });
  const [fatigueCheck, setFatigueCheck] = useState<'hydration' | 'meeting' | 'break' | null>(null);

  useEffect(() => {
    const loadPrefs = async () => {
      if (!uid) { setReminderPrefsLoaded(true); return; }
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'fuel_reminders'));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.hydrationEnabled === 'boolean') setHydrationReminderEnabled(data.hydrationEnabled);
          if (typeof data.hydrationIntervalMinutes === 'number') setHydrationInterval(data.hydrationIntervalMinutes);
          if (typeof data.meetingEnabled === 'boolean') setMeetingReminderEnabled(data.meetingEnabled);
          if (typeof data.meetingLeadMinutes === 'number') setMeetingLeadMinutes(data.meetingLeadMinutes);
          if (typeof data.emotionalEnabled === 'boolean') setBreakReminderEnabled(data.emotionalEnabled);
          if (typeof data.emotionalIntervalMinutes === 'number') setBreakInterval(data.emotionalIntervalMinutes);
        }
      } catch (e) {
        // Leaves the defaults (all off) in place.
      }
      setReminderPrefsLoaded(true);
    };
    loadPrefs();
  }, [uid]);

  const saveReminderPrefs = (updates: Record<string, any>) => {
    if (!uid) return;
    setDoc(doc(db, 'users', uid, 'preferences', 'fuel_reminders'), { ...updates, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
  };

  const handleHydrationToggle = (val: boolean) => { setHydrationReminderEnabled(val); saveReminderPrefs({ hydrationEnabled: val }); };
  const handleHydrationIntervalChange = (val: number) => { setHydrationInterval(val); saveReminderPrefs({ hydrationIntervalMinutes: val }); };
  const handleMeetingToggle = (val: boolean) => { setMeetingReminderEnabled(val); saveReminderPrefs({ meetingEnabled: val }); };
  const handleMeetingLeadChange = (val: number) => { setMeetingLeadMinutes(val); saveReminderPrefs({ meetingLeadMinutes: val }); };
  const handleBreakToggle = (val: boolean) => { setBreakReminderEnabled(val); saveReminderPrefs({ emotionalEnabled: val }); };
  const handleBreakIntervalChange = (val: number) => { setBreakInterval(val); saveReminderPrefs({ emotionalIntervalMinutes: val }); };

  // ---------- Real scheduling engine (unchanged mechanics from the
  // previous version - genuinely fires on its own schedule while this
  // tab is open; only the copy and category names changed). ----------
  const lastHydrationFiredRef = useRef<number>(Number(localStorage.getItem('blaze_fuel_last_hydration_fired') || 0));
  const lastBreakFiredRef = useRef<number>(Number(localStorage.getItem('blaze_fuel_last_break_fired') || 0));
  const lastCalendarFetchRef = useRef<number>(0);
  const cachedEventsRef = useRef<{ id: string; summary: string; startMs: number }[]>([]);
  const remindedMeetingIdsRef = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('blaze_fuel_reminded_meetings') || '[]')));

  useEffect(() => {
    if (!reminderPrefsLoaded) return;
    const checkSchedule = async () => {
      if (activeNudge || fatigueCheck) return;
      const now = Date.now();

      if (hydrationReminderEnabled && dismissedStreak.hydration < 3) {
        const dueAt = lastHydrationFiredRef.current + hydrationInterval * 60000;
        if (now >= dueAt) {
          setActiveNudge({ type: 'hydration', title: 'Time for water', message: "Small check: had anything to drink recently?" });
          lastHydrationFiredRef.current = now;
          localStorage.setItem('blaze_fuel_last_hydration_fired', String(now));
          return;
        }
      }

      if (breakReminderEnabled && dismissedStreak.break < 3) {
        const dueAt = lastBreakFiredRef.current + breakInterval * 60000;
        if (now >= dueAt) {
          setActiveNudge({ type: 'break', title: 'A quick recovery break', message: "You've been going for a while. Good point for a short break and something to eat or drink." });
          lastBreakFiredRef.current = now;
          localStorage.setItem('blaze_fuel_last_break_fired', String(now));
          return;
        }
      }

      if (meetingReminderEnabled && accessToken && dismissedStreak.meeting < 3) {
        const minutesSinceFetch = (now - lastCalendarFetchRef.current) / 60000;
        if (lastCalendarFetchRef.current === 0 || minutesSinceFetch >= 5) {
          lastCalendarFetchRef.current = now;
          try {
            const start = new Date();
            const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&singleEvents=true&orderBy=startTime`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (res.ok) {
              const data = await res.json();
              cachedEventsRef.current = (data.items || [])
                .filter((item: any) => item.start?.dateTime)
                .map((item: any) => ({ id: item.id, summary: item.summary || 'Untitled meeting', startMs: new Date(item.start.dateTime).getTime() }));
            }
          } catch (e) {
            // Non-fatal - just means no meeting reminder fires this cycle.
          }
        }
        const upcoming = cachedEventsRef.current.find((ev) => {
          if (remindedMeetingIdsRef.current.has(ev.id)) return false;
          const minutesUntil = (ev.startMs - now) / 60000;
          return minutesUntil > 0 && minutesUntil <= meetingLeadMinutes;
        });
        if (upcoming) {
          setActiveNudge({ type: 'meeting', title: 'Before your next meeting', message: `"${upcoming.summary}" starts in about ${meetingLeadMinutes} minutes. Worth eating or drinking something first.` });
          remindedMeetingIdsRef.current.add(upcoming.id);
          localStorage.setItem('blaze_fuel_reminded_meetings', JSON.stringify(Array.from(remindedMeetingIdsRef.current).slice(-50)));
        }
      }
    };
    checkSchedule();
    const interval = setInterval(checkSchedule, 60000);
    return () => clearInterval(interval);
  }, [reminderPrefsLoaded, hydrationReminderEnabled, hydrationInterval, breakReminderEnabled, breakInterval, meetingReminderEnabled, meetingLeadMinutes, accessToken, activeNudge, fatigueCheck, dismissedStreak]);

  const dismissNudge = (type: 'hydration' | 'meeting' | 'break', actedOn: boolean) => {
    setActiveNudge(null);
    setDismissedStreak((prev) => {
      const next = actedOn ? 0 : prev[type] + 1;
      if (!actedOn && next >= 3) {
        setFatigueCheck(type);
      }
      return { ...prev, [type]: next };
    });
  };

  const pauseReminder = (type: 'hydration' | 'meeting' | 'break', mode: 'today' | 'week' | 'off') => {
    setFatigueCheck(null);
    setDismissedStreak((prev) => ({ ...prev, [type]: 0 }));
    if (mode === 'off') {
      if (type === 'hydration') handleHydrationToggle(false);
      if (type === 'meeting') handleMeetingToggle(false);
      if (type === 'break') handleBreakToggle(false);
      return;
    }
    const pauseMs = (mode === 'today' ? 24 : 24 * 7) * 60 * 60 * 1000;
    const resumeAt = Date.now() + pauseMs;
    if (type === 'hydration') { lastHydrationFiredRef.current = resumeAt; localStorage.setItem('blaze_fuel_last_hydration_fired', String(resumeAt)); }
    if (type === 'break') { lastBreakFiredRef.current = resumeAt; localStorage.setItem('blaze_fuel_last_break_fired', String(resumeAt)); }
    if (type === 'meeting') { lastCalendarFetchRef.current = resumeAt; }
  };

  if (!contextLoaded) {
    return <div className="card border border-border p-10 rounded-xl text-center text-text-muted text-sm">Loading Recovery Fuel…</div>;
  }

  return (
    <div className="card border border-border p-6 sm:p-8 md:p-10 rounded-xl space-y-8 relative overflow-hidden" id="recovery_fuel_engine_container">
      {/* Nudge fatigue check - takes priority over a normal nudge banner */}
      <AnimatePresence>
        {fatigueCheck && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="absolute top-6 left-6 right-6 z-50 p-6 rounded-xl border border-border bg-card shadow-lg space-y-4">
            <p className="text-sm font-bold text-text-main">These don't seem useful right now. Want me to pause them?</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => pauseReminder(fatigueCheck, 'today')} className="px-3 py-2 rounded-lg text-xs font-bold bg-surface border border-border hover:border-primary/40">Pause today</button>
              <button onClick={() => pauseReminder(fatigueCheck, 'week')} className="px-3 py-2 rounded-lg text-xs font-bold bg-surface border border-border hover:border-primary/40">Pause for a week</button>
              <button onClick={() => pauseReminder(fatigueCheck, 'off')} className="px-3 py-2 rounded-lg text-xs font-bold bg-surface border border-border hover:border-primary/40">Turn off</button>
              <button onClick={() => setFatigueCheck(null)} className="px-3 py-2 rounded-lg text-xs font-bold text-text-muted hover:text-text-main">Keep as is</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active nudge banner */}
      <AnimatePresence>
        {activeNudge && !fatigueCheck && (
          <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="absolute top-6 left-6 right-6 z-50 p-6 rounded-xl border border-primary/20 bg-primary/5 shadow-lg flex flex-col md:flex-row items-start justify-between gap-4">
            <div className="flex gap-4 items-start">
              <div className="w-11 h-11 rounded-lg bg-surface flex items-center justify-center shrink-0 text-text-main">
                {activeNudge.type === 'hydration' ? <Droplet className="w-5 h-5" /> : activeNudge.type === 'meeting' ? <Clock className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-widest text-text-muted flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-primary" /> Nova</span>
                <h4 className="text-base font-bold tracking-tight text-text-main">{activeNudge.title}</h4>
                <p className="text-xs leading-relaxed text-text-muted max-w-2xl">{activeNudge.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button onClick={() => { executeFuelAction(activeNudge.type === 'hydration' ? 'drink' : 'eat'); dismissNudge(activeNudge.type, true); }}
                className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground font-bold text-xs uppercase tracking-wider rounded-xl transition-all">
                Done
              </button>
              <button onClick={() => dismissNudge(activeNudge.type, false)} className="px-3 py-2 border border-border/40 text-text-muted hover:text-text-main font-bold text-xs uppercase tracking-wider rounded-xl">
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-border/40 relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
            <Apple className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-[0.25em] text-[#9a3412] dark:text-primary px-3 py-1 bg-primary/10 rounded-full border border-primary/15">
              Pillar 3 · Habits
            </span>
            <h2 className="text-3xl font-display font-black text-text-main tracking-tight mt-2">Recovery Fuel</h2>
            <p className="text-xs text-text-muted mt-1 max-w-xl leading-relaxed">
              Check the basics that can make recovery easier: sleep, regular fuel, hydration, daylight and a healthier relationship with caffeine.
            </p>
            <p className="text-[11px] text-text-muted/80 mt-1 max-w-xl leading-relaxed italic">
              No calorie counting. No diets. No food guilt. Just practical habits that can support steadier energy and recovery.
            </p>
          </div>
        </div>
        <button
          onClick={() => setView(view === 'home' ? 'patterns' : 'home')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-surface/40 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main hover:border-border transition-all shrink-0"
        >
          {view === 'home' ? <><ListChecks className="w-4 h-4" /> My Patterns</> : <><X className="w-4 h-4" /> Back</>}
        </button>
      </div>

      {view === 'home' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
          {/* Nova Fuel Check */}
          <div className="lg:col-span-8 bg-surface/20 border border-border/30 rounded-2xl p-6 sm:p-8 space-y-6 min-h-[280px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {checkPhase === 'opening' && (
                <motion.div key="opening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <h3 className="text-xl font-display font-bold text-text-main leading-snug">{opening.line}</h3>
                  </div>
                  {opening.proactive ? (
                    <div className="flex flex-wrap gap-2">
                      {getProactiveQuestion().options.map((opt) => (
                        <button key={opt.id} onClick={() => { handleProactiveStart(); handleQuestionAnswer(opt.id); }}
                          className="px-5 py-3 rounded-xl border border-border bg-white dark:bg-card text-sm font-bold text-text-main hover:border-primary/50 transition-all">
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {FUEL_TRIGGER_ORDER.map((trigger) => (
                        <button key={trigger} onClick={() => handleTriggerSelect(trigger)}
                          className="px-5 py-4 rounded-xl border border-border bg-white dark:bg-card text-sm font-bold text-text-main hover:border-primary/50 hover:bg-primary/5 transition-all text-left">
                          {FUEL_TRIGGER_LABELS[trigger]}
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {checkPhase === 'question' && activeQuestion && (
                <motion.div key="question" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <h3 className="text-xl font-display font-bold text-text-main leading-snug">{activeQuestion.prompt}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeQuestion.options.map((opt) => (
                      <button key={opt.id} onClick={() => handleQuestionAnswer(opt.id)}
                        className="px-5 py-3 rounded-xl border border-border bg-white dark:bg-card text-sm font-bold text-text-main hover:border-primary/50 transition-all">
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {checkPhase === 'result' && recommendation && (
                <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <p className="text-lg font-display font-bold text-text-main leading-snug">{recommendation.novaLine}</p>
                  </div>

                  {recommendation.primary && (
                    <div className="space-y-3">
                      <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">Recommended now</span>
                      {completedAction === recommendation.primary ? (
                        <div className="flex items-center gap-2 text-sm font-bold text-success dark:text-[#4ade80]"><Check className="w-4 h-4" /> Done</div>
                      ) : (
                        <button onClick={() => executeFuelAction(recommendation.primary!)}
                          className="btn-primary py-3.5 px-6 text-sm font-bold">
                          {FUEL_ACTION_LABELS[recommendation.primary]}
                        </button>
                      )}
                    </div>
                  )}

                  {recommendation.secondary.length > 0 && (
                    <div>
                      <button onClick={() => setShowMoreOptions((v) => !v)} className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
                        More options <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showMoreOptions && 'rotate-180')} />
                      </button>
                      {showMoreOptions && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {recommendation.secondary.map((action) => (
                            <button key={action} onClick={() => executeFuelAction(action)}
                              className={cn('px-4 py-2 rounded-lg border text-xs font-bold transition-all',
                                completedAction === action ? 'border-success/40 text-success dark:text-[#4ade80] bg-success/5' : 'border-border bg-white dark:bg-card text-text-main hover:border-primary/40')}>
                              {completedAction === action ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> {FUEL_ACTION_LABELS[action]}</span> : FUEL_ACTION_LABELS[action]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {completedAction && !helpfulGiven && (
                    <div className="pt-4 border-t border-border/30 flex items-center gap-3 flex-wrap">
                      <span className="text-xs font-bold text-text-muted">Did that help at all?</span>
                      {(['yes', 'a_little', 'not_really'] as const).map((h) => (
                        <button key={h} onClick={() => handleHelpfulResponse(h)} className="px-3 py-1.5 rounded-lg border border-border text-[11px] font-bold text-text-main hover:border-primary/40">
                          {h === 'yes' ? 'Yes, noticeably' : h === 'a_little' ? 'A little' : 'Not really'}
                        </button>
                      ))}
                    </div>
                  )}

                  <button onClick={resetCheck} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">Start over</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Actions */}
          <div className="lg:col-span-4 space-y-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">Quick Actions</span>
            <div className="grid grid-cols-2 gap-2.5">
              {([
                ['drink', Droplet], ['eat', Apple], ['daylight', Sun], ['take_break', Clock],
                ['somatic_reset', Heart], ['check_capacity', Activity], ['one_less_thing', ShieldAlert], ['wind_down', Coffee],
              ] as [FuelActionId, any][]).map(([action, Icon]) => (
                <button key={action} onClick={() => executeFuelAction(action)}
                  className="flex flex-col items-center gap-1.5 p-3.5 rounded-xl border border-border bg-surface/30 hover:bg-primary/5 hover:border-primary/40 transition-all text-center">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-bold text-text-main leading-tight">{FUEL_ACTION_LABELS[action]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <MyPatternsView
          isAdult={isAdult}
          onAgeChange={handleAgeChange}
          recentCheckins={recentCheckins}
          weeklyPatterns={weeklyPatterns}
          recentLogsCount={recentLogs.length}
          mostHelpfulAction={mostHelpfulAction}
          accessToken={accessToken}
          hasEaten={hasEaten} setHasEaten={setHasEaten}
          skippedBreakfast={skippedBreakfast} setSkippedBreakfast={setSkippedBreakfast}
          caffeineCount={caffeineCount} setCaffeineCount={setCaffeineCount}
          caffeineTiming={caffeineTiming} setCaffeineTiming={setCaffeineTiming}
          caffeineEmptyStomach={caffeineEmptyStomach} setCaffeineEmptyStomach={setCaffeineEmptyStomach}
          hydrationGlasses={hydrationGlasses} setHydrationGlasses={setHydrationGlasses}
          morningLight={morningLight} setMorningLight={setMorningLight}
          alcoholLogged={alcoholLogged} setAlcoholLogged={setAlcoholLogged}
          shakyIrritable={shakyIrritable} setShakyIrritable={setShakyIrritable}
          isCheckInSubmitted={isCheckInSubmitted}
          handleSaveCheckIn={handleSaveCheckIn}
          handleResetCheckIn={handleResetCheckIn}
          hydrationReminderEnabled={hydrationReminderEnabled} onHydrationToggle={handleHydrationToggle}
          hydrationInterval={hydrationInterval} onHydrationIntervalChange={handleHydrationIntervalChange}
          meetingReminderEnabled={meetingReminderEnabled} onMeetingToggle={handleMeetingToggle}
          meetingLeadMinutes={meetingLeadMinutes} onMeetingLeadChange={handleMeetingLeadChange}
          breakReminderEnabled={breakReminderEnabled} onBreakToggle={handleBreakToggle}
          breakInterval={breakInterval} onBreakIntervalChange={handleBreakIntervalChange}
        />
      )}

      {/* Safe Coaching Boundary - shown once, not repeated per section */}
      <div className="bg-surface/30 px-5 py-4 rounded-2xl border border-border/20 flex items-start gap-4 text-left relative z-10">
        <ShieldAlert className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted leading-relaxed">
          <span className="font-black uppercase tracking-wider text-[11px] block mb-0.5">Safe Coaching Boundary</span>
          Recovery Fuel provides general wellbeing education and behavioural coaching. It does not diagnose medical conditions or replace personalised medical or nutritional advice.
        </p>
      </div>
    </div>
  );
};

// ---------- My Patterns (secondary view) ----------

const MyPatternsView = (props: {
  isAdult: boolean; onAgeChange: (v: boolean) => void;
  recentCheckins: FuelCheckinRecord[];
  weeklyPatterns: ReturnType<typeof detectFuelPatterns>;
  recentLogsCount: number;
  mostHelpfulAction: ReturnType<typeof computeMostHelpfulFuelAction>;
  accessToken: string | null | undefined;
  hasEaten: boolean | null; setHasEaten: (v: boolean | null) => void;
  skippedBreakfast: boolean | null; setSkippedBreakfast: (v: boolean | null) => void;
  caffeineCount: number; setCaffeineCount: (v: number) => void;
  caffeineTiming: 'early' | 'late' | 'none'; setCaffeineTiming: (v: 'early' | 'late' | 'none') => void;
  caffeineEmptyStomach: boolean | null; setCaffeineEmptyStomach: (v: boolean | null) => void;
  hydrationGlasses: number; setHydrationGlasses: (v: number) => void;
  morningLight: boolean | null; setMorningLight: (v: boolean | null) => void;
  alcoholLogged: boolean | null; setAlcoholLogged: (v: boolean | null) => void;
  shakyIrritable: boolean | null; setShakyIrritable: (v: boolean | null) => void;
  isCheckInSubmitted: boolean;
  handleSaveCheckIn: () => void;
  handleResetCheckIn: () => void;
  hydrationReminderEnabled: boolean; onHydrationToggle: (v: boolean) => void;
  hydrationInterval: number; onHydrationIntervalChange: (v: number) => void;
  meetingReminderEnabled: boolean; onMeetingToggle: (v: boolean) => void;
  meetingLeadMinutes: number; onMeetingLeadChange: (v: number) => void;
  breakReminderEnabled: boolean; onBreakToggle: (v: boolean) => void;
  breakInterval: number; onBreakIntervalChange: (v: number) => void;
}) => {
  const [expandedEducation, setExpandedEducation] = useState<string | null>(null);
  const [showManualLog, setShowManualLog] = useState(false);
  const hasEnoughHistory = props.recentLogsCount >= 3 || props.recentCheckins.length >= 3;

  return (
    <div className="space-y-8 relative z-10">
      {/* Recent Fuel Checks + what tends to help */}
      <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-xs uppercase font-black tracking-wider text-text-main">Recent Fuel Checks</h3>
        </div>
        {!hasEnoughHistory ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-sm font-bold text-text-main">Nova is still learning what supports your recovery.</p>
            <p className="text-xs text-text-muted">A few quick check-ins over time will make these patterns more useful.</p>
          </div>
        ) : (
          <>
            {props.mostHelpfulAction && (
              <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 flex items-center justify-between gap-3">
                <p className="text-xs text-text-main">
                  <span className="font-bold">{FUEL_ACTION_LABELS[props.mostHelpfulAction.action]}</span> tends to help you more consistently than other options.
                </p>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-1 rounded-full shrink-0">
                  {FUEL_PATTERN_CONFIDENCE_LABELS[props.mostHelpfulAction.confidence]}
                </span>
              </div>
            )}
            <div className="space-y-2">
              {props.recentCheckins.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs py-2 border-b border-border/20 last:border-0">
                  <span className="text-text-muted">{c.trigger === 'proactive' ? 'Nova noticed' : FUEL_TRIGGER_LABELS[c.trigger]} → {FUEL_ACTION_LABELS[c.action]}</span>
                  {c.helpful && <span className="text-[10px] font-bold text-text-muted uppercase">{c.helpful === 'yes' ? 'Helped' : c.helpful === 'a_little' ? 'A little' : 'Not much'}</span>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Weekly patterns - reuses detectFuelPatterns unchanged */}
      {props.weeklyPatterns.length > 0 && (
        <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
          <div>
            <h3 className="text-xs uppercase font-black tracking-wider text-text-main">What tends to make days harder</h3>
            <p className="text-xs text-text-muted mt-0.5">Based on your last {props.recentLogsCount} logged days, not just today</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {props.weeklyPatterns.map((pattern) => {
              const copy = FUEL_PATTERN_COPY[pattern.id];
              return (
                <div key={pattern.id} className="bg-white/40 dark:bg-card/40 p-4 rounded-xl border border-border/10 space-y-2">
                  <h4 className="text-xs font-black text-text-main">{copy.title}</h4>
                  <p className="text-[11px] text-text-muted leading-relaxed">{copy.description}</p>
                  <p className="text-[11px] font-medium leading-normal text-[#9a3412] dark:text-primary italic">"{copy.coaching}"</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reminder preferences */}
      <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-5">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-xs uppercase font-black tracking-wider text-text-main">Reminder Preferences</h3>
            <p className="text-[11px] text-text-muted mt-0.5">In-app only - these appear while Blaze Break is open in this tab, not as background push notifications.</p>
          </div>
        </div>

        <ReminderRow label="Hydration" description="A gentle check-in on a timer." enabled={props.hydrationReminderEnabled} onToggle={props.onHydrationToggle}>
          {props.hydrationReminderEnabled && (
            <IntervalPicker value={props.hydrationInterval} onChange={props.onHydrationIntervalChange} options={[60, 90, 120, 180]} />
          )}
        </ReminderRow>

        <ReminderRow label="Before meetings" description={props.accessToken ? 'Uses your connected calendar to find upcoming meetings.' : 'Connect your calendar in Micro-Recovery to enable this.'} enabled={props.meetingReminderEnabled} onToggle={props.onMeetingToggle} disabled={!props.accessToken}>
          {props.meetingReminderEnabled && (
            <IntervalPicker value={props.meetingLeadMinutes} onChange={props.onMeetingLeadChange} options={[5, 10, 15, 30]} suffix="min before" />
          )}
        </ReminderRow>

        <ReminderRow label="Recovery breaks" description="A nudge to pause and refuel after a while without one." enabled={props.breakReminderEnabled} onToggle={props.onBreakToggle}>
          {props.breakReminderEnabled && (
            <IntervalPicker value={props.breakInterval} onChange={props.onBreakIntervalChange} options={[90, 120, 180, 240]} />
          )}
        </ReminderRow>
      </div>

      {/* Connected data sources */}
      <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-3">
        <h3 className="text-xs uppercase font-black tracking-wider text-text-main">Connected Data Sources</h3>
        <div className="text-xs text-text-muted space-y-1.5">
          <p>Capacity &amp; Energy Delta - connected (from your check-ins)</p>
          <p>Recovery Debt sleep data - connected</p>
          <p>Google Calendar - {props.accessToken ? 'connected' : 'not connected'}</p>
        </div>
      </div>

      {/* Manual detailed log - optional, for people who want it */}
      <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
        <button onClick={() => setShowManualLog((v) => !v)} className="w-full flex items-center justify-between text-left">
          <div>
            <h3 className="text-xs uppercase font-black tracking-wider text-text-main">Detailed Daily Log</h3>
            <p className="text-[11px] text-text-muted mt-0.5">Optional - for tracking more than the Quick Actions capture.</p>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform', showManualLog && 'rotate-180')} />
        </button>
        {showManualLog && (
          <ManualFuelLog {...props} />
        )}
      </div>

      {/* Education */}
      <div className="space-y-3">
        <h3 className="text-xs uppercase font-black tracking-wider text-text-main px-1">Learn Why</h3>
        <EducationCard id="gut_brain" expanded={expandedEducation} setExpanded={setExpandedEducation} icon={Heart}
          title="Gut-Brain Connection" subtitle="How everyday habits can affect how you feel">
          The digestive system and brain communicate through nervous, hormonal and immune pathways - the vagus nerve is one part of this, not the whole story.
          Irregular eating and chronic stress can contribute to feeling foggy or on edge, but many things affect how you feel day to day. This is educational, not a diagnosis.
        </EducationCard>
        <EducationCard id="supplements" expanded={expandedEducation} setExpanded={setExpandedEducation} icon={Info}
          title="Supplement Literacy" subtitle="Supplements aren't a shortcut for recovery">
          Some vitamins and minerals are essential for normal health, but supplements are not automatically useful just because you're stressed or tired.
          If you suspect a deficiency, take medication, are pregnant, or are under 18, speak to a qualified healthcare professional rather than self-prescribing.
        </EducationCard>
        <EducationCard id="steadier_fuel" expanded={expandedEducation} setExpanded={setExpandedEducation} icon={Activity}
          title="Steadier Fuel" subtitle="Why regular meals can help">
          Long gaps without food can leave some people feeling hungry, tired or less able to concentrate. Regular meals and snacks can make demanding days easier to navigate - this isn't about any single food fixing a feeling.
        </EducationCard>
        <EducationCard id="daylight" expanded={expandedEducation} setExpanded={setExpandedEducation} icon={Sun}
          title="Daylight" subtitle="Why timing can matter">
          Light and darkness help regulate sleep-wake timing. Daylight earlier in your waking day can help reinforce that rhythm - there's no exact minute threshold that makes or breaks it.
        </EducationCard>
        <EducationCard id="food_ideas" expanded={expandedEducation} setExpanded={setExpandedEducation} icon={Apple}
          title="Easy Fuel Ideas" subtitle="A few simple, portable options">
          Wholegrain options, fruit and vegetables, protein-containing foods, nuts and seeds where appropriate, yoghurt or alternatives, beans and pulses.
          Always respect allergies, dietary requirements, and cultural or religious food preferences - these are ideas, not a prescription.
        </EducationCard>
        {props.isAdult && (
          <EducationCard id="alcohol" expanded={expandedEducation} setExpanded={setExpandedEducation} icon={Wine}
            title="Alcohol &amp; Recovery" subtitle="A brief, honest note on sleep">
            Alcohol can feel relaxing in the short term, but it can disrupt sleep quality later in the night, which can affect how recovered you feel the next day.
            This is general educational information, not a tracking or compliance tool.
          </EducationCard>
        )}
      </div>

      {/* Age setting */}
      <div className="bg-surface/30 px-5 py-4 rounded-2xl border border-border/40 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <span className="text-[11px] font-black uppercase tracking-wider text-text-muted block">Account Age Setting</span>
          <p className="text-[10px] text-text-muted mt-0.5">Hides alcohol content and other adult-only material automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => props.onAgeChange(true)} className={cn('py-1.5 px-3 rounded-lg text-[11px] font-black uppercase tracking-widest border', props.isAdult ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-text-muted border-border')}>Adult 18+</button>
          <button onClick={() => props.onAgeChange(false)} className={cn('py-1.5 px-3 rounded-lg text-[11px] font-black uppercase tracking-widest border', !props.isAdult ? 'bg-primary text-primary-foreground border-primary' : 'bg-transparent text-text-muted border-border')}>Under 18</button>
        </div>
      </div>
    </div>
  );
};

const ReminderRow = ({ label, description, enabled, onToggle, disabled, children }: { label: string; description: string; enabled: boolean; onToggle: (v: boolean) => void; disabled?: boolean; children?: React.ReactNode }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-border/20 last:border-0">
    <div className="flex-1">
      <p className="text-xs font-bold text-text-main">{label}</p>
      <p className="text-[11px] text-text-muted mt-0.5">{description}</p>
    </div>
    <div className="flex items-center gap-3">
      {children}
      <button onClick={() => onToggle(!enabled)} disabled={disabled} aria-pressed={enabled}
        className={cn('w-11 h-6 rounded-full transition-all relative shrink-0', enabled ? 'bg-primary' : 'bg-border', disabled && 'opacity-40 cursor-not-allowed')}>
        <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', enabled ? 'left-5' : 'left-0.5')} />
      </button>
    </div>
  </div>
);

const IntervalPicker = ({ value, onChange, options, suffix }: { value: number; onChange: (v: number) => void; options: number[]; suffix?: string }) => (
  <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="bg-white dark:bg-card border border-border rounded-lg px-2 py-1.5 text-xs font-bold text-text-main">
    {options.map((o) => <option key={o} value={o}>{o} {suffix || 'min'}</option>)}
  </select>
);

const EducationCard = ({ id, expanded, setExpanded, icon: Icon, title, subtitle, children }: { id: string; expanded: string | null; setExpanded: (v: string | null) => void; icon: any; title: string; subtitle: string; children: React.ReactNode }) => (
  <div className="bg-surface dark:bg-surface rounded-2xl border border-border/40 overflow-hidden">
    <button onClick={() => setExpanded(expanded === id ? null : id)} className="w-full flex items-center gap-3 p-4 text-left">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0"><Icon className="w-4 h-4" /></div>
      <div className="flex-1">
        <h4 className="text-xs font-black text-text-main">{title}</h4>
        <p className="text-[11px] text-text-muted">{subtitle}</p>
      </div>
      <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform shrink-0', expanded === id && 'rotate-180')} />
    </button>
    {expanded === id && <p className="px-4 pb-4 text-xs text-text-muted leading-relaxed">{children}</p>}
  </div>
);

const ManualFuelLog = (props: {
  hasEaten: boolean | null; setHasEaten: (v: boolean | null) => void;
  skippedBreakfast: boolean | null; setSkippedBreakfast: (v: boolean | null) => void;
  caffeineCount: number; setCaffeineCount: (v: number) => void;
  caffeineTiming: 'early' | 'late' | 'none'; setCaffeineTiming: (v: 'early' | 'late' | 'none') => void;
  caffeineEmptyStomach: boolean | null; setCaffeineEmptyStomach: (v: boolean | null) => void;
  hydrationGlasses: number; setHydrationGlasses: (v: number) => void;
  morningLight: boolean | null; setMorningLight: (v: boolean | null) => void;
  alcoholLogged: boolean | null; setAlcoholLogged: (v: boolean | null) => void;
  shakyIrritable: boolean | null; setShakyIrritable: (v: boolean | null) => void;
  isCheckInSubmitted: boolean;
  handleSaveCheckIn: () => void;
  handleResetCheckIn: () => void;
  isAdult: boolean;
}) => (
  <div className="space-y-5 pt-2">
    <ToggleField label="Has eating been fairly regular today?" value={props.hasEaten} onYes={() => { props.setHasEaten(true); props.setSkippedBreakfast(false); }} onNo={() => props.setHasEaten(false)} yesLabel="Regular enough" noLabel="A bit irregular" />
    {props.hasEaten === false && (
      <ToggleField label="Long gaps without eating today?" value={props.skippedBreakfast} onYes={() => props.setSkippedBreakfast(true)} onNo={() => props.setSkippedBreakfast(false)} yesLabel="Yes, long gaps" noLabel="Just a bit late" />
    )}

    <div className="space-y-2">
      <label className="text-xs font-bold text-text-main flex items-center justify-between"><span>Caffeine today</span><span className="font-mono text-xs text-text-muted">{props.caffeineCount}</span></label>
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3, 4, 5].map((cnt) => (
          <button key={cnt} onClick={() => { props.setCaffeineCount(cnt); if (cnt === 0) props.setCaffeineTiming('none'); else if (props.caffeineTiming === 'none') props.setCaffeineTiming('early'); }}
            aria-pressed={props.caffeineCount === cnt}
            className={cn('flex-1 py-2 rounded-lg text-xs font-mono font-bold border', props.caffeineCount === cnt ? 'bg-primary text-primary-foreground border-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>
            {cnt === 5 ? '5+' : cnt}
          </button>
        ))}
      </div>
    </div>

    {props.caffeineCount > 0 && (
      <ToggleField label="Caffeine later in your day?" value={props.caffeineTiming === 'late'} onYes={() => props.setCaffeineTiming('late')} onNo={() => props.setCaffeineTiming('early')} yesLabel="Later in the day" noLabel="Earlier in the day" />
    )}

    <div className="space-y-2">
      <label className="text-xs font-bold text-text-main">Had much to drink today?</label>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => props.setHydrationGlasses(1)} className={cn('py-2.5 rounded-xl text-xs font-bold border', props.hydrationGlasses >= 6 ? 'bg-primary/10 border-primary/45 text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>Yes</button>
        <button onClick={() => props.setHydrationGlasses(3)} className={cn('py-2.5 rounded-xl text-xs font-bold border', props.hydrationGlasses > 0 && props.hydrationGlasses < 6 ? 'bg-primary/10 border-primary/45 text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>A bit</button>
        <button onClick={() => props.setHydrationGlasses(0)} className={cn('py-2.5 rounded-xl text-xs font-bold border', props.hydrationGlasses === 0 ? 'bg-primary/10 border-primary/45 text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>Not much</button>
      </div>
      <p className="text-[11px] text-text-muted leading-relaxed">Not drinking enough can contribute to tiredness, headaches and difficulty concentrating.</p>
    </div>

    <ToggleField label="Have you spent some time in natural daylight today?" value={props.morningLight} onYes={() => props.setMorningLight(true)} onNo={() => props.setMorningLight(false)} yesLabel="Yes" noLabel="Not yet" />

    {props.isAdult && (
      <ToggleField label="Any alcohol yesterday?" value={props.alcoholLogged} onYes={() => props.setAlcoholLogged(true)} onNo={() => props.setAlcoholLogged(false)} yesLabel="Yes" noLabel="No" />
    )}

    <div className="space-y-2">
      <label className="text-xs font-bold text-text-main">How steady do you feel right now?</label>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => props.setShakyIrritable(false)} className={cn('py-2.5 rounded-xl text-xs font-bold border', props.shakyIrritable === false ? 'bg-primary/10 border-primary/45 text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>Steady</button>
        <button onClick={() => props.setShakyIrritable(null)} className={cn('py-2.5 rounded-xl text-xs font-bold border', props.shakyIrritable === null ? 'bg-primary/10 border-primary/45 text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>A little flat</button>
        <button onClick={() => props.setShakyIrritable(true)} className={cn('py-2.5 rounded-xl text-xs font-bold border', props.shakyIrritable === true ? 'bg-destructive/10 border-destructive/40 text-destructive' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>Drained</button>
      </div>
    </div>

    <div className="flex items-center gap-3 pt-2">
      <button onClick={props.handleSaveCheckIn} className="btn-primary py-3 px-6 text-xs font-black uppercase tracking-widest">Save Today's Log</button>
      {props.isCheckInSubmitted && <button onClick={props.handleResetCheckIn} className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">Reset</button>}
    </div>
  </div>
);

const ToggleField = ({ label, value, onYes, onNo, yesLabel, noLabel }: { label: string; value: boolean | null; onYes: () => void; onNo: () => void; yesLabel: string; noLabel: string }) => (
  <div className="space-y-2">
    <label className="text-xs font-bold text-text-main">{label}</label>
    <div className="grid grid-cols-2 gap-2">
      <button onClick={onYes} aria-pressed={value === true} className={cn('py-2.5 rounded-xl text-xs font-bold border', value === true ? 'bg-primary/10 border-primary/45 text-primary' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>{yesLabel}</button>
      <button onClick={onNo} aria-pressed={value === false} className={cn('py-2.5 rounded-xl text-xs font-bold border', value === false ? 'bg-destructive/10 border-destructive/40 text-destructive' : 'bg-white dark:bg-surface border-border/40 text-text-muted')}>{noLabel}</button>
    </div>
  </div>
);
