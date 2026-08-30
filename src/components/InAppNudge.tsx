import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, X, ChevronRight } from "lucide-react";
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, addDoc, updateDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { secureApiFetch } from '../lib/secure-api';

export const InAppNudge = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<any>(null);
  const [currentNudge, setCurrentNudge] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isDismissing, setIsDismissing] = useState(false);
  const orgStatusCache = useRef<{ checked: boolean; organisationId: string | null; organisationName?: string; shareAnonymizedDataWithOrg?: boolean }>({ checked: false, organisationId: null });
  const lastDetailedCheckRef = useRef<number>(0);

  useEffect(() => {
    if (user) {
      loadPreferences();
      const interval = setInterval(evaluateNudges, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    if (preferences) {
      evaluateNudges();
    }
  }, [preferences]);

  const loadPreferences = async () => {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'preferences', 'notifications'));
      if (snap.exists()) {
        setPreferences(snap.data());
      }
    } catch (e) {
      console.warn("Failed to load nudge preferences", e);
    }
  };

  const checkClimateSurveyDue = async (): Promise<{ category: string; message: string } | null> => {
    if (!user) return null;
    try {
      if (!orgStatusCache.current.checked) {
        const meRes = await secureApiFetch('/api/org/me');
        const me = await meRes.json();
        orgStatusCache.current = {
          checked: true,
          organisationId: me.organisationId || null,
          organisationName: me.organisationName,
          shareAnonymizedDataWithOrg: me.shareAnonymizedDataWithOrg === true,
        };
      }
      const me = orgStatusCache.current;
      if (!me.organisationId || !me.shareAnonymizedDataWithOrg) return null;

      // Don't re-nag daily - once shown, wait a while before checking again,
      // using the same nudge_history log everything else already writes to.
      const recentSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'nudge_history'), orderBy('createdAt', 'desc'), limit(30))
      );
      const lastClimateNudge = recentSnap.docs
        .map(d => d.data())
        .find(n => n.category === 'climate_survey_reminder');
      if (lastClimateNudge) {
        const daysSinceNudge = (Date.now() - new Date(lastClimateNudge.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceNudge < 7) return null;
      }

      const responseSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'climate_survey_responses'), orderBy('createdAt', 'desc'), limit(1))
      );
      if (responseSnap.empty) {
        return { category: 'climate_survey_reminder', message: `Your team's climate survey is ready — it takes about a minute, and helps ${me.organisationName || 'your organisation'} see how things are actually going.` };
      }
      const lastResponseDate = new Date(responseSnap.docs[0].data().createdAt);
      const daysSinceResponse = (Date.now() - lastResponseDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceResponse >= 30) {
        return { category: 'climate_survey_reminder', message: "It's been a month — your team's climate survey is ready again when you have a minute." };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const checkCheckInDue = async (): Promise<{ category: string; message: string } | null> => {
    if (!user) return null;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'checkins'), orderBy('createdAt', 'desc'), limit(1)));
      if (!snap.empty && typeof snap.docs[0].data().createdAt === 'string' && snap.docs[0].data().createdAt.startsWith(todayStr)) {
        return null; // already checked in today - nothing to remind them of
      }
      return { category: 'check_in_reminder', message: "Just a quick pulse check. How's your energy baseline today?" };
    } catch (e) {
      return null;
    }
  };

  const checkRecoveryActionDue = async (): Promise<{ category: string; message: string } | null> => {
    if (!user) return null;
    try {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'wins'), orderBy('createdAt', 'desc'), limit(1)));
      if (!snap.empty) {
        const daysSince = (Date.now() - new Date(snap.docs[0].data().createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 2) return null; // recently active - no need to nudge
      }
      return { category: 'recovery_action_reminder', message: "Notice any energy leaks? Might be time for a micro-recovery." };
    } catch (e) {
      return null;
    }
  };

  const checkBoundaryPracticeDue = async (): Promise<{ category: string; message: string } | null> => {
    if (!user) return null;
    try {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'boundary_scripts'), orderBy('createdAt', 'desc'), limit(1)));
      if (!snap.empty) {
        const daysSince = (Date.now() - new Date(snap.docs[0].data().createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 5) return null;
      }
      return { category: 'boundary_practice_reminder', message: "It's okay to say no to non-essential requests right now. Worth rehearsing a script if one's been on your mind." };
    } catch (e) {
      return null;
    }
  };

  const checkWeeklyReviewDue = async (): Promise<{ category: string; message: string } | null> => {
    if (!user) return null;
    try {
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'weekly_reviews'), orderBy('createdAt', 'desc'), limit(1)));
      if (!snap.empty) {
        const daysSince = (Date.now() - new Date(snap.docs[0].data().createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) return null; // last review was recent enough
      }
      return { category: 'weekly_review_reminder', message: "Your weekly reflection is ready when you have a moment." };
    } catch (e) {
      return null;
    }
  };

  const checkGoalFollowUpDue = async (): Promise<{ category: string; message: string } | null> => {
    if (!user) return null;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const snap = await getDocs(query(collection(db, 'users', user.uid, 'goals'), orderBy('createdAt', 'desc'), limit(1)));
      if (snap.empty) return null;
      const goal = snap.docs[0].data();
      // Only ever references a real, currently-active goal from today -
      // never a generic "the boundary you set" claim about something that
      // may not exist.
      if (goal.category !== 'daily_ship_commitment' || goal.status !== 'active') return null;
      if (typeof goal.createdAt !== 'string' || !goal.createdAt.startsWith(todayStr)) return null;
      return { category: 'goal_follow_up', message: `Gentle reminder about today's commitment: "${goal.title}".` };
    } catch (e) {
      return null;
    }
  };

  const evaluateNudges = async () => {
    if (!user || !preferences || !preferences.notificationsEnabled) return;
    if (currentNudge) return; // already showing one

    const now = new Date();
    
    // Check quiet hours
    if (preferences.quietHoursStart && preferences.quietHoursEnd) {
      const currentHourStr = now.toTimeString().substring(0, 5);
      // Simple string comparison for HH:mm
      if (preferences.quietHoursStart > preferences.quietHoursEnd) {
        // Crosses midnight
        if (currentHourStr >= preferences.quietHoursStart || currentHourStr <= preferences.quietHoursEnd) return;
      } else {
        if (currentHourStr >= preferences.quietHoursStart && currentHourStr <= preferences.quietHoursEnd) return;
      }
    }

    // Check pause
    if (preferences.pauseUntil) {
      if (now < new Date(preferences.pauseUntil)) return;
    }

    // Check weekend
    if (!preferences.weekendNudgesEnabled && (now.getDay() === 0 || now.getDay() === 6)) {
      return;
    }

    // Local frequency limits check (using simple local storage to avoid extra DB calls)
    const storedHistory = localStorage.getItem("blaze_nudge_history") || "[]";
    const localHistory = JSON.parse(storedHistory);
    const today = now.toDateString();
    
    const nudgesToday = localHistory.filter((n: any) => new Date(n.shownAt).toDateString() === today);
    const maxPerDay = preferences.maxNudgesPerDay || (preferences.nudgeFrequency === 'high' ? 5 : preferences.nudgeFrequency === 'medium' ? 3 : 1);
    
    if (nudgesToday.length >= maxPerDay) return;

    // Time since last nudge
    if (nudgesToday.length > 0) {
      const lastNudgeTime = new Date(nudgesToday[nudgesToday.length - 1].shownAt);
      const diffMinutes = (now.getTime() - lastNudgeTime.getTime()) / 60000;
      if (diffMinutes < 120) return; // Minimum 2 hours between nudges
    }

    // A genuinely due climate survey reminder takes priority - it's a real,
    // dated condition rather than one of the rotating checks below.
    const climateNudge = await checkClimateSurveyDue();

    let cat: string;
    let text: string;

    if (climateNudge) {
      cat = climateNudge.category;
      text = climateNudge.message;
    } else {
      // These reads span up to five collections, so they're throttled
      // independently of the "nudge already shown" gate above - otherwise,
      // on a day where nothing is due yet, this would re-run all five
      // queries every single 60-second tick.
      const minutesSinceLastCheck = (now.getTime() - lastDetailedCheckRef.current) / 60000;
      if (lastDetailedCheckRef.current !== 0 && minutesSinceLastCheck < 10) return;
      lastDetailedCheckRef.current = now.getTime();

      // Each of these checks a real condition (has this actually been done
      // recently, does this actually exist right now) rather than always
      // returning a message regardless of whether it's true. Only the
      // categories that come back genuinely due are candidates - if none
      // are, no nudge fires this cycle at all, rather than falling back to
      // a generic message that may not reflect anything real.
      const checkers: Record<string, () => Promise<{ category: string; message: string } | null>> = {
        check_in_reminder: checkCheckInDue,
        recovery_action_reminder: checkRecoveryActionDue,
        boundary_practice_reminder: checkBoundaryPracticeDue,
        weekly_review_reminder: checkWeeklyReviewDue,
        goal_follow_up: checkGoalFollowUpDue,
      };
      const cats: string[] = preferences.allowedNudgeCategories || ['check_in_reminder'];
      const results = await Promise.all(
        cats.map((c: string) => (checkers[c] ? checkers[c]() : Promise.resolve(null)))
      );
      const due = results.filter((r): r is { category: string; message: string } => r !== null);
      if (due.length === 0) return; // nothing genuinely relevant right now
      const picked = due[Math.floor(Math.random() * due.length)];
      cat = picked.category;
      text = picked.message;
    }

    // Show it
    const nudgeData = {
      category: cat,
      message: text,
      shownAt: now.toISOString(),
      createdAt: now.toISOString()
    };
    setCurrentNudge(nudgeData);
    
    // Log to backend
    try {
      const docRef = await addDoc(collection(db, 'users', user.uid, 'nudge_history'), nudgeData);
      const histItem = { id: docRef.id, ...nudgeData };
      setCurrentNudge(histItem);
      
      // update local 
      const nextLocal = [...localHistory, histItem];
      localStorage.setItem("blaze_nudge_history", JSON.stringify(nextLocal));
    } catch (e) {
      console.warn("Nudge history save failed");
    }
  };

  const dismiss = async (reason?: string) => {
    if (!currentNudge || !user) return;
    setIsDismissing(true);
    
    if (currentNudge.id) {
      try {
        await updateDoc(doc(db, 'users', user.uid, 'nudge_history', currentNudge.id), {
          status: reason ? "dismissed" : "action_taken",
          dismissedAt: reason ? new Date().toISOString() : undefined,
          actionTakenAt: !reason ? new Date().toISOString() : undefined,
          reasonCategory: reason,
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        // ignore
      }
    }
    setTimeout(() => {
      setCurrentNudge(null);
      setIsDismissing(false);
    }, 300);
  };

  return (
    <AnimatePresence>
      {currentNudge && !isDismissing && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm"
        >
          <div className="bg-card border border-primary/20 shadow-lg rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-surface/50 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Nova Coach Nudge</span>
              </div>
              <button 
                onClick={() => dismiss("not_now")}
                aria-label="Dismiss nudge"
                className="p-1 text-text-muted hover:text-text-main hover:bg-border rounded transition-colors"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            
            <div className="p-4">
              <p className="text-sm font-medium text-text-main leading-relaxed mb-4">
                {currentNudge.message}
              </p>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (currentNudge.category === 'climate_survey_reminder') {
                      window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'privacy' }));
                    }
                    dismiss("action_taken");
                  }}
                  className="flex-1 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-[#9a3412] dark:text-primary rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1"
                >
                  {currentNudge.category === 'climate_survey_reminder' ? 'Take Survey' : 'Action'} <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
