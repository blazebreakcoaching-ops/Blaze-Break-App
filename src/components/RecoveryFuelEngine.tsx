import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Coffee,
  Sun,
  Droplet,
  Apple,
  Heart,
  Info,
  ShieldAlert,
  Sparkles,
  Clock,
  Check,
  Compass,
  ArrowRight,
  Wine,
  Activity,
  Lightbulb
} from 'lucide-react';
import { cn } from '../lib/utils';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { useAuth } from '../lib/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

import { SHIPStage } from '../types';

interface RecoveryFuelEngineProps {
  fingerprint?: any;
  onAwardPoints?: (amount: number, reason: string) => void;
  currentStage?: SHIPStage;
}

export const RecoveryFuelEngine = ({ 
  fingerprint, 
  onAwardPoints,
  currentStage = 'Safety'
}: RecoveryFuelEngineProps) => {
  // Configured with age state
  const [isAdult, setIsAdult] = useState<boolean>(() => {
    const saved = localStorage.getItem('blaze_user_is_adult');
    return saved === 'true';
  });

  const handleAgeChange = (value: boolean) => {
    setIsAdult(value);
    localStorage.setItem('blaze_user_is_adult', String(value));
    if (onAwardPoints) {
      onAwardPoints(5, "Demographic Verification Calibrated");
    }
  };

  // Fuel Tracker local states
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
  const [activeTab, setActiveTab] = useState<'tracker' | 'education' | 'insights'>('tracker');

  // Hydration and Meal Timing Reminders & Alerts - these are the real,
  // user-configured setup, persisted to Firestore so they follow the
  // person across devices rather than being trapped in one browser.
  const { accessToken, signInWithCalendar } = useAuth();
  const [hydrationReminderEnabled, setHydrationReminderEnabled] = useState<boolean>(false);
  const [hydrationInterval, setHydrationInterval] = useState<number>(90);
  const [meetingReminderEnabled, setMeetingReminderEnabled] = useState<boolean>(false);
  const [meetingLeadMinutes, setMeetingLeadMinutes] = useState<number>(15);
  const [emotionalReminderEnabled, setEmotionalReminderEnabled] = useState<boolean>(false);
  const [emotionalInterval, setEmotionalInterval] = useState<number>(120);
  const [reminderPrefsLoaded, setReminderPrefsLoaded] = useState(false);
  const [savingReminderPrefs, setSavingReminderPrefs] = useState(false);
  const [activeNudge, setActiveNudge] = useState<{
    type: 'hydration' | 'meeting' | 'emotional';
    title: string;
    message: string;
  } | null>(null);

  // Fetch real reminder preferences on mount.
  useEffect(() => {
    const loadPrefs = async () => {
      if (!auth.currentUser) { setReminderPrefsLoaded(true); return; }
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'preferences', 'fuel_reminders'));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.hydrationEnabled === 'boolean') setHydrationReminderEnabled(data.hydrationEnabled);
          if (typeof data.hydrationIntervalMinutes === 'number') setHydrationInterval(data.hydrationIntervalMinutes);
          if (typeof data.meetingEnabled === 'boolean') setMeetingReminderEnabled(data.meetingEnabled);
          if (typeof data.meetingLeadMinutes === 'number') setMeetingLeadMinutes(data.meetingLeadMinutes);
          if (typeof data.emotionalEnabled === 'boolean') setEmotionalReminderEnabled(data.emotionalEnabled);
          if (typeof data.emotionalIntervalMinutes === 'number') setEmotionalInterval(data.emotionalIntervalMinutes);
        }
      } catch (e) {
        // Leaves the defaults (all off) in place - an honest starting point
        // rather than silently assuming preferences that were never set.
      }
      setReminderPrefsLoaded(true);
    };
    loadPrefs();
  }, []);

  // Persists whichever fields changed. Called explicitly by each handler
  // below rather than on every render, so a single toggle click is a single
  // write, not a write-per-keystroke while adjusting a slider.
  const saveReminderPrefs = async (updates: Record<string, any>) => {
    if (!auth.currentUser) return;
    setSavingReminderPrefs(true);
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'preferences', 'fuel_reminders'), {
        ...updates,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      // Non-fatal - the local UI state still reflects the change even if
      // the persisted write fails; it'll just fall back to the last-saved
      // value next time this loads.
    }
    setSavingReminderPrefs(false);
  };


  // Load check-in state if saved for today
  useEffect(() => {
    const loadTodayFuelLog = async () => {
      if (!auth.currentUser) return;
      const today = new Date().toISOString().split('T')[0];
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'recovery_fuel_logs', today));
        if (snap.exists()) {
          const parsed = snap.data();
          setHasEaten(parsed.hasEaten);
          setSkippedBreakfast(parsed.skippedBreakfast);
          setCaffeineCount(parsed.caffeineCount);
          setCaffeineTiming(parsed.caffeineTiming);
          setCaffeineEmptyStomach(parsed.caffeineEmptyStomach);
          setHydrationGlasses(parsed.hydrationGlasses);
          setMorningLight(parsed.morningLight);
          setAlcoholLogged(parsed.alcoholLogged);
          setShakyIrritable(parsed.shakyIrritable);
          setIsCheckInSubmitted(true);
        }
      } catch (e) {
        // Leaves the honest empty state in place rather than pretending today's log loaded.
      }
    };
    loadTodayFuelLog();
  }, []);

  const handleSaveCheckIn = () => {
    const today = new Date().toISOString().split('T')[0];
    const fuelData = {
      hasEaten,
      skippedBreakfast,
      caffeineCount,
      caffeineTiming,
      caffeineEmptyStomach,
      hydrationGlasses,
      morningLight,
      alcoholLogged: isAdult ? alcoholLogged : false,
      shakyIrritable,
      timestamp: new Date().toISOString()
    };

    if (auth.currentUser) {
      const { timestamp, ...fuelDataForFirestore } = fuelData;
      setDoc(doc(db, 'users', auth.currentUser.uid, 'recovery_fuel_logs', today), {
        ...fuelDataForFirestore,
        createdAt: timestamp,
        updatedAt: timestamp,
      }, { merge: true }).catch(() => {
        // Non-fatal - the UI still reflects the change locally even if this save fails.
      });
    }
    setIsCheckInSubmitted(true);

    // Build specific feedback context for Nova memory baseline
    let contextStr = "Recovery Fuel state updated: ";
    if (hasEaten === false || skippedBreakfast === true) {
      contextStr += "Skipped meals detected. ";
    }
    if (caffeineCount > 3 || caffeineTiming === 'late') {
      contextStr += "High caffeine or late intake patterns flagged. ";
    }
    if (hydrationGlasses < 5) {
      contextStr += "Hydration metrics under baseline guidelines. ";
    }
    if (morningLight === false) {
      contextStr += "Circadian synchronization light missing. ";
    }
    if (isAdult && alcoholLogged === true) {
      contextStr += "Alcohol logged (reduced REM recovery probability). ";
    }
    if (shakyIrritable === true) {
      contextStr += "User reports hypoglycemic symptoms (shaky, irritable). ";
    }

    updateNovaMemoryBySourceAndType(
      'Recovery Fuel Engine',
      'state',
      {
        content: contextStr,
        canEdit: false,
        confidence: 'high'
      }
    );

    if (onAwardPoints) {
      onAwardPoints(25, "Biometric Fuel Synchronization Logged");
      if (morningLight && hydrationGlasses >= 6 && hasEaten) {
        onAwardPoints(15, "Perfect Physiological Alignment Badge Unlocked");
      }
    }
  };

  const handleResetCheckIn = () => {
    const today = new Date().toISOString().split('T')[0];
    if (auth.currentUser) {
      deleteDoc(doc(db, 'users', auth.currentUser.uid, 'recovery_fuel_logs', today)).catch(() => {
        // Non-fatal - the UI still resets locally even if this delete fails.
      });
    }
    setHasEaten(null);
    setSkippedBreakfast(null);
    setCaffeineCount(0);
    setCaffeineTiming('none');
    setCaffeineEmptyStomach(null);
    setHydrationGlasses(0);
    setMorningLight(null);
    setAlcoholLogged(null);
    setShakyIrritable(null);
    setIsCheckInSubmitted(false);
  };

  const handleHydrationToggle = (val: boolean) => {
    setHydrationReminderEnabled(val);
    saveReminderPrefs({ hydrationEnabled: val });
    if (onAwardPoints && val) {
      onAwardPoints(5, "Hydration Schedule Set");
    }
  };

  const handleHydrationIntervalChange = (val: number) => {
    setHydrationInterval(val);
    saveReminderPrefs({ hydrationIntervalMinutes: val });
  };

  const handleMeetingToggle = (val: boolean) => {
    setMeetingReminderEnabled(val);
    saveReminderPrefs({ meetingEnabled: val });
    if (onAwardPoints && val) {
      onAwardPoints(5, "Pre-Meeting Nutrition Shield Enabled");
    }
  };

  const handleMeetingLeadChange = (val: number) => {
    setMeetingLeadMinutes(val);
    saveReminderPrefs({ meetingLeadMinutes: val });
  };

  const handleEmotionalToggle = (val: boolean) => {
    setEmotionalReminderEnabled(val);
    saveReminderPrefs({ emotionalEnabled: val });
    if (onAwardPoints && val) {
      onAwardPoints(5, "Emotional Decision Fuel Buffer Activated");
    }
  };

  const handleEmotionalIntervalChange = (val: number) => {
    setEmotionalInterval(val);
    saveReminderPrefs({ emotionalIntervalMinutes: val });
  };

  const triggerHydrationTest = () => {
    setActiveNudge({
      type: 'hydration',
      title: 'Time for water',
      message: "Nova here — you haven't logged water in a while, and even mild dehydration can feel a lot like fatigue or brain fog. Take a moment for a full glass."
    });
  };

  const triggerMeetingTest = () => {
    setActiveNudge({
      type: 'meeting',
      title: 'Before your next meeting',
      message: "Nova here — you've got a high-stakes call coming up. Going in without eating can spike your stress response and make it harder to stay steady. A handful of almonds, an oatcake, or something slow-release now could help."
    });
  };

  const triggerEmotionalTest = () => {
    setActiveNudge({
      type: 'emotional',
      title: 'A quick check before you respond',
      message: "Nova here — if you're feeling resentful, defensive, or about to send a heavy message, it might be worth pausing. Big decisions are harder on an empty stomach. Worth eating something first."
    });
  };

  // ============ Real Scheduling Engine ============
  // Everything below actually fires reminders on its own, on the schedule
  // the person configured - the "Preview" buttons above only show what a
  // reminder looks like on demand; this is what makes them genuinely happen
  // without anyone needing to click anything.

  const lastHydrationFiredRef = useRef<number>(Number(localStorage.getItem('blaze_fuel_last_hydration_fired') || 0));
  const lastEmotionalFiredRef = useRef<number>(Number(localStorage.getItem('blaze_fuel_last_emotional_fired') || 0));
  const lastCalendarFetchRef = useRef<number>(0);
  const cachedEventsRef = useRef<{ id: string; summary: string; startMs: number }[]>([]);
  const remindedMeetingIdsRef = useRef<Set<string>>(new Set(
    JSON.parse(localStorage.getItem('blaze_fuel_reminded_meetings') || '[]')
  ));

  useEffect(() => {
    if (!reminderPrefsLoaded) return;

    const checkSchedule = async () => {
      if (activeNudge) return; // don't stack reminders on top of one another
      const now = Date.now();

      if (hydrationReminderEnabled) {
        const dueAt = lastHydrationFiredRef.current + hydrationInterval * 60000;
        if (now >= dueAt) {
          setActiveNudge({
            type: 'hydration',
            title: 'Time for water',
            message: "Nova here — you haven't logged water in a while, and even mild dehydration can feel a lot like fatigue or brain fog. Take a moment for a full glass."
          });
          lastHydrationFiredRef.current = now;
          localStorage.setItem('blaze_fuel_last_hydration_fired', String(now));
          return;
        }
      }

      if (emotionalReminderEnabled) {
        const dueAt = lastEmotionalFiredRef.current + emotionalInterval * 60000;
        if (now >= dueAt) {
          setActiveNudge({
            type: 'emotional',
            title: 'A quick check-in',
            message: "Nova here — worth a quick check: if you're feeling resentful, defensive, or about to send a heavy message right now, big decisions are harder on an empty stomach. Worth eating something first."
          });
          lastEmotionalFiredRef.current = now;
          localStorage.setItem('blaze_fuel_last_emotional_fired', String(now));
          return;
        }
      }

      if (meetingReminderEnabled && accessToken) {
        // Real calendar data, refetched at most every 5 minutes - the
        // per-tick check below just re-scans the cached list, so a genuine
        // API call only happens this rarely.
        const minutesSinceFetch = (now - lastCalendarFetchRef.current) / 60000;
        if (lastCalendarFetchRef.current === 0 || minutesSinceFetch >= 5) {
          lastCalendarFetchRef.current = now;
          try {
            const start = new Date();
            const end = new Date(start.getTime() + 4 * 60 * 60 * 1000); // next 4 hours is plenty for a lead-time check
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&singleEvents=true&orderBy=startTime`;
            const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (res.ok) {
              const data = await res.json();
              cachedEventsRef.current = (data.items || [])
                .filter((item: any) => item.start?.dateTime)
                .map((item: any) => ({
                  id: item.id,
                  summary: item.summary || 'Untitled meeting',
                  startMs: new Date(item.start.dateTime).getTime(),
                }));
            }
          } catch (e) {
            // Non-fatal - just means no meeting reminder fires this cycle.
          }
        }

        const upcoming = cachedEventsRef.current.find(ev => {
          if (remindedMeetingIdsRef.current.has(ev.id)) return false;
          const minutesUntil = (ev.startMs - now) / 60000;
          return minutesUntil > 0 && minutesUntil <= meetingLeadMinutes;
        });
        if (upcoming) {
          setActiveNudge({
            type: 'meeting',
            title: 'Before your next meeting',
            message: `Nova here — "${upcoming.summary}" starts in about ${meetingLeadMinutes} minutes. Going in without eating can spike your stress response. A handful of almonds, an oatcake, or something slow-release now could help.`
          });
          remindedMeetingIdsRef.current.add(upcoming.id);
          localStorage.setItem('blaze_fuel_reminded_meetings', JSON.stringify(Array.from(remindedMeetingIdsRef.current).slice(-50)));
        }
      }
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 60000);
    return () => clearInterval(interval);
  }, [reminderPrefsLoaded, hydrationReminderEnabled, hydrationInterval, emotionalReminderEnabled, emotionalInterval, meetingReminderEnabled, meetingLeadMinutes, accessToken, activeNudge]);

  // Insight generator based on state
  const getDynamicInsights = () => {
    const insights = [];

    if (hasEaten === false || skippedBreakfast === true) {
      insights.push({
        title: "Sunder-Load Meal Gaps",
        type: "critical" as const,
        description: "Skipping meals triggers physiological emergency protocols. Epinephrine surges to mobilize liver glycogen, mimicking sudden anxiety and creating false panic signals.",
        coaching: "Do not attempt deep boundary discussions or major strategic decisions while nutrient-derived glucose is flatlined. Eat slow-release starch first."
      });
    }

    if (caffeineEmptyStomach === true) {
      insights.push({
        title: "Caffeine on an Empty Stomach",
        type: "warning" as const,
        description: "Drinking caffeine on an empty stomach triggers pre-mature cortisol spikes and damages gastric mucosa. It trains the nervous system to remain hyper-vigilant.",
        coaching: "Consume a protein baseline (e.g. eggs, seeds, toast) before drinking coffee. Restrict caffeine after 12:00 PM."
      });
    }

    if (caffeineCount > 3) {
      insights.push({
        title: "Caffeine Compensation Loop",
        type: "warning" as const,
        description: "Borrowing energy from tomorrow. High caffeine intake suppresses adenosine accumulation, meaning physical fatigue is just masked, not resolved.",
        coaching: "Gradually taper down to 1-2 cups of coffee. Consider substituting the third cup with herbal ginger tea or dynamic movement."
      });
    }

    if (hydrationGlasses < 5) {
      insights.push({
        title: "Subclinical Neural Dehydration",
        type: "info" as const,
        description: "A 1.5% decrease in optimal hydration causes immediate cognitive fatigue, memory latency, and poor emotional regulation.",
        coaching: "Place a high-contrast physical container on your workspace. Drink a full glass during meeting transitions."
      });
    }

    if (morningLight === false) {
      insights.push({
        title: "Melatonin Suppression Mismatch",
        type: "info" as const,
        description: "Failing to expose the visual cortex to bright natural light before 9:00 AM delays noctural melatonin production by up to 3 hours, destroying deep sleep architecture.",
        coaching: "Spend 5-10 minutes outdoors immediately after waking, even on cloudy mornings. Keep phone screens dark after 9:30 PM."
      });
    }

    if (isAdult && alcoholLogged === true) {
      insights.push({
        title: "Sedative-Induced Sleep Fragmentation",
        type: "critical" as const,
        description: "Alcohol may decompress mood temporarily, but acts as a central nervous sedative. It blocks physiological REM sleep and raises nocturnal body temperature, preventing true nervous recovery.",
        coaching: "Avoid alcohol within 4 hours of sleeping. Track next-day energy depletion scores to inspect individual tolerances."
      });
    }

    if (!isAdult && alcoholLogged !== null) {
      insights.push({
        title: "Youth Circadian Baseline",
        type: "info" as const,
        description: "Adolescent brain development is heavily reliant on deep REM sleep and natural melatonin cycles. Secondary stimulants or sleep-inhibitors trigger persistent neural exhaustion.",
        coaching: "Prioritize consistent wake times and high-density nutrient intake over active screens."
      });
    }

    // Default insights
    if (insights.length === 0) {
      insights.push({
        title: "Physiological Baseline Restored",
        type: "success" as const,
        description: "Your fuel rhythm metrics match the optimized guidelines. Your hormone fluxes are stabilized.",
        coaching: "Stable nutrition translates to a robust psychological perimeter. Rehearse boundary parameters with maximum firmness today."
      });
    }

    return insights;
  };

  return (
    <div className="card border border-border p-6 sm:p-8 md:p-10 rounded-xl space-y-10 relative overflow-hidden" id="recovery_fuel_engine_container">
      {/* Active Nudge Notification Banner */}
      <AnimatePresence>
        {activeNudge && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={cn(
              "absolute top-6 left-6 right-6 z-50 p-6 rounded-xl border shadow-lg flex flex-col md:flex-row items-start justify-between gap-4 animate-in",
              activeNudge.type === 'hydration' ? "bg-primary/5 border-primary/30 text-text-main" :
              activeNudge.type === 'meeting' ? "bg-warning/10 border-warning/30 text-warning-foreground dark:text-warning" :
              "bg-destructive/10 border-destructive/30 text-text-main"
            )}
            id="active_nova_fuel_nudge"
          >
            <div className="flex gap-4 items-start">
              <div className={cn(
                "w-11 h-11 rounded-lg flex items-center justify-center shrink-0",
                activeNudge.type === 'hydration' ? "bg-surface text-text-main" :
                activeNudge.type === 'meeting' ? "bg-warning/20 text-[#9a3412] dark:text-warning" :
                "bg-destructive/20 text-destructive"
              )}>
                {activeNudge.type === 'hydration' ? <Droplet className="w-5 h-5" /> :
                 activeNudge.type === 'meeting' ? <Clock className="w-5 h-5" /> :
                 <ShieldAlert className="w-5 h-5" />}
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium uppercase tracking-widest  flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-primary" /> Nova Check-in
                </span>
                <h4 className="text-base font-bold tracking-tight">{activeNudge.title}</h4>
                <p className="text-xs leading-relaxed opacity-90 max-w-2xl">{activeNudge.message}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              {activeNudge.type === 'hydration' ? (
                <button
                  onClick={() => {
                    setHydrationGlasses(prev => Math.min(8, prev + 1));
                    setActiveNudge(null);
                    if (onAwardPoints) {
                      onAwardPoints(10, "Hydration Reminder Actioned");
                    }
                  }}
                  className="px-4 py-2 bg-sky-500 hover:bg-text-main hover:text-background text-[#1c1917] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Drink Glass (+10 pts)
                </button>
              ) : (
                <button
                  onClick={() => {
                    setActiveNudge(null);
                    if (onAwardPoints) {
                      onAwardPoints(15, "Adrenaline Checkpoint Safeguarded");
                    }
                  }}
                  className="px-4 py-2 bg-primary-light hover:bg-primary text-[#1c1917] dark:text-text-main dark:hover:text-[#1c1917] font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
                >
                  Fueled Up (+15 pts)
                </button>
              )}
              <button
                onClick={() => setActiveNudge(null)}
                className="px-3 py-2 border border-border/20 text-text-muted hover:text-text-main font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-surface/30 transition-all cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flag / Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-border/40 relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
            <Apple className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-[0.25em] text-[#9a3412] dark:text-primary px-3 py-1 bg-primary/10 rounded-full border border-primary/15">
                Pillar 3: Habits & Physiological Fuel
              </span>
              <span className="text-[11px] font-bold text-text-muted flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-primary" /> Connected to Nova
              </span>
            </div>
            <h2 className="text-3xl font-display font-black text-text-main tracking-tight mt-2">
              Recovery Fuel Engine
            </h2>
            <p className="text-xs text-text-muted mt-1 max-w-xl leading-relaxed">
              Understand how nutrient timing, hydration, caffeine cycle, morning sunlight, and sleep structure affect baseline stability. No calorie counting. No diets. Genuine burnout recovery support.
            </p>
          </div>
        </div>

        {/* Age Restriction Controller */}
        <div className="bg-surface/30 px-5 py-4 rounded-2xl border border-border/40 flex flex-col gap-2 min-w-[200px]">
          <span className="text-[11px] font-black uppercase tracking-wider text-text-muted">Age Demographic Toggle</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAgeChange(true)}
              className={cn(
                "flex-1 py-1 px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all border",
                isAdult 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-transparent text-text-muted border-transparent"
              )}
            >
              Adult 18+
            </button>
            <button
              onClick={() => handleAgeChange(false)}
              className={cn(
                "flex-1 py-1 px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all border",
                !isAdult 
                  ? "bg-primary text-primary-foreground border-primary" 
                  : "bg-transparent text-text-muted border-transparent"
              )}
            >
              Youth &lt;18
            </button>
          </div>
          <p className="text-[10px] text-text-muted tracking-normal text-center leading-normal">
            Hides alcohol tracking parameters automatically contextually.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-surface/30 p-1.5 rounded-2xl border border-border/20 max-w-md">
        {[
          { id: 'tracker', label: 'Daily Fuel Log', icon: Activity },
          { id: 'insights', label: 'Biometric Pattern Insights', icon: Lightbulb },
          { id: 'education', label: 'Gut-Brain & Supplement Literacy', icon: Info },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex-1 py-2.5 px-3 rounded-xl text-xs uppercase font-black tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer",
              activeTab === tab.id 
                ? "bg-white dark:bg-card text-primary shadow-md shadow-primary/5 border border-border/30" 
                : "text-text-muted hover:text-text-main bg-transparent border-transparent"
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Main Sections */}
      <AnimatePresence mode="wait">
        {activeTab === 'tracker' && (
          <motion.div
            key="tracker"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            {isCheckInSubmitted ? (
              <div className="bg-success/5 border border-success/20 p-8 rounded-2xl text-center space-y-4">
                <div className="w-12 h-12 bg-success/15 text-success dark:text-[#4ade80] rounded-full flex items-center justify-center mx-auto shadow-lg">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-display font-bold text-text-main">
                  Today's Nutrition Plan Synced
                </h3>
                <p className="text-xs text-text-muted max-w-md mx-auto leading-relaxed">
                  Your daily indicators have been committed to Nova's active parameter ledger. Your coach is correlating these inputs against behavioral logs.
                </p>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setActiveTab('insights')}
                    className="px-6 py-2 bg-primary hover:bg-primary text-primary-foreground rounded-xl text-[11px] uppercase font-black tracking-widest flex items-center gap-1 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                  >
                    Inspect Biometric Insights <ArrowRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleResetCheckIn}
                    className="px-4 py-2 border border-border/40 hover:bg-surface/30 rounded-xl text-[11px] uppercase font-black tracking-widest text-text-muted hover:text-text-main transition-all cursor-pointer"
                  >
                    Edit Log
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Check in form */}
                <div className="space-y-6 bg-surface/20 p-6 rounded-2xl border border-border/20">
                  <h3 className="text-[11px] font-black uppercase text-text-muted tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Daily Physiological Indicators
                  </h3>

                  {/* Q1: Meal Routine */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-text-main flex items-center justify-between">
                      <span>Have you eaten meals regularly today?</span>
                      {hasEaten !== null && (
                        <span className="text-[11px] font-black uppercase text-success">Filled</span>
                      )}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => { setHasEaten(true); setSkippedBreakfast(false); }}
                        aria-pressed={hasEaten === true}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                          hasEaten === true ? "bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                        )}
                      >
                        Yes, regularly
                      </button>
                      <button
                        onClick={() => { setHasEaten(false); }}
                        aria-pressed={hasEaten === false}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                          hasEaten === false ? "bg-destructive/10 border-destructive/40 text-destructive dark:text-[#f87171]" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                        )}
                      >
                        Skipped or delayed
                      </button>
                    </div>
                  </div>

                  {/* Q2: Skipped Breakfast */}
                  {hasEaten === false && (
                    <div className="space-y-3 animate-in slide-in-from-top-1">
                      <label className="text-xs font-bold text-text-main">Did you skip breakfast/lunch today?</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setSkippedBreakfast(true)}
                          aria-pressed={skippedBreakfast === true}
                          className={cn(
                            "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                            skippedBreakfast === true ? "bg-destructive/10 border-destructive/40 text-destructive dark:text-[#f87171]" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                          )}
                        >
                          Yes, skipped entirely
                        </button>
                        <button
                          onClick={() => setSkippedBreakfast(false)}
                          aria-pressed={skippedBreakfast === false}
                          className={cn(
                            "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                            skippedBreakfast === false ? "bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                          )}
                        >
                          No, just late
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Q3: Caffeine count */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-text-main flex items-center justify-between">
                      <span>How many beverages with caffeine? (Coffee, tea, energy)</span>
                      <span className="font-mono text-sm text-text-muted">{caffeineCount} cups</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {[0, 1, 2, 3, 4, 5].map(cnt => (
                        <button
                          key={cnt}
                          onClick={() => {
                            setCaffeineCount(cnt);
                            if (cnt === 0) setCaffeineTiming('none');
                            else if (caffeineTiming === 'none') setCaffeineTiming('early');
                          }}
                          aria-pressed={caffeineCount === cnt}
                          className={cn(
                            "flex-1 py-2.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer",
                            caffeineCount === cnt ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-white dark:bg-surface border-border/40 hover:border-border text-text-muted"
                          )}
                        >
                          {cnt === 5 ? '5+' : cnt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q4: Caffeine details */}
                  {caffeineCount > 0 && (
                    <div className="space-y-4 animate-in slide-in-from-top-1">
                      <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase text-text-muted tracking-wider">Caffeine Intake Timing:</label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => setCaffeineTiming('early')}
                            aria-pressed={caffeineTiming === 'early'}
                            className={cn(
                              "py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                              caffeineTiming === 'early' ? "bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary" : "bg-white dark:bg-surface border-border/40 text-text-muted"
                            )}
                          >
                            Early (Before 12 PM)
                          </button>
                          <button
                            onClick={() => setCaffeineTiming('late')}
                            aria-pressed={caffeineTiming === 'late'}
                            className={cn(
                              "py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                              caffeineTiming === 'late' ? "bg-destructive/10 border-destructive/40 text-destructive dark:text-[#f87171]" : "bg-white dark:bg-surface border-border/40 text-text-muted"
                            )}
                          >
                            Late (After 2 PM)
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[11px] font-black uppercase text-text-muted tracking-wider">Did you drink it on an empty stomach?</label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => setCaffeineEmptyStomach(true)}
                            aria-pressed={caffeineEmptyStomach === true}
                            className={cn(
                              "py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                              caffeineEmptyStomach === true ? "bg-destructive/10 border-destructive/40 text-destructive dark:text-[#f87171]" : "bg-white dark:bg-surface border-border/40 text-text-muted"
                            )}
                          >
                            Yes, empty stomach
                          </button>
                          <button
                            onClick={() => setCaffeineEmptyStomach(false)}
                            aria-pressed={caffeineEmptyStomach === false}
                            className={cn(
                              "py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                              caffeineEmptyStomach === false ? "bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary" : "bg-white dark:bg-surface border-border/40 text-text-muted"
                            )}
                          >
                            No, with or after food
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Q5: Hydration */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-text-main flex items-between justify-between">
                      <span>Hydration tracker (Water intake today)</span>
                      <span className="font-mono text-sm text-text-muted">{hydrationGlasses} glasses / 8</span>
                    </label>
                    <div className="flex items-center gap-1 pointer-events-auto">
                      {[...Array(9)].map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setHydrationGlasses(i)}
                          aria-label={i === 0 ? "Reset hydration to zero glasses" : `Set hydration to ${i} glass${i === 1 ? '' : 'es'}`}
                          aria-pressed={hydrationGlasses >= i && i > 0}
                          className={cn(
                            "flex-1 h-10 rounded-lg border transition-all flex items-center justify-center cursor-pointer",
                            hydrationGlasses >= i && i > 0 
                              ? "bg-text-main/10 border-text-main/40 text-text-main shadow-sm" 
                              : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                          )}
                        >
                          <Droplet className={cn("w-4 h-4", hydrationGlasses >= i && i > 0 ? "fill-text-main" : "text-text-muted")} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q6: Light Exposure */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-text-main">Did you get morning natural sunlight (&lt;10 AM)?</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setMorningLight(true)}
                        aria-pressed={morningLight === true}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                          morningLight === true ? "bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                        )}
                      >
                        Yes, outdoor light
                      </button>
                      <button
                        onClick={() => setMorningLight(false)}
                        aria-pressed={morningLight === false}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                          morningLight === false ? "bg-transparent border-border/45 text-text-muted hover:border-border" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                        )}
                      >
                        No alignment light
                      </button>
                    </div>
                  </div>

                  {/* Q7: Alcohol awareness for adults only */}
                  {isAdult && (
                    <div className="space-y-3 animate-in slide-in-from-top-1">
                      <label className="text-xs font-bold text-text-main">Did you have any alcohol yesterday?</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setAlcoholLogged(true)}
                          aria-pressed={alcoholLogged === true}
                          className={cn(
                            "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                            alcoholLogged === true ? "bg-destructive/10 border-destructive/45 text-destructive dark:text-[#f87171]" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                          )}
                        >
                          Yes, had alcohol
                        </button>
                        <button
                          onClick={() => setAlcoholLogged(false)}
                          aria-pressed={alcoholLogged === false}
                          className={cn(
                            "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                            alcoholLogged === false ? "bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                          )}
                        >
                          No alcohol consumed
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Q8: Shaky / Irritable / Shaky feeling */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-text-main">Do you feel shaky, irritable, foggy, or physically flat right now?</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setShakyIrritable(true)}
                        aria-pressed={shakyIrritable === true}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                          shakyIrritable === true ? "bg-destructive/10 border-destructive/40 text-destructive dark:text-[#f87171] bg-gradient-to-br" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                        )}
                      >
                        Yes, shaky / fogged
                      </button>
                      <button
                        onClick={() => setShakyIrritable(false)}
                        aria-pressed={shakyIrritable === false}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                          shakyIrritable === false ? "bg-primary/10 border-primary/45 text-[#9a3412] dark:text-primary" : "bg-white dark:bg-surface border-border/40 text-text-muted hover:border-border"
                        )}
                      >
                        Stable & steady
                      </button>
                    </div>
                  </div>

                  {/* Sync Action */}
                  <div className="pt-4">
                    <button
                      onClick={handleSaveCheckIn}
                      className="w-full py-4 bg-primary hover:bg-primary text-primary-foreground rounded-2xl text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-95 shadow-lg shadow-primary/10 cursor-pointer"
                    >
                      Sync Daily Recovery Fuel <Check className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Educational highlight preview */}
                <div className="space-y-6">
                  {/* Meal Rhythm Nudge */}
                  <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Apple className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs uppercase font-black tracking-widest text-primary">Meal Rhythm Nudge</h4>
                        <p className="text-xs font-bold text-text-main mt-0.5">Keep Blood Glucose Flat</p>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      "Before we call this emotional failure, let’s check your fuel." Skipping meals triggers rapid drops in blood sugar, forcing cortisol and adrenaline releases that your brain misinterprets as workplace anxiety.
                    </p>
                    <div className="text-xs bg-white/50 dark:bg-card px-3 py-2 rounded-lg text-text-muted font-bold font-mono">
                      Rule: Avoid running your engine on caffeine alone.
                    </div>
                  </div>

                  {/* Caffeine Guard Card */}
                  <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center text-[#9a3412] dark:text-warning">
                        <Coffee className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs uppercase font-black tracking-widest text-warning">Caffeine Recovery Guard</h4>
                        <p className="text-xs font-bold text-text-main mt-0.5">Prevent Adenosine Masquerades</p>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Caffeine blocks adenosine receptors. If you use it to override systemic neural fatigue, you are simply borrowing energy from tomorrow with compounded interest.
                    </p>
                    <div className="text-xs bg-white/50 dark:bg-card px-3 py-2 rounded-lg text-text-muted font-bold font-mono">
                      Rule: Enforce a strict caffeine cutoff time (ideal: 12 PM - 2 PM max).
                    </div>
                  </div>

                  {/* Circadian Sunlight card */}
                  <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center text-[#9a3412] dark:text-warning">
                        <Sun className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs uppercase font-black tracking-widest text-warning">Circadian Sunlight Nudge</h4>
                        <p className="text-xs font-bold text-text-main mt-0.5">Calibrate Your Body Clock</p>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      "Your recovery clock starts in the morning. Get light early, reduce light late." 5-10 minutes of morning photons triggers visual pathway signals that synchronize your nervous system.
                    </p>
                  </div>

                  {/* Smart Recovery Nudges & Reminders Panel */}
                  <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs uppercase font-black tracking-widest text-primary">Nudges & Reminders Setup</h4>
                        <p className="text-xs font-bold text-text-main mt-0.5">{savingReminderPrefs ? 'Saving...' : 'Set up once, fires automatically'}</p>
                      </div>
                    </div>

                    <p className="text-xs text-text-muted leading-relaxed">
                      These actually run in the background while the app is open, on the schedule you set below — not just a preview. Turn any of them on and they'll genuinely remind you, on your own timing.
                    </p>

                    {/* Hydration Reminder Subsection */}
                    <div className="space-y-3 pt-4 border-t border-border/20">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                            <Droplet className="w-3.5 h-3.5 text-text-main" /> Hydration Reminders
                          </span>
                          <p className="text-xs text-text-muted">Prevent fogginess & cognitive fatigue</p>
                        </div>
                        <button
                          onClick={() => handleHydrationToggle(!hydrationReminderEnabled)}
                          role="switch"
                          aria-checked={hydrationReminderEnabled}
                          className={cn(
                            "px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border cursor-pointer",
                            hydrationReminderEnabled 
                              ? "bg-text-main text-background border-text-main shadow-sm" 
                              : "bg-transparent text-text-muted border-border/40"
                          )}
                        >
                          {hydrationReminderEnabled ? "Enabled" : "Disabled"}
                        </button>
                      </div>

                      {hydrationReminderEnabled && (
                        <div className="space-y-2 animate-in slide-in-from-top-1 bg-white/40 dark:bg-card/40 p-3 rounded-xl border border-border/10">
                          <label className="text-[11px] font-black uppercase text-text-muted tracking-wider block">Remind me every:</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[60, 90, 120].map(mins => (
                              <button
                                key={mins}
                                onClick={() => handleHydrationIntervalChange(mins)}
                                className={cn(
                                  "py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer",
                                  hydrationInterval === mins 
                                    ? "bg-text-main/10 border-text-main/40 text-text-main" 
                                    : "bg-transparent border-border/25 text-text-muted"
                                )}
                              >
                                {mins} min
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={triggerHydrationTest}
                        className="w-full py-2 bg-text-main/5 hover:bg-text-main/10 border border-text-main/10 text-text-main rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer hover:scale-[1.01] active:scale-95"
                      >
                        <Droplet className="w-3 h-3" /> Preview This Nudge
                      </button>
                    </div>

                    {/* Meal Timing Subsection */}
                    <div className="space-y-4 pt-4 border-t border-border/20">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-text-main flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-warning" /> Meal Timing Anchors
                        </span>
                        <p className="text-xs text-text-muted">Proactive triggers to align decision and stress windows</p>
                      </div>

                      <div className="space-y-3">
                        {/* Toggle 1: Meetings */}
                        <div className="p-3 rounded-xl bg-white/40 dark:bg-card/40 border border-border/10 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5 max-w-[70%]">
                              <span className="text-[11px] font-bold text-text-main block">Pre-Meeting Shield</span>
                              <p className="text-[11px] text-text-muted leading-relaxed">Nudges to eat before real calendar meetings</p>
                            </div>
                            <button
                              onClick={() => handleMeetingToggle(!meetingReminderEnabled)}
                              role="switch"
                              aria-checked={meetingReminderEnabled}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border cursor-pointer",
                                meetingReminderEnabled
                                  ? "bg-warning text-warning-foreground border-warning shadow-sm"
                                  : "bg-transparent text-text-muted border-border/40"
                              )}
                            >
                              {meetingReminderEnabled ? "Active" : "Off"}
                            </button>
                          </div>

                          {meetingReminderEnabled && !accessToken && (
                            <div className="p-3 bg-warning/5 border border-warning/20 rounded-lg space-y-2">
                              <p className="text-[11px] text-text-muted leading-relaxed">This needs your calendar connected to know when meetings actually start — it can't check without it.</p>
                              <button
                                onClick={() => signInWithCalendar()}
                                className="text-[11px] font-black uppercase tracking-widest text-warning hover:opacity-80"
                              >
                                Connect Google Calendar
                              </button>
                            </div>
                          )}

                          {meetingReminderEnabled && accessToken && (
                            <div className="space-y-2">
                              <label className="text-[11px] font-black uppercase text-text-muted tracking-wider block">Remind me before, by:</label>
                              <div className="grid grid-cols-3 gap-2">
                                {[10, 15, 30].map(mins => (
                                  <button
                                    key={mins}
                                    onClick={() => handleMeetingLeadChange(mins)}
                                    aria-pressed={meetingLeadMinutes === mins}
                                    className={cn(
                                      "py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer",
                                      meetingLeadMinutes === mins
                                        ? "bg-warning/10 border-warning/40 text-[#9a3412] dark:text-warning"
                                        : "bg-transparent border-border/25 text-text-muted"
                                    )}
                                  >
                                    {mins} min
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Toggle 2: Emotional Choices */}
                        <div className="p-3 rounded-xl bg-white/40 dark:bg-card/40 border border-border/10 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5 max-w-[70%]">
                              <span className="text-[11px] font-bold text-text-main block">Decision Point Guard</span>
                              <p className="text-[11px] text-text-muted leading-relaxed">Periodic check-in before heavy emotional decisions</p>
                            </div>
                            <button
                              onClick={() => handleEmotionalToggle(!emotionalReminderEnabled)}
                              role="switch"
                              aria-checked={emotionalReminderEnabled}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border cursor-pointer",
                                emotionalReminderEnabled
                                  ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                                  : "bg-transparent text-text-muted border-border/40"
                              )}
                            >
                              {emotionalReminderEnabled ? "Active" : "Off"}
                            </button>
                          </div>

                          {emotionalReminderEnabled && (
                            <div className="space-y-2">
                              <label className="text-[11px] font-black uppercase text-text-muted tracking-wider block">Remind me every:</label>
                              <div className="grid grid-cols-3 gap-2">
                                {[60, 120, 180].map(mins => (
                                  <button
                                    key={mins}
                                    onClick={() => handleEmotionalIntervalChange(mins)}
                                    className={cn(
                                      "py-1.5 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer",
                                      emotionalInterval === mins
                                        ? "bg-destructive/10 border-destructive/40 text-destructive dark:text-[#f87171]"
                                        : "bg-transparent border-border/25 text-text-muted"
                                    )}
                                  >
                                    {mins} min
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={triggerMeetingTest}
                          className="py-2 bg-warning/5 hover:bg-warning/10 border border-warning/15 text-[#9a3412] dark:text-warning rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-all cursor-pointer hover:scale-[1.01] active:scale-95"
                        >
                          <Clock className="w-3 h-3" /> Preview
                        </button>
                        <button
                          onClick={triggerEmotionalTest}
                          className="py-2 bg-destructive/5 hover:bg-destructive/10 border border-destructive/15 text-destructive dark:text-[#f87171] rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1 transition-all cursor-pointer hover:scale-[1.01] active:scale-95"
                        >
                          <ShieldAlert className="w-3 h-3" /> Preview
                        </button>
                      </div>

                    </div>
                  </div>
                </div>

              </div>
            )}
          </motion.div>
        )}

        {/* INSIGHTS */}
        {activeTab === 'insights' && (
          <motion.div
            key="insights"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-6"
          >
            <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40">
              <h3 className="text-xs uppercase font-black tracking-wider text-text-muted ">Active Coach Overrides</h3>
              <p className="text-xl font-display font-medium text-text-main mt-1">Nova's Nutrition Analysis</p>
              <div className="text-sm bg-primary/5 text-[#9a3412] dark:text-primary font-bold p-4 rounded-xl mt-4 border border-primary/10 italic">
                “Your emotional resilience might not be failing today. If you skipped lunch, slept poorly, and ran on high caffeine, you are physically unstable. Fuel your body before judging your boundaries.”
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {getDynamicInsights().map((insight, idx) => (
                <div 
                  key={idx} 
                  className={cn(
                    "p-6 rounded-2xl border flex flex-col justify-between space-y-4",
                    insight.type === 'critical' ? "bg-destructive/5 border-destructive/20" :
                    insight.type === 'warning' ? "bg-warning/5 border-warning/20" :
                    insight.type === 'success' ? "bg-success/5 border-success/20" :
                    "bg-surface dark:bg-surface border-border/40"
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        insight.type === 'critical' ? 'bg-destructive animate-pulse' :
                        insight.type === 'warning' ? 'bg-warning' :
                        insight.type === 'success' ? 'bg-success' :
                        'bg-text-main'
                      )} />
                      <h4 className="font-display font-black text-xs uppercase tracking-wider text-text-main">
                        {insight.title}
                      </h4>
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed">
                      {insight.description}
                    </p>
                  </div>

                  <div className="bg-white/40 dark:bg-card/40 p-4 rounded-xl border border-border/10 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] uppercase font-black tracking-wider text-primary">Nova Recovery Direct</span>
                    </div>
                    <p className="text-[11px] font-medium leading-normal text-text-muted dark:text-text-muted italic">
                      "{insight.coaching}"
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* EDUCATION */}
        {activeTab === 'education' && (
          <motion.div
            key="education"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Gut-Brain Education */}
            <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Heart className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs uppercase font-medium tracking-widest text-primary">Gut-Brain Connection</h4>
                  <p className="text-xs font-bold text-text-main mt-0.5">How they affect each other</p>
                </div>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                The digestive system communicates directly with your brain via the vagus nerve. Inflammatory pathways, microbiome changes, or severe meal skipping directly manifest as cognitive fog and defensive cynicism.
              </p>
              <div className="bg-white/40 dark:bg-card/30 p-4 rounded-xl text-[11px] text-text-muted font-bold leading-normal">
                💡 <span className="text-primary">Fact:</span> Poor meal timing, late screen exposure, high caffeine, and chronic workplace stress all cooperate to lock the autonomic nervous system into a defense cycle, prolonging neurological fatigue. This is educational support, not medical treatment.
              </div>
            </div>

            {/* Supplement Literacy Card */}
            <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-500">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs uppercase font-black tracking-widest text-teal-500">Supplement Literacy Card</h4>
                  <p className="text-xs font-bold text-text-main mt-0.5">Magnesium & Micronutrient Baselines</p>
                </div>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Micronutrients like magnesium glycinate, Vitamin D, high-dose B vitamins, and omega-3 essential fatty acids participate in normal cellular and nervous system functions. Chronic stress siphons these mineral reserves.
              </p>
              <div className="bg-warning/5 text-[#9a3412] dark:text-warning p-4 rounded-xl text-xs font-black uppercase tracking-wider leading-relaxed border border-warning/10">
                ⚠️ Safe Recovery Boundary: This app supports behavioral recovery. Do not treat supplement insights as a prescription. Speak to a qualified medical professional if you suspect clinical deficiencies, take prescription medication, are pregnant, or are under 18.
              </div>
            </div>

            {/* Hydration card */}
            <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-text-main/10 flex items-center justify-center text-text-main">
                  <Droplet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs uppercase font-black tracking-widest text-text-main">Hydration Reminder</h4>
                  <p className="text-xs font-bold text-text-main mt-0.5">Replenish Neurotransmission Fluid</p>
                </div>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Lower water levels raise cortisol output and make decision pathways sluggish. Carry a water vessel. Earning engagement points for tracking hydration establishes automatic, friction-free replacement cues.
              </p>
            </div>

            {/* Alcohol sleep disruption card */}
            <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive">
                  <Wine className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs uppercase font-black tracking-widest text-destructive">Alcohol Recovery Awareness</h4>
                  <p className="text-xs font-bold text-text-main mt-0.5">Disarming the Sleep Sedative</p>
                </div>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                {isAdult ? (
                  "Alcohol acts as a quick sedative, but it disrupts melatonin production, destroys REM sleep architecture, and elevates heart rate variability during rest, preventing genuine autonomic rejuvenation."
                ) : (
                  "Developmental health is completely dependent on robust structural sleep cycles. Avoiding toxic inputs ensures healthy neurogenesis and sustainable professional growth patterns."
                )}
              </p>
            </div>

            {/* Blood Sugar Stability Card */}
            <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 space-y-4 col-span-1 md:col-span-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center text-[#9a3412] dark:text-warning">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs uppercase font-medium tracking-widest text-warning">Blood Sugar Stability</h4>
                  <p className="text-xs font-bold text-text-main mt-0.5">Slow-Release Energy Foods for Calm Resiliency</p>
                </div>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                When you consume rapid-release refined sugars or skip meals entirely, your blood glucose fluctuates erratically. When blood sugar drops precipitously, your autonomic nervous system goes into an immediate crisis alert, flooding your system with cortisol and adrenaline. Your mind then translates this purely physiological chemical spike as workspace panic or intense irritation. Sustaining a flat, steady glucose fuel line prevents sudden physical fogginess and unwarranted mood emergencies.
              </p>
              <div className="bg-white/40 dark:bg-card/30 p-4 rounded-xl text-[11px] text-text-muted space-y-3">
                <span className="font-bold text-primary dark:text-primary block uppercase tracking-wider text-xs">Approachables & Actionable Slow-Release Replacements:</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="font-bold text-text-main">🌾 Complex Fibrous Oats & Seeds</span>
                    <p className="text-[11px] text-text-muted leading-relaxed">Porridge, chia pudding, or pumpkin seeds slowly liberate glycogen over 4 hours instead of a sudden peak, keeping your baseline stable.</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-text-main">🍞 Ancient Rye, Sourdough & Nut Butters</span>
                    <p className="text-[11px] text-text-muted leading-relaxed">Whole carbs combined with thick healthy fats cushion digestion, delaying insulin responses and preventing the classic 3 PM brain fog.</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-text-main">🥑 Avocados, Nuts & Roasted Chickpeas</span>
                    <p className="text-[11px] text-text-muted leading-relaxed">Portable office fuel (almonds, walnuts) that gives you clean fats/fiber. Perfect to snack on 20 minutes before a high-pressure board meeting.</p>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-text-main">🥚 Dense Protein Anchors (Eggs & Yogurts)</span>
                    <p className="text-[11px] text-text-muted leading-relaxed">Consuming protein prior to major stress loops slows down metabolic rate variation and keeps memory recall sharp when tension runs high.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Safety Notice Footer */}
      <div className="bg-surface/30 px-5 py-4 rounded-2xl border border-border/20 flex items-start gap-4 text-left">
        <ShieldAlert className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
        <div>
          <span className="text-[11px] uppercase font-black tracking-wider text-text-muted">Safe Coaching Boundary</span>
          <p className="text-xs text-text-muted leading-relaxed mt-0.5">
            This module provides non-clinical educational support to stabilize daily behavioral cycles. Do not interpret tracking alerts or insights as medical, nutritional, psychiatric, or metabolic advice.
          </p>
        </div>
      </div>
    </div>
  );
};
