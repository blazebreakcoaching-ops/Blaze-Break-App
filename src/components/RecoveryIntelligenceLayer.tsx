import { ConnectedMoodPulse, ConnectedBodyCheckIn, ConnectedWinsLog } from './ConnectedRecoveryModules.tsx';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Compass,
  Activity,
  Heart,
  Smile,
  Flame, 
  Users, 
  Trophy, 
  Zap, 
  Calendar, 
  Coffee, 
  ShieldAlert, 
  Check, 
  BookOpen, 
  Plus, 
  Trash2, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Briefcase,
  Sliders,
  BellRing,
  Award,
  CircleCheck,
  Info,
  Clock,
  Eye,
  Send,
  Loader2,
  LineChart,
  ArrowRight,
  Mic,
  MicOff,
HeartPulse, Star, Wind, RefreshCw, TrendingUp, TrendingDown,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { updateNovaMemoryBySourceAndType } from '../lib/nova-brain';
import { secureApiFetch } from '../lib/secure-api';
import { RecoveryVelocityChart } from './RecoveryVelocityChart';

interface RecoveryIntelligenceProps {
  onAwardPoints: (amount: number, reason: string) => void;
  fingerprint?: any;
}

// Sub-components internal data structure
interface MoodPulseData {
  timestamp: string;
  emoji: string;
  color: string;
  word: string;
}

interface TriggerData {
  id: string;
  timestamp: string;
  source: string; // meeting, person, email, etc.
  notes: string;
  severity: 'low' | 'medium' | 'high';
}

interface WinLogData {
  id: string;
  timestamp: string;
  category: string;
  description: string;
}

export const RecoveryIntelligenceLayer = ({ onAwardPoints, fingerprint }: RecoveryIntelligenceProps) => {
  const [activeRoom, setActiveRoom] = useState<string>('velocity');

  // Load States from Firestore/Sync
  const [moodLogs, setMoodLogs] = useState<MoodPulseData[]>([]);
  const [triggers, setTriggers] = useState<TriggerData[]>([]);
  const [socialBattery, setSocialBattery] = useState<number>(70);
  const [wins, setWins] = useState<WinLogData[]>([
    { id: '1', timestamp: new Date(Date.now() - 86400000).toISOString(), category: 'boundary', description: 'Politely declined a non-urgent Sunday slack thread request.' },
    { id: '2', timestamp: new Date(Date.now() - 172800000).toISOString(), category: 'rest', description: 'Used the Reset Studio shallow breathing pacer for 5 minutes during a packed sprint.' }
  ]);
  const [bodySymptoms, setBodySymptoms] = useState<string[]>([]);
  const [weeklyReview, setWeeklyReview] = useState<any>(null);
  const [rtwPhase, setRtwPhase] = useState<number>(1);
  const [meetingLimit, setMeetingLimit] = useState<number>(2);
  const [isFocusShieldActive, setIsFocusShieldActive] = useState<boolean>(false);

  // Phase 3B Derived summaries states
  interface DerivedSummary {
    type: 'recovery_debt' | 'recovery_velocity' | 'energy_trend' | 'mood_trend';
    status: 'not_enough_data' | 'early_signal' | 'available';
    value: number | null;
    direction: 'rising' | 'falling' | 'stable' | 'unknown';
    confidenceLevel: 'low' | 'medium' | 'high';
    sourceCount: number;
    periodStart: string;
    periodEnd: string;
    formulaVersion: string;
    explanation: string;
    sourcesUsed: string[];
    calculatedAt: string;
  }

  const [summaries, setSummaries] = useState<Record<string, DerivedSummary | null>>({
    recovery_debt: null,
    recovery_velocity: null,
    energy_trend: null,
    mood_trend: null
  });
  const [loadingSummaries, setLoadingSummaries] = useState<boolean>(false);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);
  const [recalculateSuccess, setRecalculateSuccess] = useState<boolean>(false);
  const [expandedFormula, setExpandedFormula] = useState<string | null>(null);

  const { user } = useAuth();
  const initLoaded = useRef(false);

  useEffect(() => {
    if (!user) return;
    // Phase 1C: Sensitive recovery data syncing is entirely disabled in Secure Account Test Mode.
    // We do not load data from Firestore here.
    initLoaded.current = true;
  }, [user]);

  useEffect(() => {
    if (!user || !initLoaded.current) return;
    // Phase 1C: Sensitive recovery data syncing is entirely disabled.
    // We do not save to Firestore here.
  }, [user, moodLogs, triggers, socialBattery, wins, bodySymptoms, weeklyReview, rtwPhase, meetingLimit, isFocusShieldActive]);

  const fetchDerivedSummaries = async () => {
    if (!user) return;
    setLoadingSummaries(true);
    try {
      const types = ['recovery_debt', 'recovery_velocity', 'energy_trend', 'mood_trend'];
      const loadedSummaries: Record<string, DerivedSummary | null> = {};
      for (const t of types) {
        const summaryDoc = await getDoc(doc(db, 'users', user.uid, 'derived', t));
        if (summaryDoc.exists()) {
          loadedSummaries[t] = summaryDoc.data() as DerivedSummary;
        } else {
          loadedSummaries[t] = null;
        }
      }
      setSummaries(loadedSummaries);
    } catch (err: any) {
      console.error("Failed to fetch derived summaries", err);
    } finally {
      setLoadingSummaries(false);
    }
  };

  const handleRecalculate = async () => {
    if (!user) return;
    setRecalculating(true);
    setRecalculateError(null);
    setRecalculateSuccess(false);
    try {
      // 1. Fetch data from firestore first
      const { getDocs, collection } = await import('firebase/firestore');
      const checkinsSnap = await getDocs(collection(db, 'users', user.uid, 'checkins'));
      const budgetsSnap = await getDocs(collection(db, 'users', user.uid, 'energy_budgets'));
      const moodPulsesSnap = await getDocs(collection(db, 'users', user.uid, 'mood_pulses'));
      const bodyCheckinsSnap = await getDocs(collection(db, 'users', user.uid, 'body_checkins'));
      const winsSnap = await getDocs(collection(db, 'users', user.uid, 'wins'));
      const weeklyReviewsSnap = await getDocs(collection(db, 'users', user.uid, 'weekly_reviews'));
      const goalsSnap = await getDocs(collection(db, 'users', user.uid, 'goals'));

      const payload = {
        checkins: checkinsSnap.docs.map(d => ({id: d.id, ...d.data()})),
        energy_budgets: budgetsSnap.docs.map(d => ({id: d.id, ...d.data()})),
        mood_pulses: moodPulsesSnap.docs.map(d => ({id: d.id, ...d.data()})),
        body_checkins: bodyCheckinsSnap.docs.map(d => ({id: d.id, ...d.data()})),
        wins: winsSnap.docs.map(d => ({id: d.id, ...d.data()})),
        weekly_reviews: weeklyReviewsSnap.docs.map(d => ({id: d.id, ...d.data()})),
        goals: goalsSnap.docs.map(d => ({id: d.id, ...d.data()}))
      };

      const res = await secureApiFetch('/api/recovery/recalculate', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success && data.summaries) {
        setRecalculateSuccess(true);
        onAwardPoints(15, 'Recalculated Derived Recovery Intelligence');
        
        // Save to firestore exactly as server returned it
        const { setDoc } = await import('firebase/firestore');
        for (const [key, summary] of Object.entries(data.summaries)) {
          await setDoc(doc(db, 'users', user.uid, 'derived', key), summary as any);
        }

        await fetchDerivedSummaries();
        setTimeout(() => setRecalculateSuccess(false), 3000);
      } else {
        setRecalculateError(data.error || "An expected calculation error occurred.");
      }
    } catch (err: any) {
      setRecalculateError(err.message || "A secure connection failure occurred.");
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDerivedSummaries();
    }
  }, [user]);

  // Somatic Micro-Interventions Timer States & Presets
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presetTimeLeft, setPresetTimeLeft] = useState<number>(0);
  const [presetRunning, setPresetRunning] = useState<boolean>(false);
  const [presetCompletedSuccess, setPresetCompletedSuccess] = useState<boolean>(false);

  // Somatic presets list for direct physical release
  const BODY_RESET_PRESETS = [
    {
      id: 'physiolsigh',
      name: 'Physiological Sigh',
      durationSeconds: 60,
      description: 'Double inhale through your nose followed by a long sigh exhale. Releasing carbon dioxide quickly resetting baseline tone.',
      steps: [
        'Take a deep unhurried inhale through the nose.',
        'Take a secondary sharp sip of air to inflate the lungs.',
        'Sigh it out long and audibly through your slack mouth.',
        'Repeat this dual breath loop 3-5 times.'
      ]
    },
    {
      id: 'eyerelease',
      name: 'Optic Drift (20-20-20 Rule)',
      durationSeconds: 60,
      description: 'Relieves screens mental strain and frontal neural focus fatigue.',
      steps: [
        'Avert eyes from any digital screen.',
        'Find a physical object 20 feet away to look at softly.',
        'Let your eyes linger on the negative spaces for 20 seconds.',
        'Blink consciously 5 times to let optic networks cool.'
      ]
    },
    {
      id: 'jawtension',
      name: 'Jaw Drop & Shoulder Release',
      durationSeconds: 90,
      description: 'Clears somatic holding zones. Highly recommended for clenching habits.',
      steps: [
        'Drop your jaw completely loose. Let it slide slightly forward.',
        'Roll your shoulders forward, carry them high, then drop them heavy.',
        'Tilt your left ear to your left shoulder; repeat on the right.',
        'Breathe into the widened cervical stretch for 4 full cycles.'
      ]
    },
    {
      id: 'stepsreset',
      name: '3-Minute Somatic Desk Reset Walk',
      durationSeconds: 180,
      description: 'Complete spatial disruption. Breaks the mental inertia loop.',
      steps: [
        'Lock screen and walk away from work infrastructure.',
        'Observe 3 different color palettes around the room.',
        'Feel the weight of the floor under your heels.',
        'Return to the desk with single-task priority focus.'
      ]
    }
  ];

  // Helper trigger keyword to script suggestion matcher
  const getScriptSuggestion = (notes: string) => {
    if (!notes) return null;
    const lowercase = notes.toLowerCase();
    
    if (lowercase.includes('scope') || lowercase.includes('assign') || lowercase.includes('add') || lowercase.includes('extra') || lowercase.includes('mid-week')) {
      return {
        id: 'scope-creep',
        title: 'The "Scope Creep" Block',
        situation: 'Scope creep or mid-week additions.',
        script: "I've reviewed the project requirements. To ensure I deliver this to the standard we need, I'll need to push the final review of [Current Project] to next Tuesday. Which of these takes priority for the team's goals this week?",
        advice: "Don't say \"I'm too busy.\" Force a trade-off. It makes the decision theirs, but the boundary yours."
      };
    }
    if (lowercase.includes('4pm') || lowercase.includes('meeting') || lowercase.includes('afternoon') || lowercase.includes('evening') || lowercase.includes('calendar') || lowercase.includes('zoom') || lowercase.includes('call')) {
      return {
        id: '4pm-meeting',
        title: 'The 4PM Meeting Decline',
        situation: 'Late-day meetings or afternoon energy depleting triggers.',
        script: "I've reached my capacity for deep focus today and want to ensure I'm fully present for this discussion. Can we move this to my 10 AM block tomorrow when I can give it my full cognitive energy?",
        advice: "Frame it as a quality issue, not a 'me' issue. You're protecting the conversation, not just your time."
      };
    }
    if (lowercase.includes('pay') || lowercase.includes('promo') || lowercase.includes('promotion') || lowercase.includes('salary') || lowercase.includes('title') || lowercase.includes('senior') || lowercase.includes('lead') || lowercase.includes('responsibility') || lowercase.includes('compensation') || lowercase.includes('money')) {
      return {
        id: 'promo-talk',
        title: 'High-Output Negotiation',
        situation: 'More responsibilities without corresponding title or compensation adjustments.',
        script: "I'm excited to take on these [Senior Tasks]. To do this effectively, I'd like to formalize this transition. Can we look at the promotion criteria this week so we're aligned on the roadmap for my new role?",
        advice: "Turn 'extra work' into 'career advancement' immediately. If they aren't ready for the title, they aren't ready for the work."
      };
    }
    if (lowercase.includes('weekend') || lowercase.includes('sunday') || lowercase.includes('saturday') || lowercase.includes('friday night') || lowercase.includes('late night') || lowercase.includes('slack') || lowercase.includes('email') || lowercase.includes('client')) {
      return {
        id: 'weekend-client',
        title: 'The Weekend Boundary',
        situation: 'A client or coworker expects off-hours responses.',
        script: "Thanks for your note. To maintain the quality of service I provide my clients, I dedicate my weekends to recovery so I can be fully available during business hours. I'll have an answer for you by noon today.",
        advice: "Never apologize for having a weekend. You are a high-value resource; resources need maintenance."
      };
    }
    if (lowercase.includes('low-leverage') || lowercase.includes('busywork') || lowercase.includes('admin') || lowercase.includes('manually') || lowercase.includes('reports') || lowercase.includes('delegate') || lowercase.includes('excel')) {
      return {
        id: 'task-handoff',
        title: 'Delegating Up or Across',
        situation: 'Overloading with administrative task baggage.',
        script: "To maintain velocity on the [Core Strategic Project], I am going to hand off the [Low Leverage Task] data gathering to you starting this week. Let's block 15 minutes to review the hand-over.",
        advice: "Be decisive. State the hand-off as a required operational adjustment rather than a request for permission."
      };
    }
    if (lowercase.includes('unrealistic') || lowercase.includes('impossible') || lowercase.includes('deliverable') || lowercase.includes('timeline') || lowercase.includes('deadlines') || lowercase.includes('speed') || lowercase.includes('urgency') || lowercase.includes('asap')) {
      return {
        id: 'unreasonable-request-decline',
        title: 'The Unreasonable Request Decline',
        situation: 'Unfeasible deadlines or unrealistic turnaround scopes.',
        script: "I've assessed the request, and while I understand the urgency, the timeline proposed isn't feasible without severely compromising the quality or dropping our current commitments. I can deliver a scoped-down version by that date...",
        advice: "Never absorb structural dysfunction. Shift the problem back to the requester as a choice between scope, quality, and time."
      };
    }
    return null;
  };

  // Somatic timer hook
  useEffect(() => {
    if (!presetRunning || presetTimeLeft <= 0) {
      if (presetRunning && presetTimeLeft === 0) {
        setPresetRunning(false);
        setPresetCompletedSuccess(true);
        onAwardPoints(15, 'Somatic Micro-Intervention Completed');
        setTimeout(() => {
          setPresetCompletedSuccess(false);
          setActivePresetId(null);
        }, 3500);
      }
      return;
    }
    const timer = setTimeout(() => {
      setPresetTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [presetRunning, presetTimeLeft]);

  // Saving helpers
  const saveMoods = (newLogs: MoodPulseData[]) => {
    setMoodLogs(newLogs);
  };

  const saveTriggers = (newTriggers: TriggerData[]) => {
    setTriggers(newTriggers);
  };

  const saveWins = (newWins: WinLogData[]) => {
    setWins(newWins);
  };

  // 1. Mood Pulse Temp States
  const [selectedEmoji, setSelectedEmoji] = useState('😐');
  const [selectedColor, setSelectedColor] = useState('bg-warning');
  const [moodWord, setMoodWord] = useState('');

  const submitMoodPulse = () => {
    const newLog: MoodPulseData = {
      timestamp: new Date().toISOString(),
      emoji: selectedEmoji,
      color: selectedColor,
      word: moodWord.trim() || 'Steady'
    };
    const updated = [newLog, ...moodLogs].slice(0, 30);
    saveMoods(updated);
    setMoodWord('');
    
    // Push context to Nova Brain
    updateNovaMemoryBySourceAndType(
      'Mood Pulse Room',
      'state',
      {
        content: `User logged mood pulse: ${newLog.emoji} (${newLog.word}). Physiological alignment color: ${newLog.color}.`,
        canEdit: false,
        confidence: 'high'
      }
    );
  };

  // 2. Trigger Journal Temp States
  const [triggerSource, setTriggerSource] = useState('Meetings');
  const [triggerNotes, setTriggerNotes] = useState('');
  const [triggerSeverity, setTriggerSeverity] = useState<'low' | 'medium' | 'high'>('medium');
  const [isRecording, setIsRecording] = useState(false);
  
  // Speech Recognition API
  const recognitionRef = useRef<any>(null);

  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in your browser.");
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
           setTriggerNotes(prev => (prev + " " + finalTranscript).trim());
        }
      };
      
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    }
  };

  const submitTrigger = () => {
    if (!triggerNotes.trim()) return;
    const newTrigger: TriggerData = {
      id: Math.random().toString(),
      timestamp: new Date().toISOString(),
      source: triggerSource,
      notes: triggerNotes.trim(),
      severity: triggerSeverity
    };
    const updated = [newTrigger, ...triggers];
    saveTriggers(updated);
    setTriggerNotes('');

    // Brain sync
    updateNovaMemoryBySourceAndType(
      'Trigger Journal',
      'state',
      {
        content: `User encountered stress trigger: "${newTrigger.notes}" during [${newTrigger.source}]. Flagged severity: ${newTrigger.severity}.`,
        canEdit: false,
        confidence: 'high'
      }
    );
  };

  // 3. Social Battery Controller
  const adjustSocialBattery = (val: number) => {
    const next = Math.max(0, Math.min(100, val));
    setSocialBattery(next);

    updateNovaMemoryBySourceAndType(
      'Social Battery Tracker',
      'state',
      {
        content: `User reports social charge level: ${next}%. Relational capacity limits adjusted.`,
        canEdit: false,
        confidence: 'high'
      }
    );
  };

  // 4. Wins Log
  const [newWinText, setNewWinText] = useState('');
  const [newWinCategory, setNewWinCategory] = useState('boundary');
  const submitWin = () => {
    if (!newWinText.trim()) return;
    const item: WinLogData = {
      id: Math.random().toString(),
      timestamp: new Date().toISOString(),
      category: newWinCategory,
      description: newWinText.trim()
    };
    const updated = [item, ...wins];
    saveWins(updated);
    setNewWinText('');

    updateNovaMemoryBySourceAndType(
      'Recovery Wins Ledger',
      'state',
      {
        content: `User verified a functional boundary recovery win: "${item.description}" (${item.category}).`,
        canEdit: true,
        confidence: 'verified'
      }
    );

    onAwardPoints(20, 'Nervous-System Recovery Proof Committed');
  };

  // 5. Body Symptoms
  const SYMPTOM_OPTIONS = [
    { id: 'jaw', name: 'Jaw Clenching / Tension' },
    { id: 'breathing', name: 'Shallow or Suspended Breathing' },
    { id: 'chest', name: 'Tightness in Chest / Hyperventilating feeling' },
    { id: 'shoulders', name: 'Elevated Shoulders / Neck Pain' },
    { id: 'stomach', name: 'Butterflies / Stomach Cramp Nodes' },
    { id: 'head', name: 'Frontal Neural Headaches' },
    { id: 'fidget', name: 'Restless Legs / Hyperactive tapping' },
    { id: 'cold', name: 'Cold Extremities (Hands/Feet)' }
  ];

  const toggleSymptom = (id: string) => {
    let next;
    if (bodySymptoms.includes(id)) {
      next = bodySymptoms.filter(x => x !== id);
    } else {
      next = [...bodySymptoms, id];
    }
    setBodySymptoms(next);

    updateNovaMemoryBySourceAndType(
      'Somatic Indicators',
      'state',
      {
        content: `User logged physical indicators: ${next.length > 0 ? next.join(', ') : 'None'}.`,
        canEdit: false,
        confidence: 'high'
      }
    );
  };

  // 6. Weekly Review
  const [reviewStep, setReviewStep] = useState(0);
  const [reviewAnswers, setReviewAnswers] = useState<Record<string, string>>({
    drain: '',
    support: '',
    unloaded: '',
    boundary: ''
  });

  const submitWeeklyReview = () => {
    const summary = {
      timestamp: new Date().toISOString(),
      ...reviewAnswers
    };
    setWeeklyReview(summary);

    updateNovaMemoryBySourceAndType(
      'Weekly Review',
      'state',
      {
        content: `Weekly Reflection Completed: Drained by [${reviewAnswers.drain}]. Helpful tools: [${reviewAnswers.support}]. Relinquished baggage: [${reviewAnswers.unloaded}]. Targeted boundary for next cycle: [${reviewAnswers.boundary}].`,
        canEdit: false,
        confidence: 'verified'
      }
    );

    onAwardPoints(50, 'Weekly Reflection Completed');
    setReviewStep(0);
  };

  // 7. Return to Work Planner
  const handleRTWPhase = (phase: number) => {
    setRtwPhase(phase);

    let details = "";
    if (phase === 1) details = "Phase 1: Orientation & Discovery. Limit 1 non-essential call.";
    if (phase === 2) details = "Phase 2: Graduated Load Entry. Limit 3 meetings maximum.";
    if (phase === 3) details = "Phase 3: Restored Autonomy. Custom boundary alarm levels.";

    updateNovaMemoryBySourceAndType(
      'Return to Work phased log',
      'state',
      {
        content: `Phased rehabilitation adjustment: ${details}`,
        canEdit: false,
        confidence: 'high'
      }
    );
    onAwardPoints(10, "RTW Roadmap Safety Limit Adjusted");
  };

  // 8. Focus Shield
  const toggleFocusShield = () => {
    const next = !isFocusShieldActive;
    setIsFocusShieldActive(next);

    updateNovaMemoryBySourceAndType(
      'Workspace Focus Shield',
      'state',
      {
        content: `Workspace isolation shield state: ${next ? 'CLOSED / DISCONNECTED' : 'OPEN / EXPOSED'}. Slack telemetry muting active.`,
        canEdit: false,
        confidence: 'high'
      }
    );

    if (next) {
      onAwardPoints(15, "Focus Shield Activated");
    }
  };

  // 9. Recovery Velocity Score Engine
  const getVelocityDetails = () => {
    let score = 50; // Starting baseline
    
    // Impact of mood count
    if (moodLogs.length > 0) {
      const positiveWords = ['good', 'great', 'rested', 'aligned', 'steady', 'calm', 'vibrant', 'stable'];
      const recentMood = moodLogs[0].word.toLowerCase();
      const hasPos = positiveWords.some(w => recentMood.includes(w));
      score += hasPos ? 15 : -10;
    }

    // Impact of triggers
    score -= Math.min(25, triggers.length * 5);

    // Impact of social battery
    if (socialBattery > 60) score += 10;
    if (socialBattery < 30) score -= 15;

    // Wins boost
    score += Math.min(25, wins.length * 8);

    // Body tension depletion
    score -= Math.min(20, bodySymptoms.length * 4);

    // Focus shield protection multiplier
    if (isFocusShieldActive) score += 10;

    // Keep score inside standard bounds
    const finalScore = Math.max(10, Math.min(100, score));
    
    let direction: 'improving' | 'stalling' | 'sliding' = 'stalling';
    if (finalScore >= 70) direction = 'improving';
    else if (finalScore < 45) direction = 'sliding';

    return { score: finalScore, direction };
  };

  const { score: velocityScore, direction: velocityDirection } = getVelocityDetails();

  // Next steps mapping for simple actionability
  const getNextAction = () => {
    if (velocityDirection === 'sliding') return "Try deep boundary breathing resets and lower meeting limits.";
    if (velocityDirection === 'stalling') return "Complete a quick Trigger Journal to identify stress anchors.";
    return "Celebrate stability! Secure one major boundary with Nova Coach.";
  };

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-24" id="recovery_intelligence_hub">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border/40">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/20 text-primary dark:text-primary rounded-2xl flex items-center justify-center shadow-xl shadow-primary/5">
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-primary px-3 py-1 bg-primary/10 rounded-full border border-primary/15">
                Layer 2: Recovery Intelligence Hub
              </span>
              <span className="text-[11px] font-bold text-text-muted flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" /> Feeds Personal Context Brain
              </span>
            </div>
            <h1 className="text-4xl font-display font-black text-text-main tracking-tight mt-2">
              Recovery Signals Suite
            </h1>
            <p className="text-xs text-text-muted mt-1 max-w-xl leading-relaxed">
              Consolidate self-reported body signals, social battery reserves, somatic tension symptoms, and phased workloads to see clear trend indicators.
            </p>
          </div>
        </div>

        {/* Clear Action Prompt (Direct User Intent Align) */}
        <div className="bg-surface/30 px-5 py-4 rounded-2xl border border-border/40 flex items-center gap-4">
          <Award className="w-6 h-6 text-primary" />
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-primary block">Recommended Focus</span>
            <span className="text-xs font-bold text-text-main">{getNextAction()}</span>
          </div>
        </div>
      </div>

      {/* Grid of Signals Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Sidebar Rooms Selection List (9 slots) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-black uppercase tracking-widest text-text-muted  px-2 mb-2">
            Intelligence Rooms
          </div>
          {[
            { id: 'velocity', name: 'Recovery Velocity Score', desc: 'Sustained or slipping profile', pill: 'Indicator' },
            { id: 'mood', name: 'Mood Pulse', desc: '3-second quick mood logs', pill: 'Daily' },
            { id: 'trigger', name: 'Trigger Journal', desc: 'Catalog stress spikes', pill: 'Daily' },
            { id: 'social', name: 'Social Battery Tracker', desc: 'Relational load monitor', pill: 'Daily' },
            { id: 'wins', name: 'Wins & Recovery Proof', desc: 'Visible progress ledger', pill: 'Proof' },
            { id: 'body', name: 'Body Symptom Check-In', desc: 'Somatic distress logs', pill: 'Somatic' },
            { id: 'weekly', name: 'Weekly Review Ritual', desc: 'Recalibrate weekend values', pill: 'Weekly' },
            { id: 'rtw', name: 'Return-to-Work Planner', desc: 'Phased re-entry shields', pill: 'Planner' },
            { id: 'focus', name: 'Focus Shield', desc: 'Mute external noise siphons', pill: 'Protect' }
          ].map(room => (
            <button
              key={room.id}
              onClick={() => setActiveRoom(room.id)}
              className={cn(
                "w-full p-4 rounded-2xl text-left border transition-all flex items-center justify-between group cursor-pointer",
                activeRoom === room.id 
                  ? "bg-text-main text-surface border-text-main shadow-md scale-[1.01]" 
                  : "bg-surface/20 hover:bg-surface/50 text-text-muted hover:text-text-main border-border/45"
              )}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-xs">{room.name}</h4>
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded",
                    activeRoom === room.id 
                      ? "bg-surface/10 text-surface" 
                      : "bg-card text-text-muted"
                  )}>
                    {room.pill}
                  </span>
                </div>
                <p className={cn(
                  "text-xs mt-0.5 font-medium",
                  activeRoom === room.id ? "text-surface/70" : "text-text-muted/70"
                )}>{room.desc}</p>
              </div>
              <ChevronRight className={cn("w-4 h-4 transition-transform", activeRoom === room.id ? "translate-x-1" : "opacity-0 group-hover:opacity-100")} />
            </button>
          ))}
        </div>

        {/* Selected Room Interactive Bay */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            
            {/* 1. Velocity Score */}
            {activeRoom === 'velocity' && (
              <motion.div
                key="velocity"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Control Panel Bar */}
                <div className="bg-card border border-border p-6 sm:p-8 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6" id="derived_intelligence_control_panel">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <LineChart className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-display font-black text-text-main">Server-Derived Recovery Intelligence</h3>
                      <p className="text-xs text-text-muted mt-1">Recalculate deterministic energy, stress, and mood trends from your secure private vault records.</p>
                    </div>
                  </div>

                  <button
                    onClick={handleRecalculate}
                    disabled={recalculating}
                    id="recalculate_trends_button"
                    className={cn(
                      "px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-250 flex items-center gap-2 group shrink-0 cursor-pointer self-start md:self-auto",
                      recalculating
                        ? "bg-text-main/20 text-text-muted/75 cursor-not-allowed"
                        : recalculateSuccess
                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                        : "bg-text-main text-surface hover:scale-[1.02] shadow-lg shadow-text-main/5 active:scale-[0.98]"
                    )}
                  >
                    {recalculating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : recalculateSuccess ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <RefreshCw className="w-4 h-4 transition-transform group-hover:rotate-45" />
                    )}
                    {recalculating ? "Recalculating..." : recalculateSuccess ? "Recalculated!" : "Recalculate Trends"}
                  </button>
                </div>

                {/* Status Feeback Alerts */}
                {recalculateError && (
                  <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl flex items-start gap-3" id="recalculate_error_banner">
                    <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-red-500 block">Calculation Sync Failure</span>
                      <p className="text-xs text-text-muted mt-1 leading-relaxed">{recalculateError}</p>
                    </div>
                  </div>
                )}

                {recalculateSuccess && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl flex items-start gap-4" id="recalculate_success_banner">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-500 block">Recalculation Complete</span>
                      <p className="text-xs text-text-muted mt-0.5 leading-relaxed">Secure indicators refreshed. Vault entries recalculated with 15 XP reward points credited.</p>
                    </div>
                  </div>
                )}

                {/* Intelligence Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="derived_intelligence_cards_grid">
                  {[
                    {
                      id: 'recovery_debt',
                      title: 'Recovery Debt',
                      desc: 'Sustained pressure vs rest offsets',
                      sources: 'Checkins, budgets, mood pulses, somatic inputs, wins, weekly reviews',
                      formulaText: 'Debt Index = Base(50) + Avg Stress × 8 - Avg Energy × 8 + Budget adjustment + Somatic tension factor - Wins factor.'
                    },
                    {
                      id: 'recovery_velocity',
                      title: 'Recovery Velocity',
                      desc: 'Trend rate of boundary and energy recovery progress',
                      sources: 'Checkins, budgets, mood pulses, wins, goals, weekly reviews',
                      formulaText: 'Velocity Index = Base(50) + Mood Influence Factor + Budget adjustment + Wins factor (max +25) + Goals completion weight.'
                    },
                    {
                      id: 'energy_trend',
                      title: 'Energy Trend',
                      desc: 'Moving average of self-reported recovery capacity',
                      sources: 'Checkins, energy budgets',
                      formulaText: 'Energy Index = Average of check-in energy level and budget remaining capacity.'
                    },
                    {
                      id: 'mood_trend',
                      title: 'Mood Trend',
                      desc: 'Sustained mood direction and pressure adaptability',
                      sources: 'Mood pulses, intensity inputs',
                      formulaText: 'Mood Trend Index = Average of mood pulse indications adjusted by self-reported pressure levels.'
                    }
                  ].map(card => {
                    const data = summaries[card.id];
                    const isExpanded = expandedFormula === card.id;

                    return (
                      <div
                        key={card.id}
                        className="bg-card border border-border p-6 sm:p-8 rounded-3xl flex flex-col justify-between space-y-6 transition-all shadow-sm"
                        id={`derived_card_${card.id}`}
                      >
                        {/* Header info */}
                        <div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] uppercase font-black tracking-widest text-text-muted">
                              {card.desc}
                            </span>
                            {data ? (
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                                data.status === 'available'
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  : data.status === 'early_signal'
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                  : "bg-text-main/5 text-text-muted border-border/40"
                              )}>
                                {data.status === 'available' ? 'Analytical Active' : data.status === 'early_signal' ? 'Early Detection' : 'Data Required'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-text-main/5 text-text-muted border border-border/40">
                                Fresh calculation required
                              </span>
                            )}
                          </div>
                          <h4 className="text-xl font-display font-black text-text-main mt-2">
                            {card.title}
                          </h4>
                        </div>

                        {/* Metric Space */}
                        <div className="my-2 py-4 border-y border-border/40 flex items-center justify-between">
                          {data && data.status !== 'not_enough_data' && data.value !== null ? (
                            <div className="flex items-baseline gap-2">
                              <span className="text-4xl sm:text-5xl font-mono font-black tracking-tighter text-text-main">
                                {data.value}%
                              </span>
                              <span className="text-xs font-bold text-text-muted">
                                score index
                              </span>
                            </div>
                          ) : (
                            <div className="text-left py-2">
                              <span className="text-2xl font-mono font-black text-text-muted/60 tracking-wider">
                                INSUFFICIENT
                              </span>
                              <span className="text-[10px] font-bold text-text-muted/50 block mt-0.5">
                                Run manual recalculation
                              </span>
                            </div>
                          )}

                          {data && data.status !== 'not_enough_data' && (
                            <div className="flex flex-col items-end text-right">
                              <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider">
                                {data.direction === 'rising' && (
                                  <span className="text-primary flex items-center gap-1">
                                    <TrendingUp className="w-4 h-4" /> Rising
                                  </span>
                                )}
                                {data.direction === 'falling' && (
                                  <span className="text-amber-500 flex items-center gap-1">
                                    <TrendingDown className="w-4 h-4" /> Falling
                                  </span>
                                )}
                                {data.direction === 'stable' && (
                                  <span className="text-text-muted flex items-center gap-1">
                                    <Check className="w-4 h-4" /> Stable
                                  </span>
                                )}
                                {data.direction === 'unknown' && (
                                  <span className="text-text-muted/60">Unknown</span>
                                )}
                              </div>
                              <span className="text-[10px] font-bold text-text-muted block mt-1">
                                Direction
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Description & metadata */}
                        <div className="space-y-4">
                          <p className="text-xs text-text-muted leading-relaxed font-medium">
                            {data ? data.explanation : "No calculated state found. Trigger a server-side recalculation pass above to process indicators."}
                          </p>

                          {data && (
                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/20 text-[11px]">
                              <div>
                                <span className="font-bold text-text-muted block">Sources Checked:</span>
                                <span className="font-mono text-text-muted/80">{data.sourceCount} records</span>
                              </div>
                              <div>
                                <span className="font-bold text-text-muted block">Confidence Score:</span>
                                <span className="flex items-center gap-1 font-bold text-text-main">
                                  <span className={cn(
                                    "w-2 h-2 rounded-full",
                                    data.confidenceLevel === 'high' ? "bg-emerald-500" : data.confidenceLevel === 'medium' ? "bg-amber-500" : "bg-red-500"
                                  )} />
                                  <span className="capitalize">{data.confidenceLevel}</span>
                                </span>
                              </div>
                            </div>
                          )}

                          {/* How it is calculated */}
                          <div className="pt-2">
                            <button
                              onClick={() => setExpandedFormula(isExpanded ? null : card.id)}
                              className="text-[10px] font-black uppercase tracking-wider text-primary hover:text-primary-hover flex items-center gap-1 cursor-pointer"
                            >
                              <Info className="w-3.5 h-3.5" />
                              {isExpanded ? "Hide calculation model" : "How is this calculated?"}
                            </button>

                            {isExpanded && (
                              <div className="mt-3 p-3 bg-surface rounded-xl border border-border/40 space-y-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">
                                  Formula Definition ({data ? data.formulaVersion : 'v1_nonclinical'})
                                </span>
                                <p className="text-[11px] font-mono leading-relaxed text-text-main/80 select-all">
                                  {card.formulaText}
                                </p>
                                <span className="text-[9px] font-bold text-text-muted block leading-tight">
                                  Strict read-only calculation over client sources: {card.sources}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Secure non-clinical Warning Label */}
                <div className="bg-surface/40 p-5 rounded-2xl border border-border/30 text-center" id="derived_intelligence_medical_disclaimer">
                  <span className="text-[11px] font-bold italic text-text-muted/85 block">
                    “This is a coaching trend indicator based on your self-reported data. It is not a clinical assessment.”
                  </span>
                </div>
              </motion.div>
            )}

            {activeRoom === 'mood' && (
                <motion.div
                  key="mood"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-card border border-border p-6 sm:p-8 rounded-3xl"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <HeartPulse className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-display font-black text-text-main mt-1">Mood Pulse Room</h3>
                      <p className="text-xs text-text-muted mt-1">Add a simple mood check-in to help spot rising pressure.</p>
                    </div>
                  </div>
                  {user ? <ConnectedMoodPulse /> : (
                    <div className="p-4 bg-surface text-xs text-text-muted rounded-xl">Demo mode locked. Authentic users sync securely.</div>
                  )}
                </motion.div>
              )}

              {activeRoom === 'trigger' && (
              <motion.div
                key="trigger"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-surface/10 p-8 rounded-[3.5rem] border border-border/40 space-y-8"
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-primary">Relapse analysis log</span>
                  <h3 className="text-2xl font-display font-black text-text-main mt-1">Stress Trigger Journal</h3>
                  <p className="text-xs text-text-muted mt-1">Identify visual/verbal/structural vectors setting off defense cycles.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4 border-b border-border/20">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold">1. Source of stress trigger:</label>
                      <select
                        value={triggerSource}
                        onChange={e => setTriggerSource(e.target.value)}
                        className="w-full px-4 py-3 border border-border/40 bg-white dark:bg-surface text-xs font-bold rounded-xl"
                      >
                        <option>Meetings</option>
                        <option>People (Colleague/Client)</option>
                        <option>Message / Slack Tone</option>
                        <option>Scope / Deadline creep</option>
                        <option>Time of day (e.g. late night work)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold">2. Trigger Severity Level:</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['low', 'medium', 'high'] as const).map(sev => (
                          <button
                            key={sev}
                            onClick={() => setTriggerSeverity(sev)}
                            className={cn(
                              "py-2 px-3 rounded-lg text-[11px] font-black uppercase tracking-widest border transition-all cursor-pointer",
                              triggerSeverity === sev 
                                ? "bg-destructive/10 border-destructive/50 text-destructive" 
                                : "bg-white dark:bg-surface border-border/20 text-text-muted"
                            )}
                          >
                            {sev}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold">3. Technical details of trigger:</label>
                      <button
                        onClick={toggleRecording}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider transition-all",
                          isRecording 
                            ? "bg-destructive/10 text-destructive border-destructive/30 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse" 
                            : "bg-surface text-text-muted border-border/40 hover:text-text-main"
                        )}
                      >
                        {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                        {isRecording ? "Stop Listening" : "Voice Log"}
                      </button>
                    </div>
                    <textarea
                      value={triggerNotes}
                      onChange={e => setTriggerNotes(e.target.value)}
                      placeholder="e.g. Manager modified scope on Friday at 4 PM without offering extension."
                      rows={4}
                      className="w-full p-4 bg-white dark:bg-surface border border-border/40 rounded-xl text-xs font-semibold"
                    />

                    {(() => {
                      const suggestion = getScriptSuggestion(triggerNotes);
                      if (!suggestion) return null;
                      return (
                        <div className="mt-2 p-3.5 bg-primary/10 border border-primary/20 rounded-xl space-y-2 text-left">
                          <div className="flex items-center gap-1.5 text-[11px] uppercase font-black tracking-widest text-primary">
                            <Sparkles className="w-3.5 h-3.5" /> Nova Coaching: Pattern Recognized
                          </div>
                          <p className="text-[11px] font-bold text-text-main leading-relaxed">
                            We detected a <span className="text-primary">{suggestion.situation}</span> pattern. Here is a recommended rehearsal pushback script:
                          </p>
                          <div className="p-3 bg-card/40 rounded-lg border border-white/5 font-mono text-xs text-primary-light select-all leading-relaxed whitespace-pre-wrap">
                            {suggestion.script}
                          </div>
                          <p className="text-[11px] text-text-muted italic">
                            💡 Nova Advice: {suggestion.advice}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <button
                  onClick={submitTrigger}
                  className="w-full py-4 bg-destructive hover:bg-destructive-foreground hover:bg-opacity-90 text-destructive-foreground text-xs uppercase font-black tracking-widest rounded-xl transition-all hover:scale-[1.01] cursor-pointer"
                >
                  Record Trigger Insight (+15 pts)
                </button>

                {triggers.length > 0 && (
                  <div className="space-y-3">
                    <span className="text-xs font-black uppercase text-text-muted tracking-wider">Trigger history logs</span>
                    <div className="space-y-2">
                      {triggers.slice(0, 3).map(tr => {
                        const s = getScriptSuggestion(tr.notes);
                        return (
                          <div key={tr.id} className="p-4 bg-surface/40 rounded-xl border border-border/40 flex flex-col gap-3">
                            <div className="flex items-start justify-between w-full">
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-destructive mr-2">{tr.source}</span>
                                <span className="text-[10px] font-mono font-black border border-destructive/20 px-2 py-0.5 rounded bg-destructive/5 text-destructive uppercase">{tr.severity}</span>
                                <p className="text-xs font-bold text-text-main mt-1.5">"{tr.notes}"</p>
                              </div>
                            </div>
                            {s && (
                              <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-1.5 text-left w-full">
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary leading-none">Suggested Boundary Script</span>
                                <p className="text-xs font-mono text-primary-light bg-card/30 p-2.5 rounded border border-white/5 mt-1 select-all">{s.script}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* 4. Social Battery */}
            {activeRoom === 'social' && (
              <motion.div
                key="social"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-surface/10 p-8 rounded-[3.5rem] border border-border/40 space-y-8"
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-primary">Relational energy manager</span>
                  <h3 className="text-2xl font-display font-black text-text-main mt-1">Social Battery Tracker</h3>
                  <p className="text-xs text-text-muted mt-1">Dismantle relational burnout. Identify people overload and map recovery gaps.</p>
                </div>

                <div className="bg-surface dark:bg-surface p-6 rounded-2xl border border-border/40 text-center space-y-6">
                  <div className="text-6xl font-display font-black text-primary">{socialBattery}%</div>
                  
                  <div className="space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-text-muted">Manually calibrating capacity scale:</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={socialBattery}
                      onChange={e => adjustSocialBattery(parseInt(e.target.value, 10))}
                      className="w-full cursor-pointer accent-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => adjustSocialBattery(socialBattery - 15)}
                      className="py-3 bg-destructive/5 hover:bg-destructive/10 border border-destructive/20 text-destructive text-xs font-black uppercase rounded-xl transition-all"
                    >
                      Drained by meeting (-15%)
                    </button>
                    <button
                      onClick={() => adjustSocialBattery(socialBattery + 15)}
                      className="py-3 bg-success/5 hover:bg-success/10 border border-success/20 text-success text-xs font-black uppercase rounded-xl transition-all"
                    >
                      Restoring conversation (+15%)
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-text-muted leading-relaxed">
                    Social battery drops below 40% activate warning boundaries. Nova automatically marks incoming group sync invites as <span className="text-primary font-bold">low priority</span> in your active load list.
                  </p>
                </div>
              </motion.div>
            )}

            {/* 5. Wins & Proof */}
            {activeRoom === 'wins' && (
                <motion.div
                  key="wins"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-card border border-border p-6 sm:p-8 rounded-3xl"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-warning/20 text-warning flex items-center justify-center shrink-0">
                      <Star className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-display font-black text-text-main mt-1">Triumphs & Wins</h3>
                      <p className="text-xs text-text-muted mt-1">Anchor neuroplasticity by logging successful stress boundaries.</p>
                    </div>
                  </div>
                  {user ? <ConnectedWinsLog /> : (
                    <div className="p-4 bg-surface text-xs text-text-muted rounded-xl">Demo mode locked. Authentic users sync securely.</div>
                  )}
                </motion.div>
              )}

              {activeRoom === 'body' && (
                <motion.div
                  key="body"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-card border border-border p-6 sm:p-8 rounded-3xl"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <Wind className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-display font-black text-text-main mt-1">Somatic Symptom Check-In</h3>
                      <p className="text-xs text-text-muted mt-1">Check for physical tension indicators before logical admittance.</p>
                    </div>
                  </div>
                  {user ? <ConnectedBodyCheckIn /> : (
                    <div className="p-4 bg-surface text-xs text-text-muted rounded-xl">Demo mode locked. Authentic users sync securely.</div>
                  )}
                </motion.div>
              )}

              {activeRoom === 'weekly' && (
              <motion.div
                key="weekly"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-surface/10 p-8 rounded-[3.5rem] border border-border/40 space-y-8"
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-primary">Rhythm calibration ritual</span>
                  <h3 className="text-2xl font-display font-black text-text-main mt-1">Weekly Review Ritual</h3>
                  <p className="text-xs text-text-muted mt-1">Consolidate chaotic data streams into clear architectural wisdom.</p>
                </div>

                {weeklyReview ? (
                  <div className="space-y-6">
                    <div className="bg-success/5 border border-success/20 p-6 rounded-2xl">
                      <h4 className="text-sm font-bold text-text-main">Weekly Review Completed</h4>
                      <div className="space-y-4 mt-4 text-xs">
                        <div>
                          <span className="text-text-muted uppercase font-black text-[11px]">Root Drain Identified:</span>
                          <p className="font-bold text-text-main mt-0.5">"{weeklyReview.drain}"</p>
                        </div>
                        <div>
                          <span className="text-text-muted uppercase font-black text-[11px]">Protected Boundary:</span>
                          <p className="font-bold text-primary mt-0.5">"{weeklyReview.boundary}"</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setWeeklyReview(null)}
                      className="w-full py-3 border border-border/30 rounded-xl text-xs font-bold text-text-muted hover:text-text-main cursor-pointer"
                    >
                      Start New Reflection Cycle
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Multistage questionnaire simulated */}
                    {reviewStep === 0 && (
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-text-main">What drained you most this week?</label>
                        <textarea
                          value={reviewAnswers.drain}
                          onChange={e => setReviewAnswers(prev => ({ ...prev, drain: e.target.value }))}
                          placeholder="Colleague constant slack threads or long client calls..."
                          rows={3}
                          className="w-full p-4 bg-white dark:bg-surface border border-border/40 rounded-xl text-xs font-semibold"
                        />
                      </div>
                    )}

                    {reviewStep === 1 && (
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-text-main">What boundary should be defended next week?</label>
                        <textarea
                          value={reviewAnswers.boundary}
                          onChange={e => setReviewAnswers(prev => ({ ...prev, boundary: e.target.value }))}
                          placeholder="Refuse all meetings before 10 AM to secure focus time."
                          rows={3}
                          className="w-full p-4 bg-white dark:bg-surface border border-border/40 rounded-xl text-xs font-semibold"
                        />
                      </div>
                    )}

                    {reviewStep === 2 && (
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-text-main">What are you carrying that you should drop immediately?</label>
                        <textarea
                          value={reviewAnswers.unloaded}
                          onChange={e => setReviewAnswers(prev => ({ ...prev, unloaded: e.target.value }))}
                          placeholder="Drop the non-critical report optimization proposal."
                          rows={3}
                          className="w-full p-4 bg-white dark:bg-surface border border-border/40 rounded-xl text-xs font-semibold"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-border/20">
                      <button
                        onClick={() => setReviewStep(prev => Math.max(0, prev - 1))}
                        disabled={reviewStep === 0}
                        className="px-4 py-2 border border-border rounded-xl text-xs font-bold"
                      >
                        Back
                      </button>
                      {reviewStep < 2 ? (
                        <button
                          onClick={() => setReviewStep(prev => prev + 1)}
                          className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          Next Step <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={submitWeeklyReview}
                          className="px-8 py-2 bg-success text-white rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Commit Reflection (+50 pts)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* 7. Return to Work */}
            {activeRoom === 'rtw' && (
              <motion.div
                key="rtw"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-surface/10 p-8 rounded-[3.5rem] border border-border/40 space-y-8"
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-primary">Professional re-entry protective layout</span>
                  <h3 className="text-2xl font-display font-black text-text-main mt-1">Return-to-Work Planner</h3>
                  <p className="text-xs text-text-muted mt-1">Configure phased boundaries when returning from leave or high stress absence.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { ph: 1, name: 'Phase 1: Orientation', desc: 'Limit calls strictly to 1 daily.' },
                    { ph: 2, name: 'Phase 2: Graduated', desc: 'Ceiling at 3 sync structures.' },
                    { ph: 3, name: 'Phase 3: Autonomy', desc: 'Full custom boundary sets.' }
                  ].map(phase => (
                    <button
                      key={phase.ph}
                      onClick={() => handleRTWPhase(phase.ph)}
                      className={cn(
                        "p-4 rounded-xl border text-left flex flex-col justify-between space-y-2 cursor-pointer transition-all",
                        rtwPhase === phase.ph 
                          ? "bg-primary/10 border-primary/50 text-primary scale-[1.01]" 
                          : "bg-white dark:bg-surface border-border/20 text-text-muted"
                      )}
                    >
                      <span className="text-xs font-bold">{phase.name}</span>
                      <p className="text-xs leading-relaxed ">{phase.desc}</p>
                    </button>
                  ))}
                </div>

                {/* Phased re-entry config */}
                <div className="space-y-4 p-6 bg-surface dark:bg-surface rounded-2xl border border-border/40">
                  <h4 className="text-xs font-black uppercase tracking-wider text-text-muted">Direct manager copy-script generator</h4>
                  <div className="p-4 bg-white dark:bg-card rounded-xl text-xs font-semibold leading-relaxed border border-border/20 italic text-text-muted dark:text-text-muted">
                    {rtwPhase === 1 ? (
                      `“Hi team, as I reintegrate back from recovery leave this week, I am managing my daily cognitive energy budget systematically. Nova has flagged a tight meeting limit of 1 call today to secure orientation space. Will connect offline later.”`
                    ) : (
                      `“To align with sustainable workload capacity targets and prevent stress loops, my profile is restricted to 3 active meeting allocations today. Let’s collaborate on critical topics asynchronously wherever possible.”`
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* 8. Focus Shield */}
            {activeRoom === 'focus' && (
              <motion.div
                key="focus"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-surface/10 p-8 rounded-[3.5rem] border border-border/40 space-y-8"
              >
                <div>
                  <span className="text-xs font-black uppercase tracking-widest text-primary">Workspace deep block protector</span>
                  <h3 className="text-2xl font-display font-black text-text-main mt-1">Focus Shield Isolation</h3>
                  <p className="text-xs text-text-muted mt-1">Mute notification siphons during work hours to protect reserves.</p>
                </div>

                <div className="p-8 bg-surface dark:bg-surface rounded-3xl border border-border/40 flex flex-col items-center text-center space-y-6">
                  <div className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg",
                    isFocusShieldActive ? "bg-success animate-pulse text-white shadow-success/20" : "bg-border dark:bg-card text-text-muted"
                  )}>
                    <Zap className="w-8 h-8" />
                  </div>

                  <div>
                    <h4 className="text-lg font-bold text-text-main">
                      {isFocusShieldActive ? "Focus Shield Engaged • All Drains Blocked" : "Focus Shield Disengaged"}
                    </h4>
                    <p className="text-xs text-text-muted mt-1 max-w-sm">
                      Mutes calendar prompts and overrides non-urgent workspace notifications to allow 90-minute uninterrupted sprints.
                    </p>
                  </div>

                  <button
                    onClick={toggleFocusShield}
                    className={cn(
                      "px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer transition-all hover:scale-[1.02] active:scale-95 shadow-md",
                      isFocusShieldActive ? "bg-destructive text-destructive-foreground shadow-rose-500/10" : "bg-primary text-primary-foreground shadow-primary/10"
                    )}
                  >
                    {isFocusShieldActive ? "Disengage Shield" : "Activate Focus Shield (+15 pts)"}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </div>
    </div>
  );
};
