import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Plus,
  RefreshCw,
  MessageSquare,
  Sparkles,
  ArrowRight,
  History,
  Trophy,
  Gift,
  CheckCircle,
  Zap,
  ShieldAlert,
  Volume2,
  Loader2,
  ChevronRight,
  Flame,
  PencilLine,
  AlertTriangle,
  Battery,
  Waves,
} from "lucide-react";
import { AreaChart, Area, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { BurnoutFingerprint, UserStats, SHIPStage } from "../types.ts";
import { cn } from "../lib/utils.ts";
import { auth, db } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { secureApiFetch } from "../lib/secure-api";
import { ActivityLog } from "./ActivityLog.tsx";
import { SmartCard } from "./SmartCard.tsx";
import { DailyGoal } from "./DailyGoal.tsx";
import { MicroInterventions } from "./MicroInterventions.tsx";
import { SomaticCheckInCard } from "./SomaticCheckInCard.tsx";
import { RecoveryVelocityMap } from "./RecoveryVelocityMap.tsx";
import { GamificationDisplay } from "./GamificationDisplay.tsx";
import { ArchetypeBlend } from "./ArchetypeBlend.tsx";
import { RecoveryExplanation } from "./RecoveryExplanation.tsx";
import { RelapseRadar } from "./RelapseRadar.tsx";

const NovaVoiceGuidance = ({ stage }: { stage: SHIPStage }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopAudio = () => {
    if (activeSourceRef.current) {
      activeSourceRef.current.stop();
      activeSourceRef.current.disconnect();
      activeSourceRef.current = null;
    }
  };

  const playGuidance = async () => {
    if (isPlaying || isAudioLoading) {
      stopAudio();
      setIsPlaying(false);
      setIsAudioLoading(false);
      return;
    }

    setIsAudioLoading(true);
    try {
      const text = `You are in the ${stage} phase. Remember, fix the leak before you build the dream. Take a deep breath. Your value is not your output today. Focus on one small move.`;
      const response = await secureApiFetch("/api/nova/speech", {
        method: "POST",
        data: { text },
      });
      const data = await response.json();
      setIsAudioLoading(false);

      if (data.error) throw new Error(data.error);

      if (data.audio) {
        setIsPlaying(true);
        if (!audioCtxRef.current) {
          audioCtxRef.current = new window.AudioContext({ sampleRate: 24000 });
        }
        const audioCtx = audioCtxRef.current;
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        stopAudio();

        const binaryString = window.atob(data.audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const numSamples = bytes.length / 2;
        const audioBuffer = audioCtx.createBuffer(1, numSamples, 24000);
        const channelData = audioBuffer.getChannelData(0);
        const dataView = new DataView(bytes.buffer);

        for (let i = 0; i < numSamples; i++) {
          const pcm16 = dataView.getInt16(i * 2, true);
          channelData[i] = pcm16 / 32768;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          setIsPlaying(false);
          activeSourceRef.current = null;
        };
        source.start(0);
        activeSourceRef.current = source;
      } else {
        setIsPlaying(false);
      }
    } catch (e: any) {
      console.error(e);
      alert(
        `Nova Voice Error: ${e.message || "Connection failed. Check API key."}`,
      );
      setIsAudioLoading(false);
      setIsPlaying(false);
    }
  };

  return (
    <button
      onClick={playGuidance}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all shadow-lg",
        isPlaying || isAudioLoading
          ? "bg-primary text-primary-foreground"
          : "bg-surface text-text-main hover:bg-card border border-border",
      )}
    >
      {isAudioLoading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isPlaying ? (
        <div className="flex items-end gap-[1px] h-2">
          <motion.div
            animate={{ height: ["40%", "100%", "40%"] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="w-[2px] bg-current rounded-full"
          />
          <motion.div
            animate={{ height: ["20%", "80%", "20%"] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.1 }}
            className="w-[2px] bg-current rounded-full"
          />
          <motion.div
            animate={{ height: ["60%", "30%", "60%"] }}
            transition={{ duration: 0.4, repeat: Infinity, delay: 0.2 }}
            className="w-[2px] bg-current rounded-full"
          />
        </div>
      ) : (
        <Volume2 className="w-3 h-3" />
      )}
      {isAudioLoading
        ? "Loading..."
        : isPlaying
          ? "Nova Speaking..."
          : "Calming Guidance"}
    </button>
  );
};

export const HomeSection = ({
  onChatRequest,
  onEnergyRequest,
  fingerprint,
  stats,
  onClaimDaily,
  hasClaimedDaily,
  shipStage,
  energyLevel,
  burnoutRisk,
  onOpenCheckIn,
  pulseHistory,
  onAwardPoints,
  onIncrementStreak,
  onUpdateOperationalMetrics,
  onUpdatePulseHistory,
  onLogJourney,
}: {
  onChatRequest: () => void;
  onEnergyRequest: () => void;
  fingerprint: BurnoutFingerprint | null;
  stats: UserStats;
  onClaimDaily: () => void;
  hasClaimedDaily: boolean;
  shipStage: SHIPStage;
  energyLevel: number;
  burnoutRisk: string;
  onOpenCheckIn: () => void;
  pulseHistory: {date: string, score: number}[];
  onAwardPoints: (amount: number, reason: string) => void;
  onIncrementStreak: () => void;
  onUpdateOperationalMetrics: (energy: number, risk: string) => void;
  onUpdatePulseHistory: (date: string, score: number) => void;
  onLogJourney: (action: string, details: string) => void;
}) => {
  // Friendly names for every widget, used by the "Add widget" menu below.
  const WIDGET_LIBRARY: Record<string, string> = {
    hero: "Your Recovery Score",
    stats: "Quick Stats",
    streakCalendar: "Streak Calendar",
    trends: "Recovery Trends",
    anxietyResetCard: "Anxiety Reset Shortcut",
    somaticAccelerator: "Body Check-In",
    velocity: "Recovery Velocity Map",
    hub: "Recovery Hub",
    gamification: "Points & Badges",
    archetypeBlend: "Your Blend",
    daily: "Daily Goal",
    micro: "Micro-Recovery",
    activity: "Activity Log",
    directive: "Nova's Suggestion",
    quests: "Milestones",
    network: "Guardian Network",
    radar: "Relapse Radar",
  };

  // A small, focused set by default: your score, one clear next step, one
  // progress view, one motivational view, and a way to find tools.
  // Everything else is one tap away via "Add widget" instead of all 16
  // competing for attention at once. gamification was added deliberately,
  // not as an afterthought - trends is diagnostic ("how am I doing"),
  // gamification is motivational ("what have I earned, what's next"), and
  // without it, a new user's very first view of this app had literally no
  // points, levels, or rewards visible anywhere, despite that system
  // being fully built.
  const DEFAULT_LEFT = ['hero', 'trends', 'hub'];
  const DEFAULT_RIGHT = ['directive', 'gamification'];
  const DEFAULT_HIDDEN = ['stats', 'streakCalendar', 'anxietyResetCard', 'somaticAccelerator', 'velocity', 'daily', 'micro', 'activity', 'quests', 'network', 'radar', 'archetypeBlend'];
  const LAYOUT_STORAGE_KEY = 'blaze_home_dashboard_layout_v2';

  // Real recommendation, computed server-side from actual cross-module
  // signals (recent stress triggers, active energy load, time since last
  // reset/rehearsal/check-in) - replaces what used to be static copy shown
  // identically to everyone regardless of what they'd actually done.
  const [recommendation, setRecommendation] = useState<{
    tool: string; tab: string; title: string; message: string; points: number;
  } | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(true);

  useEffect(() => {
    const loadRecommendation = async () => {
      if (!auth.currentUser) { setRecommendationLoading(false); return; }
      try {
        const res = await secureApiFetch('/api/user/recommendation');
        if (res.ok) {
          setRecommendation(await res.json());
        }
      } catch (e) {
        // Leaves recommendation null - the card below shows a graceful
        // fallback rather than a broken or fake state.
      }
      setRecommendationLoading(false);
    };
    loadRecommendation();
  }, []);

  const loadLayout = (): { left: string[]; right: string[]; hidden: string[] } => {
    try {
      const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.left) && Array.isArray(parsed.right) && Array.isArray(parsed.hidden)) {
          return parsed;
        }
      }
    } catch (e) {
      // Corrupted storage - fall back to defaults rather than crashing.
    }
    return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT, hidden: DEFAULT_HIDDEN };
  };

  const initialLayout = loadLayout();
  const [leftOrder, setLeftOrder] = useState<string[]>(initialLayout.left);
  const [rightOrder, setRightOrder] = useState<string[]>(initialLayout.right);
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>(initialLayout.hidden);
  const [showAddWidgetMenu, setShowAddWidgetMenu] = useState(false);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  // Streak calendar state - lives here, not inside the streakCalendar widget's
  // IIFE below, because calling useState inside a nested function/IIFE is a
  // Rules of Hooks violation: it would call this hook conditionally on
  // whatever triggers a re-render of that JSX block, rather than
  // unconditionally on every render of this component, exactly the pattern
  // that causes "Rendered fewer hooks than expected" crashes.
  const [streakDays, setStreakDays] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("blaze_recovery_streak_days");
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // Non-fatal - falls through to the empty-array default below.
    }
    return [];
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pullStartYRef = useRef<number | null>(null);
  const PULL_TRIGGER_THRESHOLD = 70;
  const PULL_MAX_DISTANCE = 90;

  // Raw touch events rather than Framer Motion's drag prop — this screen
  // already has native HTML5 drag-and-drop for widget reordering, and a
  // pointer-based drag gesture layered on top would fight it. Gating on
  // window.scrollY <= 0 at touch-start is what makes this only trigger at
  // the very top of the page instead of hijacking normal scrolling anywhere
  // else on a screen with 16 possible widgets.
  const handleHomeTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !isPullRefreshing) {
      pullStartYRef.current = e.touches[0].clientY;
      setIsDragging(true);
    }
  };
  const handleHomeTouchMove = (e: React.TouchEvent) => {
    if (pullStartYRef.current === null) return;
    const delta = e.touches[0].clientY - pullStartYRef.current;
    if (delta > 0 && window.scrollY <= 0) {
      setPullDistance(Math.min(delta * 0.5, PULL_MAX_DISTANCE));
    } else {
      pullStartYRef.current = null;
      setIsDragging(false);
      setPullDistance(0);
    }
  };
  const handleHomeTouchEnd = () => {
    if (pullDistance >= PULL_TRIGGER_THRESHOLD) {
      setIsPullRefreshing(true);
      setTimeout(() => {
        setHomeRefreshKey((k) => k + 1);
        setIsPullRefreshing(false);
        setPullDistance(0);
      }, 700); // A brief, deliberate delay — an instant refresh reads as broken, not fast.
    } else {
      setPullDistance(0);
    }
    pullStartYRef.current = null;
    setIsDragging(false);
  };

  // Persist every change so layout and hide/show choices actually stick.
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ left: leftOrder, right: rightOrder, hidden: hiddenWidgets }));
    } catch (e) {
      // Storage full or unavailable - continue silently rather than breaking the UI.
    }
  }, [leftOrder, rightOrder, hiddenWidgets]);

  const handleHideCard = (id: string) => {
    setLeftOrder((prev) => prev.filter((cardId) => cardId !== id));
    setRightOrder((prev) => prev.filter((cardId) => cardId !== id));
    setHiddenWidgets((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleAddWidget = (id: string) => {
    setHiddenWidgets((prev) => prev.filter((cardId) => cardId !== id));
    setLeftOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  useEffect(() => {
    // Merge any brand-new card types introduced by future app updates so they
    // aren't silently lost for existing users - anything not already placed
    // and not already hidden gets added to hidden-by-default, never forced in.
    const known = new Set([...leftOrder, ...rightOrder, ...hiddenWidgets]);
    const newlyIntroduced = Object.keys(WIDGET_LIBRARY).filter((id) => !known.has(id));
    if (newlyIntroduced.length > 0) {
      setHiddenWidgets((prev) => [...prev, ...newlyIntroduced]);
    }
  }, []);

  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickTriggerText, setQuickTriggerText] = useState("");
  const [quickSeverity, setQuickSeverity] = useState(7);
  const [quickSuccess, setQuickSuccess] = useState(false);

  const handleSaveQuickTrigger = async () => {
    if (!quickTriggerText.trim()) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      await setDoc(doc(db, 'users', uid, 'stress_triggers', Date.now().toString()), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        text: quickTriggerText.trim(),
        date: new Date().toISOString(),
        severity: Number(quickSeverity),
        energyLevel: Number(energyLevel),
      });
    } catch (e) {
      console.error("Could not save this trigger note:", e);
    }

    setQuickSuccess(true);
    onAwardPoints(25, "Burnout trigger logged dynamically");
    setTimeout(() => {
      setQuickTriggerText("");
      setQuickSuccess(false);
      setQuickNoteOpen(false);
    }, 1500);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('cardId', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, id: string, targetCol: 'left' | 'right') => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('cardId');
    if (!draggedId || draggedId === id) return;

    const sourceColOrder = leftOrder.includes(draggedId) ? leftOrder : (rightOrder.includes(draggedId) ? rightOrder : null);
    if (!sourceColOrder) return;
    
    const setSourceCol = leftOrder.includes(draggedId) ? setLeftOrder : setRightOrder;
    const setTargetCol = targetCol === 'left' ? setLeftOrder : setRightOrder;
    const targetColOrder = targetCol === 'left' ? leftOrder : rightOrder;

    const draggedIdx = sourceColOrder.indexOf(draggedId);
    
    if (setSourceCol === setTargetCol) {
      // Reordering within the same column
      const targetIdx = targetColOrder.indexOf(id);
      if (draggedIdx !== -1 && targetIdx !== -1) {
        const newOrder = [...targetColOrder];
        const temp = newOrder[draggedIdx];
        newOrder.splice(draggedIdx, 1);
        newOrder.splice(targetIdx, 0, temp);
        setTargetCol(newOrder);
      }
    } else {
      // Moving across columns
      const targetIdx = targetColOrder.indexOf(id);
      const newSourceOrder = [...sourceColOrder];
      const newTargetOrder = [...targetColOrder];
      const temp = newSourceOrder[draggedIdx];
      newSourceOrder.splice(draggedIdx, 1);
      
      if (targetIdx !== -1) {
        newTargetOrder.splice(targetIdx, 0, temp);
      } else {
        newTargetOrder.push(temp); // Drop at end
      }
      
      setSourceCol(newSourceOrder);
      setTargetCol(newTargetOrder);
    }
  };

  // The keyboard-operable equivalent of dragging a card to reorder it -
  // finds which column the card is actually in (rather than assuming),
  // then swaps it with its immediate neighbor in that column.
  const moveWidget = (id: string, direction: 'up' | 'down') => {
    const isLeft = leftOrder.includes(id);
    const order = isLeft ? leftOrder : rightOrder;
    const setOrder = isLeft ? setLeftOrder : setRightOrder;
    const idx = order.indexOf(id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= order.length) return;
    const newOrder = [...order];
    [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
    setOrder(newOrder);
  };
  const handleMoveUp = (id: string) => moveWidget(id, 'up');
  const handleMoveDown = (id: string) => moveWidget(id, 'down');
  const isFirstInCol = (id: string) => leftOrder[0] === id || rightOrder[0] === id;
  const isLastInCol = (id: string) => leftOrder[leftOrder.length - 1] === id || rightOrder[rightOrder.length - 1] === id;

  const StageIcon =
    {
      Safety: ShieldAlert,
      Habits: Battery,
      Identity: Waves,
      Purpose: Zap,
    }[shipStage] || ShieldAlert;

  const calculateRecoveryScore = () => {
    let score = 50; // Base score
    const factors: { label: string; points: number }[] = [];

    if (energyLevel > 60) { score += 15; factors.push({ label: "Energy level", points: 15 }); }
    else if (energyLevel < 30) { score -= 15; factors.push({ label: "Low energy level", points: -15 }); }

    // Factor in recovery debt
    const debtCount = (stats.debts || []).filter((d) => !d.cleared).length;
    if (debtCount > 0) {
      const debtPenalty = -Math.min(debtCount * 5, 20);
      score += debtPenalty;
      factors.push({ label: "Unresolved recovery debt", points: debtPenalty });
    }

    if (fingerprint?.profile === "High-Functioning Exhausted") {
      score -= 5;
      factors.push({ label: "High-Functioning Exhausted pattern", points: -5 });
    }

    // Factor in daily quests completed
    if (hasClaimedDaily) { score += 10; factors.push({ label: "Daily check-in claimed", points: 10 }); }
    if (stats.rehearsalCount > 0) { score += 5; factors.push({ label: "Boundary rehearsal practice", points: 5 }); }
    if (stats.streak > 3) { score += 5; factors.push({ label: "Streak beyond 3 days", points: 5 }); }

    // Integrated Layer 2 Recovery Intelligence Signals
    try {
      const moodLogsSaved = localStorage.getItem("blaze_intelligence_moods");
      if (moodLogsSaved) {
        const moodLogs = JSON.parse(moodLogsSaved);
        if (moodLogs.length > 0) {
          const positiveWords = [
            "good", "great", "rested", "aligned", "steady", "calm", "vibrant", "stable",
          ];
          const recentMood = moodLogs[0].word.toLowerCase();
          const hasPos = positiveWords.some((w: string) => recentMood.includes(w));
          score += hasPos ? 15 : -10;
          factors.push({ label: "Recent mood check-in", points: hasPos ? 15 : -10 });
        }
      }

      const triggersSaved = localStorage.getItem("blaze_intelligence_triggers");
      if (triggersSaved) {
        const triggers = JSON.parse(triggersSaved);
        if (triggers.length > 0) {
          const triggerPenalty = -Math.min(25, triggers.length * 5);
          score += triggerPenalty;
          factors.push({ label: "Logged triggers", points: triggerPenalty });
        }
      }

      const socialBatterySaved = localStorage.getItem("blaze_intelligence_social_battery");
      if (socialBatterySaved) {
        const socialBattery = parseInt(socialBatterySaved, 10);
        if (socialBattery > 60) { score += 10; factors.push({ label: "Social battery", points: 10 }); }
        if (socialBattery < 30) { score -= 15; factors.push({ label: "Low social battery", points: -15 }); }
      }

      const winsSaved = localStorage.getItem("blaze_intelligence_wins");
      if (winsSaved) {
        const winsList = JSON.parse(winsSaved);
        if (winsList.length > 0) {
          const winsBonus = Math.min(25, winsList.length * 8);
          score += winsBonus;
          factors.push({ label: "Logged wins", points: winsBonus });
        }
      }

      const symptomsSaved = localStorage.getItem("blaze_intelligence_symptoms");
      if (symptomsSaved) {
        const symptomsList = JSON.parse(symptomsSaved);
        if (symptomsList.length > 0) {
          const symptomsPenalty = -Math.min(20, symptomsList.length * 4);
          score += symptomsPenalty;
          factors.push({ label: "Logged symptoms", points: symptomsPenalty });
        }
      }

      const focusSaved = localStorage.getItem("blaze_intelligence_focus_shield");
      if (focusSaved === "true") {
        score += 10;
        factors.push({ label: "Focus Shield active", points: 10 });
      }
    } catch (e) {
      console.warn("Could not read local recovery-intelligence signals.", e);
    }

    return { score: Math.max(10, Math.min(100, score)), factors };
  };

  const { score: recoveryScore, factors: recoveryScoreFactors } = calculateRecoveryScore();
  const dynamicRisk =
    recoveryScore < 40 ? "High" : recoveryScore < 70 ? "Moderate" : "Low";

  // We use the passed pulseHistory for the AreaChart


  const cardsMap: Record<string, React.ReactNode> = {
    daily_1: <DailyGoal shipStage={shipStage} key="daily_1" />,
    hero: (
      <SmartCard 
        id="hero"
        key={`hero-${homeRefreshKey}`}
        title="Your Recovery Score"
        energyDrain="high"
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={(e, id) => handleDrop(e, id, 'left')}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        isFirst={isFirstInCol('hero')}
        isLast={isLastInCol('hero')}
        className="p-6 sm:p-8 md:p-10 min-h-[380px] bg-card rounded-xl border border-border flex flex-col justify-between"
      >
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
                Nova is here
              </span>
              <NovaVoiceGuidance stage={shipStage} />
              {hasClaimedDaily && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] font-medium uppercase tracking-widest text-primary"
                >
                  Pulse saved
                </motion.span>
              )}
            </div>
            <button
              onClick={onOpenCheckIn}
              className="text-xs font-medium uppercase tracking-widest text-text-muted hover:text-text-main transition-colors"
            >
              Check in
            </button>
          </div>
          <div className="space-y-3 border-b border-border pb-6">
            <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-text-muted">
              Your Recovery Score
            </span>
            <div className="flex items-center gap-4">
              {stats.streak < 3 ? (
                <div className="flex flex-col gap-1">
                  <h1 className="text-4xl font-mono font-medium tracking-tight text-text-muted">
                    Calculating
                  </h1>
                  <p className="text-xs text-text-muted">
                    Nova requires a 3-day baseline pattern to establish your
                    stable Recovery Score.
                  </p>
                </div>
              ) : (
                <div className="group/tooltip relative inline-flex items-baseline">
                  <h1 className="cursor-help text-5xl sm:text-6xl md:text-7xl font-mono font-medium tracking-tight text-text-main">
                    {recoveryScore}
                    <span className="text-xl sm:text-2xl md:text-3xl font-normal text-text-muted ml-2">
                      /100
                    </span>
                  </h1>

                  <div className="absolute left-0 bottom-full mb-4 px-4 py-3 bg-card text-text-main text-xs font-mono rounded-lg border border-border shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all whitespace-nowrap z-50">
                    What's shaping this score
                    <div className="w-full h-px bg-border my-2" />
                    <div className="text-text-muted space-y-1">
                      {recoveryScoreFactors.length === 0 ? (
                        <p>Base score — no check-ins logged yet.</p>
                      ) : (
                        recoveryScoreFactors.map((f, i) => (
                          <p key={i}>{f.label}: {f.points > 0 ? "+" : ""}{f.points}</p>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-text-muted text-lg max-w-lg leading-relaxed font-display">
            {stats.streak < 3
              ? "Your nervous system requires consistent tracking. Complete your daily pulses to unlock predictive recovery forecasting."
              : '"Your nervous system is carrying recovery debt. '}
            {stats.streak >= 3 && (
              <span className="text-text-main font-serif italic">
                Cease the optimization narrative.
              </span>
            )}
            {stats.streak >= 3 && ' Today is about active repair."'}
          </p>
          <RecoveryExplanation
            energyLevel={energyLevel}
            debtCount={(stats.debts || []).filter((d) => !d.cleared).length}
            isHighFunctioningExhausted={fingerprint?.profile === "High-Functioning Exhausted"}
            hasClaimedDaily={hasClaimedDaily}
            rehearsalCount={stats.rehearsalCount || 0}
            streak={stats.streak || 0}
          />
        </div>

        <div className="flex gap-4 mt-10 pt-6 border-t border-border">
          <button
            onClick={onEnergyRequest}
            className="btn-primary flex items-center gap-2 px-6"
          >
            Manage Budget <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          {!hasClaimedDaily && (
            <button
              onClick={onClaimDaily}
              className="px-6 py-3 rounded-xl border border-border text-text-main font-display font-medium hover:bg-surface transition-colors flex items-center gap-2"
            >
              <Trophy className="w-4 h-4 text-text-muted" /> Claim Pulse
            </button>
          )}
        </div>
      </SmartCard>
    ),
    stats: (
      <div key="stats" className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { label: "Current Phase", value: shipStage, subLabel: "SHIP Journey", color: "text-primary", bg: "bg-primary/10" },
          { label: "Burnout Risk", value: dynamicRisk, subLabel: "How you're trending", color: dynamicRisk === "Low" ? "text-success" : dynamicRisk === "Moderate" ? "text-warning" : "text-destructive", bg: dynamicRisk === "Low" ? "bg-success/10" : dynamicRisk === "Moderate" ? "bg-warning/10" : "bg-destructive/10" },
          { label: "Energy Cap", value: `${energyLevel}%`, subLabel: "Energy available today", color: "text-primary", bg: "bg-primary/10" },
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <SmartCard id={`stat_${i}`} title={item.label} energyDrain={i === 1 ? 'high' : 'low'} onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} isFirst={isFirstInCol(`stat_${i}`)} isLast={isLastInCol(`stat_${i}`)}>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-text-muted">{item.label}</span>
                  <div className={cn("p-2 rounded-xl transition-all duration-500 group-hover:scale-110", item.bg, item.color)}>
                    <StageIcon className="w-4 h-4" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className={cn("text-3xl font-display font-bold", item.color)}>{item.value}</div>
                  <p className="text-xs font-black uppercase tracking-widest text-text-muted ">{item.subLabel}</p>
                </div>
              </div>
            </SmartCard>
          </motion.div>
        ))}
      </div>
    ),
    trends: (
      <SmartCard id="trends" key="trends" title="Recovery Trends" energyDrain="medium" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} isFirst={isFirstInCol('trends')} isLast={isLastInCol('trends')} className="p-6 rounded-xl border border-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-medium text-text-main line-clamp-1">30-day recovery history</h3>
              <p className="text-[11px] uppercase font-medium tracking-widest text-text-muted">Long-term pattern</p>
            </div>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pulseHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ea580c" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#a8a29e" opacity={0.25} />
              <XAxis dataKey="date" tick={{ fill: '#a8a29e', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fill: '#a8a29e', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #3a3532', borderRadius: '8px' }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 500 }}
                formatter={(value: number) => [`${value}`, 'Score']}
              />
              <Area type="monotone" dataKey="score" stroke="#ea580c" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SmartCard>
    ),
    anxietyResetCard: (
      <SmartCard 
        id="anxietyResetCard" 
        key="anxietyResetCard"
        title="Nervous Overload Reset"
        energyDrain="high"
        onDragStart={handleDragStart} 
        onDragOver={handleDragOver} 
        onDrop={(e, id) => handleDrop(e, id, 'left')}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        isFirst={isFirstInCol('anxietyResetCard')}
        isLast={isLastInCol('anxietyResetCard')}
        className="p-6 bg-red-950/20 border border-red-500/20 hover:border-red-500/40 rounded-2xl relative overflow-hidden transition-all duration-300"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-[40px] pointer-events-none" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div className="space-y-1 text-left">
            <span className="px-2.5 py-0.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-wider rounded-full">
              Body Reset
            </span>
            <h3 className="text-lg font-bold font-display text-text-main mt-1">Anxiety & Overwhelm Reset</h3>
            <p className="text-xs text-text-muted max-w-md leading-relaxed">
              Facing work dread, racing thoughts, or panic spikes? Deploy a sensory reset immediately to restore baseline executive safety.
            </p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'anxiety_reset' }))}
            className="px-5 py-3 shrink-0 bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-md shadow-red-500/10 flex items-center gap-2"
          >
            Start Reset <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </SmartCard>
    ),
    velocity: (
      <SmartCard id="velocity" key="velocity" title="Recovery Velocity Map" energyDrain="low" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} isFirst={isFirstInCol('velocity')} isLast={isLastInCol('velocity')} className="p-6">
        <RecoveryVelocityMap />
      </SmartCard>
    ),
    hub: (
      <SmartCard id="hub" key="hub" title="Recovery Hub" energyDrain="medium" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} isFirst={isFirstInCol('hub')} isLast={isLastInCol('hub')} className="cursor-pointer rounded-xl border border-border p-6">
        <div className="flex items-center gap-6 sm:gap-10" onClick={onEnergyRequest}>
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <StageIcon className="w-8 h-8" />
          </div>
          <div className="space-y-2 flex-1 text-left min-w-0">
            <span className="text-[11px] font-medium uppercase tracking-widest text-primary">Recovery mode enabled</span>
            <h2 className="text-2xl font-display font-medium text-text-main tracking-tight">
              Active repatterning: {shipStage}
            </h2>
            <p className="text-text-muted text-base font-serif italic">
              "Your recovery is not a suggestion. It is a biological prerequisite for the coming cycle."
            </p>
          </div>
          <button className="w-11 h-11 rounded-full border border-border flex items-center justify-center text-text-muted hover:text-primary hover:border-primary transition-colors shrink-0">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </SmartCard>
    ),
    gamification: <GamificationDisplay key="gamification" stats={stats} fingerprint={fingerprint} shipStage={shipStage} pulseHistory={pulseHistory} />,
    archetypeBlend: <ArchetypeBlend key={`archetypeBlend-${homeRefreshKey}`} />,
    somaticAccelerator: (
      <SomaticCheckInCard
        key="somaticAccelerator"
        onAwardPoints={onAwardPoints}
        onUpdateOperationalMetrics={onUpdateOperationalMetrics}
        onUpdatePulseHistory={onUpdatePulseHistory}
        onLogJourney={onLogJourney}
      />
    ),
    daily: <DailyGoal key="daily" shipStage={shipStage} />,
    micro: <MicroInterventions key="micro" shipStage={shipStage} id="micro" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} isFirst={isFirstInCol('micro')} isLast={isLastInCol('micro')} />,
    directive: (
      <SmartCard id="directive" key="directive" title="Nova's Suggestion" energyDrain="high" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'right')} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} isFirst={isFirstInCol('directive')} isLast={isLastInCol('directive')} className="rounded-xl border border-border p-6">
        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between pb-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary"></div>
              <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-main">Today's focus</h3>
            </div>
            {recommendation && <span className="text-[11px] font-mono text-text-muted">+{recommendation.points}</span>}
          </div>
          {recommendationLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 animate-spin text-text-muted" />
            </div>
          ) : recommendation ? (
            <div>
              <p className="text-lg font-serif italic text-text-main leading-snug">
                "{recommendation.title}"
              </p>
              <div className="mt-6 p-5 bg-surface rounded-lg border border-border">
                <span className="text-[11px] font-medium text-text-muted uppercase tracking-widest block mb-2">{recommendation.tool}</span>
                <p className="text-sm font-medium text-text-main">{recommendation.message}</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-lg font-serif italic text-text-main leading-snug">
                "Nothing specific flagged right now — that's a good sign."
              </p>
              <div className="mt-6 p-5 bg-surface rounded-lg border border-border">
                <p className="text-sm font-medium text-text-main">Complete a check-in or use any recovery tool, and Nova will start noticing patterns to point you toward.</p>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              if (recommendation && recommendation.tab !== 'home') {
                window.dispatchEvent(new CustomEvent('navigate_tab', { detail: recommendation.tab }));
              } else {
                onChatRequest();
              }
            }}
            className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 group transition-all"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{recommendation && recommendation.tab !== 'home' ? `Open ${recommendation.tool}` : 'Connect with Nova'}</span>
            <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </SmartCard>
    ),
    quests: (
      <SmartCard id="quests" key="quests" title="Milestones" energyDrain="medium" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'right')} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} isFirst={isFirstInCol('quests')} isLast={isLastInCol('quests')} className="space-y-6 p-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-main flex items-center gap-3">
          <Gift className="w-5 h-5 text-primary" /> Milestones
        </h3>
        <div className="space-y-3">
          {[
            { label: "Complete today's check-in", pts: 50, done: hasClaimedDaily },
            { label: "Reach a 3-day streak", pts: 100, done: stats.streak >= 3 },
            { label: "Complete your burnout diagnostic", pts: 75, done: !!fingerprint }
          ].map((q, i) => (
            <div key={i} className={cn("flex items-center justify-between p-4 rounded-2xl border transition-all", q.done ? "bg-surface/50 border-border/50" : "bg-card border-border shadow-sm hover:shadow-md")}>
              <div className="flex items-center gap-3">
                <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center transition-all", q.done ? "bg-accent text-accent-foreground" : "bg-surface dark:bg-surface/50 text-text-muted")}>
                  {q.done ? <CheckCircle className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                </div>
                <span className={cn("text-xs font-bold tracking-tight", q.done ? "text-text-muted" : "text-text-main")}>{q.label}</span>
              </div>
              <span className={cn("text-xs font-black tracking-tighter", q.done ? "text-text-muted" : "text-primary")}>+{q.pts}</span>
            </div>
          ))}
        </div>
      </SmartCard>
    ),
    network: (
      <SmartCard id="network" key="network" title="Guardian Network" energyDrain="low" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'right')} onMoveUp={handleMoveUp} onMoveDown={handleMoveDown} isFirst={isFirstInCol('network')} isLast={isLastInCol('network')} className="p-6">
        <h3 className="text-xs font-black text-text-muted uppercase tracking-widest mb-6 px-1">Guardian Network</h3>
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-12 h-12 rounded-2xl border-4 border-surface dark:border-surface bg-border overflow-hidden shadow-xl hover:scale-110 hover:z-20 transition-all duration-300 cursor-pointer">
                <img src={`https://i.pravatar.cc/100?u=${i + 10}`} alt="Guardian" className="w-full h-full object-cover" />
              </div>
            ))}
            <div className="w-12 h-12 rounded-2xl border-4 border-surface dark:border-surface bg-surface dark:bg-card flex items-center justify-center text-text-muted text-xs font-black shadow-xl hover:bg-primary/5 hover:text-primary transition-all cursor-pointer">
              +
            </div>
          </div>
          <div className="flex-1 ml-2">
            <span className="text-xs font-black text-primary uppercase tracking-[0.2em] block">Active Guardians</span>
            <p className="text-xs text-text-muted font-medium">3 Synchronized</p>
          </div>
        </div>
      </SmartCard>
    ),
    radar: <RelapseRadar key="radar" />,
    streakCalendar: (
      <SmartCard 
        id="streakCalendar" 
        key="streakCalendar" 
        title="Recovery Streak Tracker" 
        energyDrain="low" 
        onDragStart={handleDragStart} 
        onDragOver={handleDragOver} 
        onDrop={(e, id) => handleDrop(e, id, 'left')}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        isFirst={isFirstInCol('streakCalendar')}
        isLast={isLastInCol('streakCalendar')}
        className="p-6 bg-card border border-border rounded-2xl shadow-xl space-y-6"
      >
        {(() => {
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD, real current date
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth(); // 0-indexed
          const currentMonthLabel = today.toLocaleString('default', { month: 'long' });
          const todayDayNum = today.getDate();

          const handleCommitTodayBudget = () => {
            if (streakDays.includes(todayStr)) return;
            const updated = [todayStr, ...streakDays];
            setStreakDays(updated);
            localStorage.setItem("blaze_recovery_streak_days", JSON.stringify(updated));
            onAwardPoints(50, "Energy Budget Maintained Today");
            // Also increase stats streak - routed through the parent's real
            // Firestore-backed stats state rather than writing directly to
            // localStorage, which could be silently overwritten by the
            // next state-driven save.
            onIncrementStreak();
          };

          const isTodayCommitted = streakDays.includes(todayStr);

          // Monthly grid for the actual current month/year, computed for real
          // rather than hardcoded to a single test date.
          const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
          const startOffset = new Date(currentYear, currentMonth, 1).getDay(); // 0=Sunday
          const totalCells = daysInMonth + startOffset;

          // Consecutive-day streak counting backward from today, not a hardcoded range.
          const currentStreakLength = (() => {
            let count = 0;
            const cursor = new Date(today);
            while (streakDays.includes(cursor.toISOString().split('T')[0])) {
              count++;
              cursor.setDate(cursor.getDate() - 1);
            }
            return count;
          })();

          return (
            <div className="space-y-6 text-left">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/30 flex items-center justify-center text-success">
                    <Flame className="w-5 h-5 fill-success/20" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-main">Recovery Streak</h4>
                    <p className="text-[10px] text-text-muted font-black uppercase tracking-widest mt-0.5">Days you've checked in</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-mono font-black text-success tracking-tight">
                    {currentStreakLength} Days
                  </span>
                  <p className="text-[9px] uppercase font-black text-text-muted tracking-widest mt-0.5">Current Streak</p>
                </div>
              </div>

              {/* Calendar Grid */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-black uppercase text-text-main tracking-wider">{currentMonthLabel} {currentYear}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-success/20 border border-success/40 inline-block" /> Checked in
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-mono mb-2 text-text-muted font-bold">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                    <div key={d} className="py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: totalCells }).map((_, i) => {
                    if (i < startOffset) {
                      return <div key={`empty-${i}`} className="aspect-square" />;
                    }

                    const dayNum = i - startOffset + 1;
                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const isStreak = streakDays.includes(dateStr);
                    const isToday = dayNum === todayDayNum;

                    return (
                      <motion.button
                        key={`day-${dayNum}`}
                        onClick={() => setSelectedDay(dateStr)}
                        initial={{ scale: 0.3, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ 
                          type: "spring", 
                          stiffness: 260, 
                          damping: 20, 
                          delay: (dayNum - 1) * 0.015 
                        }}
                        className={cn(
                          "aspect-square rounded-xl flex flex-col items-center justify-center relative border transition-all text-xs font-bold cursor-pointer",
                          isStreak 
                            ? "bg-success/15 border-success/45 text-success shadow-inner shadow-success/5 hover:bg-success/25" 
                            : isToday
                              ? "border-primary text-primary bg-primary/10 animate-pulse font-extrabold"
                              : "border-border/40 hover:border-border text-text-muted"
                        )}
                      >
                        <span>{dayNum}</span>
                        {isStreak && (
                          <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-success" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Day details or commitment trigger */}
              <AnimatePresence mode="wait">
                {selectedDay ? (
                  <motion.div
                    key="day-detail"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-4 bg-surface dark:bg-card/40 rounded-2xl border border-border text-xs relative text-left"
                  >
                    <button 
                      onClick={() => setSelectedDay(null)}
                      className="absolute top-3 right-3 text-text-muted hover:text-text-main font-bold"
                    >
                      ×
                    </button>
                    <p className="font-bold text-text-main">
                      {new Date(selectedDay + 'T00:00:00').toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })} Status:
                    </p>
                    <p className="text-text-muted mt-1.5 font-medium leading-relaxed">
                      {streakDays.includes(selectedDay) 
                        ? "✓ Energy Budget fully maintained. Active repairs completed. +20 credits reserved."
                        : "No tracking data saved for this date. Complete your daily pulse or recovery tasks to mark stability achievements."}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="streak-action"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3"
                  >
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-text-main">Commit Today's Energy Budget</p>
                        <p className="text-[10px] text-text-muted font-medium">Verify you kept your meetings and boundaries under budget for today ({currentMonthLabel} {todayDayNum}).</p>
                      </div>
                    </div>
                    <button
                      disabled={isTodayCommitted}
                      onClick={handleCommitTodayBudget}
                      className={cn(
                        "w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer",
                        isTodayCommitted 
                          ? "bg-success/15 border border-success/30 text-success cursor-default" 
                          : "btn-primary"
                      )}
                    >
                      {isTodayCommitted ? "✓ Today's Budget Locked" : "Lock Budget & Maintain Streak"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}
      </SmartCard>
    ),
    activity: (
      <ActivityLog 
        key="activity" 
        onDragStart={handleDragStart} 
        onDragOver={handleDragOver} 
        onDrop={(e, id) => handleDrop(e, id, 'left')} 
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        isFirst={isFirstInCol('activity')}
        isLast={isLastInCol('activity')}
      />
    )
  };

  return (
    <div
      onTouchStart={handleHomeTouchStart}
      onTouchMove={handleHomeTouchMove}
      onTouchEnd={handleHomeTouchEnd}
      className="relative"
    >
      <div
        className="flex justify-center overflow-hidden transition-none"
        style={{ height: pullDistance > 0 || isPullRefreshing ? Math.max(pullDistance, isPullRefreshing ? 50 : 0) : 0 }}
      >
        <div className="flex items-center justify-center text-primary" style={{ opacity: Math.min(pullDistance / PULL_TRIGGER_THRESHOLD, 1) }}>
          <RefreshCw className={cn("w-5 h-5", isPullRefreshing && "animate-spin", !isPullRefreshing && pullDistance >= PULL_TRIGGER_THRESHOLD && "scale-110")} />
        </div>
      </div>
      <div style={{ transform: `translateY(${isPullRefreshing ? 0 : pullDistance}px)`, transition: isDragging ? "none" : "transform 0.2s ease-out" }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 pb-20">
      <div
        className="lg:col-span-2 flex flex-col gap-10 min-h-[500px]"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={(e) => {
          // Fallback if dropped directly on container
          const targetCard = e.target as HTMLElement;
          if (targetCard.classList.contains('card')) return;
          const draggedId = e.dataTransfer.getData('cardId');
          if (leftOrder.includes(draggedId)) return;
          if (rightOrder.includes(draggedId)) {
            setRightOrder(rightOrder.filter(id => id !== draggedId));
            setLeftOrder([...leftOrder, draggedId]);
          }
        }}
      >
        <AnimatePresence>
          {leftOrder.map(id => (
            <motion.div key={id} layout transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="relative group/widget">
              <button
                onClick={() => handleHideCard(id)}
                title={`Hide ${WIDGET_LIBRARY[id] || 'card'}`}
                className="absolute top-4 right-4 z-30 p-1.5 rounded-full bg-card/90 border border-border text-text-muted hover:text-destructive opacity-0 group-hover/widget:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {cardsMap[id]}
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="relative">
          <button
            onClick={() => setShowAddWidgetMenu((v) => !v)}
            className="w-full py-4 rounded-2xl border border-dashed border-border text-text-muted hover:text-primary hover:border-primary/40 transition-colors text-sm font-bold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add widget
          </button>
          <AnimatePresence>
            {showAddWidgetMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute z-30 mt-2 w-full max-h-80 overflow-y-auto custom-scrollbar bg-card border border-border rounded-2xl shadow-2xl p-2 space-y-1"
              >
                {hiddenWidgets.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-4">Everything's already on your dashboard.</p>
                ) : (
                  hiddenWidgets.map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        handleAddWidget(id);
                        setShowAddWidgetMenu(false);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm text-text-main hover:bg-surface transition-colors text-left"
                    >
                      <span>{WIDGET_LIBRARY[id] || id}</span>
                      <Plus className="w-4 h-4 text-text-muted shrink-0" />
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div
        className="flex flex-col gap-10 min-h-[500px]"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={(e) => {
          const targetCard = e.target as HTMLElement;
          if (targetCard.classList.contains('card')) return;
          const draggedId = e.dataTransfer.getData('cardId');
          if (rightOrder.includes(draggedId)) return;
          if (leftOrder.includes(draggedId)) {
            setLeftOrder(leftOrder.filter(id => id !== draggedId));
            setRightOrder([...rightOrder, draggedId]);
          }
        }}
      >
        <AnimatePresence>
          {rightOrder.map(id => (
            <motion.div key={id} layout transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="relative group/widget">
              <button
                onClick={() => handleHideCard(id)}
                title={`Hide ${WIDGET_LIBRARY[id] || 'card'}`}
                className="absolute top-4 right-4 z-30 p-1.5 rounded-full bg-card/90 border border-border text-text-muted hover:text-destructive opacity-0 group-hover/widget:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {cardsMap[id]}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      </div>
      </div>

      {/* 'Quick Note' Floating Trigger Input Field */}
      <div className="fixed bottom-8 right-8 z-[80] font-sans">
        <AnimatePresence>
          {quickNoteOpen && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              className="absolute bottom-16 right-0 w-80 sm:w-96 bg-card border border-border/80 p-6 rounded-2xl shadow-2xl space-y-4 text-left backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wider text-text-main">Quick Trigger Capture</h5>
                    <p className="text-[9px] uppercase font-bold text-text-muted">Nova Quick Check-In</p>
                  </div>
                </div>
                <button
                  onClick={() => setQuickNoteOpen(false)}
                  className="text-text-muted hover:text-text-main text-sm font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {quickSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-success/10 border border-success/20 rounded-xl text-center space-y-1"
                >
                  <p className="text-xs font-bold text-success">✓ Trigger Captured & Neutralized</p>
                  <p className="text-[10px] text-text-muted font-medium">Logged securely. +25 XP awarded.</p>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[10px] text-text-muted leading-relaxed font-medium">
                    Log an immediate, live burnout trigger (e.g. unsolicited slack notification, unplanned fire-drill). Nova files this in memory to build boundary templates.
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Immediate Drain Description</label>
                    <input
                      type="text"
                      value={quickTriggerText}
                      onChange={(e) => setQuickTriggerText(e.target.value)}
                      placeholder="e.g. Back-to-back status sync"
                      className="w-full bg-surface border border-border/70 rounded-xl px-3.5 py-2.5 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary font-sans font-semibold text-left"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-text-muted">
                      <span>Severity Burden</span>
                      <span className="font-mono text-primary font-bold">{quickSeverity}/10</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={quickSeverity}
                      onChange={(e) => setQuickSeverity(Number(e.target.value))}
                      className="w-full accent-primary h-1 bg-border rounded cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={handleSaveQuickTrigger}
                    disabled={!quickTriggerText.trim()}
                    className="w-full py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Log a Trigger (+25 XP)
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setQuickNoteOpen(!quickNoteOpen)}
          className="p-4 bg-primary text-primary-foreground hover:bg-primary/95 rounded-full shadow-[0_8px_30px_rgba(99,102,241,0.5)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer border border-primary/30"
        >
          <PencilLine className="w-5 h-5" />
          <span className="text-xs font-black uppercase tracking-widest pr-1 hidden sm:inline">Log Trigger</span>
        </button>
      </div>
    </div>
  );
};
