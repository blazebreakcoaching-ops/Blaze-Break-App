import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, X, ChevronRight } from "lucide-react";
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { doc, getDoc, collection, addDoc, updateDoc } from 'firebase/firestore';

export const InAppNudge = () => {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<any>(null);
  const [currentNudge, setCurrentNudge] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isDismissing, setIsDismissing] = useState(false);

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

    // Pick a candidate
    const cats = preferences.allowedNudgeCategories || ['check_in_reminder'];
    if (cats.length === 0) return;
    
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const messages: any = {
      check_in_reminder: "Just a quick pulse check. How's your energy baseline today?",
      recovery_action_reminder: "Notice any energy leaks? Might be time for a micro-recovery.",
      boundary_practice_reminder: "It is okay to say no to non-essential requests right now.",
      weekly_review_reminder: "Your weekly reflection is ready when you have a moment.",
      goal_follow_up: "Gentle reminder about the recovery boundary you set for today."
    };

    const text = messages[cat] || "Take a deep breath. Your baseline matters.";

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
                  onClick={() => dismiss("action_taken")}
                  className="flex-1 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1"
                >
                  Action <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
