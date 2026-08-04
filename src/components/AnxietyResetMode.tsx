import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, Sparkles, Clock, ArrowRight, ArrowLeft,
  CheckCircle2, ShieldCheck, HeartPulse, Trash2
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';

interface AnxietyResetModeProps {
  onAwardPoints: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
}

const TRIGGERS = [
  { id: 'racing_thoughts', label: 'Racing thoughts' },
  { id: 'chest_tightness', label: 'Chest tightness' },
  { id: 'cant_switch_off', label: "Can't switch off" },
  { id: 'work_dread', label: 'Work dread' },
  { id: 'fear_bad_happening', label: 'Fear something bad will happen' },
  { id: 'overthinking_decision', label: 'Overthinking a decision' },
  { id: 'social_anxiety', label: 'Social anxiety' },
  { id: 'panic_feeling', label: 'Panic feeling' },
  { id: 'sleep_anxiety', label: 'Sleep anxiety' },
  { id: 'general_overwhelm', label: "I don't know, I just feel overwhelmed" }
];

const TOOLS = [
  { id: 'calm_90s', name: '90-Second Calm Reset', description: 'A fast, ambient countdown to bring your focus back to the present moment.', duration: 90 },
  { id: 'grounding_54321', name: '5-4-3-2-1 Grounding', description: 'Engage your five senses to anchor your mind during a nervous spike.', duration: 120 },
  { id: 'breathing_pacer', name: 'Breathing Pacer', description: 'Somatic pacing to slow down physical arousal and heartbeat.', duration: 60 },
  { id: 'worry_dump', name: 'Worry Dump & Release', description: 'Write down every chaotic thought, then vaporize it into negative space.', duration: 150 },
  { id: 'fear_vs_fact', name: 'Fear vs. Fact Filter', description: 'Deconstruct panic narratives by pairing anxious assumptions with solid reality.', duration: 180 },
  { id: 'one_step', name: 'One Controllable Step', description: 'Filter out future anxieties and commit to exactly one immediate tiny action.', duration: 90 },
  { id: 'nova_script', name: "Nova's Calm Grounding Script", description: "Analytical, direct guidance from Nova to restore executive control.", duration: 120 },
  { id: 'tension_release', name: 'Body Tension Release', description: 'Progressive muscle relaxation to dump stored somatic stress.', duration: 120 }
];

export const AnxietyResetMode = ({ onAwardPoints, onNavigate }: AnxietyResetModeProps) => {
  const { user } = useAuth();
  const [step, setStep] = useState<'intro' | 'trigger' | 'intensity_before' | 'tool_selection' | 'active_tool' | 'intensity_after' | 'nova_feedback'>('intro');
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [intensityBefore, setIntensityBefore] = useState<number>(5);
  const [recommendedToolId, setRecommendedToolId] = useState<string>('calm_90s');
  const [selectedToolId, setSelectedToolId] = useState<string>('calm_90s');
  const [intensityAfter, setIntensityAfter] = useState<number>(5);
  const [userNote, setUserNote] = useState<string>('');
  
  // Specific tool states
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [groundingStep, setGroundingStep] = useState(1);
  const [groundingInputs, setGroundingInputs] = useState<string[]>(['', '', '', '', '']);
  const [worryText, setWorryText] = useState('');
  const [isWorryReleased, setIsWorryReleased] = useState(false);
  const [fearsList, setFearsList] = useState<{ fear: string; fact: string }[]>([{ fear: '', fact: '' }]);
  const [oneAction, setOneAction] = useState('');
  const [tensionGroup, setTensionGroup] = useState(0);
  
  // Breath pacer states
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale' | 'holdExhale'>('inhale');
  const [breathCounter, setBreathCounter] = useState(4);

  const activeTool = TOOLS.find(t => t.id === selectedToolId) || TOOLS[0];

  // Auto-recommend a tool based on selected trigger
  useEffect(() => {
    if (!selectedTrigger) return;
    if (selectedTrigger === 'panic_feeling' || selectedTrigger === 'general_overwhelm') {
      setRecommendedToolId('grounding_54321');
      setSelectedToolId('grounding_54321');
    } else if (selectedTrigger === 'chest_tightness' || selectedTrigger === 'cant_switch_off') {
      setRecommendedToolId('breathing_pacer');
      setSelectedToolId('breathing_pacer');
    } else if (selectedTrigger === 'racing_thoughts' || selectedTrigger === 'overthinking_decision') {
      setRecommendedToolId('worry_dump');
      setSelectedToolId('worry_dump');
    } else if (selectedTrigger === 'fear_bad_happening') {
      setRecommendedToolId('fear_vs_fact');
      setSelectedToolId('fear_vs_fact');
    } else if (selectedTrigger === 'work_dread') {
      setRecommendedToolId('one_step');
      setSelectedToolId('one_step');
    } else {
      setRecommendedToolId('calm_90s');
      setSelectedToolId('calm_90s');
    }
  }, [selectedTrigger]);

  // Breathing pacer loop
  useEffect(() => {
    if (step !== 'active_tool' || selectedToolId !== 'breathing_pacer') return;
    const interval = setInterval(() => {
      setBreathCounter((prev) => {
        if (prev <= 1) {
          if (breathPhase === 'inhale') {
            setBreathPhase('hold');
            return 4;
          } else if (breathPhase === 'hold') {
            setBreathPhase('exhale');
            return 4;
          } else if (breathPhase === 'exhale') {
            setBreathPhase('holdExhale');
            return 4;
          } else {
            setBreathPhase('inhale');
            return 4;
          }
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, selectedToolId, breathPhase]);

  // General Timer for Countdown tools
  useEffect(() => {
    if (step !== 'active_tool' || !isTimerRunning) return;
    if (timerSeconds <= 0) {
      setIsTimerRunning(false);
      handleCompleteTool();
      return;
    }
    const t = setTimeout(() => {
      setTimerSeconds(timerSeconds - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [timerSeconds, isTimerRunning, step]);

  const startTool = () => {
    setTimerSeconds(activeTool.duration);
    setIsTimerRunning(true);
    setGroundingStep(1);
    setGroundingInputs(['', '', '', '', '']);
    setWorryText('');
    setIsWorryReleased(false);
    setFearsList([{ fear: '', fact: '' }]);
    setOneAction('');
    setTensionGroup(0);
    setStep('active_tool');
  };

  const handleCompleteTool = () => {
    setIsTimerRunning(false);
    setStep('intensity_after');
  };

  // Save Anxiety reset event privately in firestore
  const handleSaveResetEvent = async () => {
    // Determine safety level based on after intensity and trigger
    let safetyLevel: 'normal_support' | 'heightened_anxiety' | 'panic_level' | 'possible_crisis' | 'immediate_danger' = 'normal_support';
    if (intensityBefore >= 9) {
      safetyLevel = 'panic_level';
    } else if (intensityAfter >= 7) {
      safetyLevel = 'heightened_anxiety';
    }

    const eventPayload = {
      userId: user?.uid || 'anonymous_local_user',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      mode: 'anxiety_reset',
      triggerType: selectedTrigger || 'unknown',
      intensityBefore,
      intensityAfter,
      selectedTool: selectedToolId,
      completed: true,
      durationSeconds: activeTool.duration - (selectedToolId === 'calm_90s' || selectedToolId === 'breathing_pacer' ? timerSeconds : 0),
      userNote: userNote || worryText || oneAction || 'Anxiety reset tool completed.',
      novaFollowUpShown: true,
      followUpActionId: selectedToolId === 'one_step' ? 'commit_to_action' : 'stabilize_baseline',
      safetyLevel,
      createdAt: new Date().toISOString()
    };

    // 1. Dual-write backup to localStorage
    try {
      const localResets = JSON.parse(localStorage.getItem('blaze_anxiety_resets') || '[]');
      localResets.push(eventPayload);
      localStorage.setItem('blaze_anxiety_resets', JSON.stringify(localResets));
    } catch (localErr) {
      console.error("Failed to write somatic backup to localStorage:", localErr);
    }

    // 2. Award engagement points
    try {
      onAwardPoints(50, `Completed ${activeTool.name} Reset`);
    } catch (ptsErr) {
      console.error("Points callback failed:", ptsErr);
    }

    // 3. Persist to Firestore if user is authenticated
    if (user) {
      try {
        const eventsRef = collection(db, 'anxiety_reset_events');
        await addDoc(eventsRef, {
          ...eventPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Update recovery intelligence index in user derived stats
        const statsRef = doc(db, 'users', user.uid, 'derived', 'stats');
        const statsSnap = await getDoc(statsRef);
        let points = 50;
        if (statsSnap.exists()) {
          points = (statsSnap.data().points || 0) + 50;
        }
        await setDoc(statsRef, {
          points,
          lastAnxietyReset: new Date().toISOString(),
          updatedAt: serverTimestamp()
        }, { merge: true });

      } catch (err) {
        console.error("Error saving anxiety reset event to Firestore:", err);
      }
    }

    setStep('nova_feedback');
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 sm:p-10 text-left relative overflow-hidden transition-all max-w-4xl mx-auto">
      
      <AnimatePresence mode="wait">
        
        {/* Intro view */}
        {step === 'intro' && (
          <motion.div 
            key="intro"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl flex items-center justify-center">
                <HeartPulse className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="font-display text-2xl font-semibold text-text-main tracking-tight">Anxiety & Overwhelm Reset</h3>
                <span className="text-xs uppercase tracking-widest text-destructive font-bold">Grounded in clinical anxiety-support techniques</span>
              </div>
            </div>

            <p className="text-sm text-text-muted leading-relaxed">
              For moments when racing thoughts, tight chest, panic, or work dread start taking over your nervous system. 
              We are not diagnosing or treating medical conditions. This is a secure handrail to stabilize your body 
              and de-escalate acute mental fatigue in real time.
            </p>

            <div className="border border-destructive/20 bg-destructive/5 rounded-2xl p-4 flex gap-3 items-start">
              <ShieldCheck className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-text-muted leading-normal">
                <strong className="text-text-main">Safety Boundary:</strong> This tool supports moments of high anxiety, 
                dread, or somatic panic. It is not a clinical replacement for therapy, GAD diagnosis, or emergency care. 
                All logs are encrypted, completely confidential, and never shared with B2B organizations.
              </div>
            </div>

            <div className="pt-4">
              <button 
                onClick={() => setStep('trigger')}
                className="w-full sm:w-auto px-8 py-4.5 bg-destructive hover:opacity-90 text-destructive-foreground font-bold uppercase tracking-widest text-xs rounded-2xl transition-all shadow-lg shadow-destructive/10 flex items-center justify-center gap-3"
              >
                Start Calm Reset <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Trigger choice */}
        {step === 'trigger' && (
          <motion.div 
            key="trigger"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive">Step 1 of 5</span>
              <h4 className="font-display text-xl font-medium text-text-main mt-1">What's happening in your body or mind right now?</h4>
              <p className="text-xs text-text-muted mt-1">Naming the trigger helps disarm the amygdala's automatic panic cycle.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TRIGGERS.map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTrigger(t.id);
                    setStep('intensity_before');
                  }}
                  className={`p-4 text-left rounded-2xl border text-sm font-medium transition-all ${
                    selectedTrigger === t.id 
                      ? 'bg-destructive/10 border-destructive text-text-main' 
                      : 'bg-surface/50 border-white/[0.04] text-text-muted hover:border-destructive/30 hover:text-text-main'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button 
              onClick={() => setStep('intro')}
              className="text-xs text-text-muted hover:text-text-main transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Intro
            </button>
          </motion.div>
        )}

        {/* Intensity Before */}
        {step === 'intensity_before' && (
          <motion.div 
            key="intensity_before"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 text-center py-4"
          >
            <div className="text-left">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive">Step 2 of 5</span>
              <h4 className="font-display text-xl font-medium text-text-main mt-1">Rate the current distress level</h4>
              <p className="text-xs text-text-muted mt-1">A simple scale to anchor where your nervous system is baseline.</p>
            </div>

            <div className="py-6">
              <span className="text-6xl font-light text-text-main">{intensityBefore}</span>
              <span className="text-text-muted text-lg">/10</span>
              <div className="mt-2 text-xs uppercase tracking-widest font-bold text-destructive">
                {intensityBefore <= 3 ? 'Mild Tension' : intensityBefore <= 6 ? 'Moderate Stress / Dread' : intensityBefore <= 8 ? 'High Anxiety / Racing' : 'Acute Overwhelm / Panic'}
              </div>
            </div>

            <div className="px-4">
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={intensityBefore}
                onChange={(e) => setIntensityBefore(Number(e.target.value))}
                className="w-full accent-destructive cursor-pointer h-2 bg-border rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-text-muted font-bold uppercase mt-2">
                <span>1 - Barely Noticeable</span>
                <span>5 - Hard to Focus</span>
                <span>10 - Total Crisis</span>
              </div>
            </div>

            <div className="pt-6 text-left flex justify-between items-center">
              <button 
                onClick={() => setStep('trigger')}
                className="text-xs text-text-muted hover:text-text-main transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Change Trigger
              </button>
              <button 
                onClick={() => setStep('tool_selection')}
                className="px-6 py-3 bg-destructive hover:opacity-90 text-destructive-foreground font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-md"
              >
                Analyze & Match Reset Tool
              </button>
            </div>
          </motion.div>
        )}

        {/* Tool Selection */}
        {step === 'tool_selection' && (
          <motion.div 
            key="tool_selection"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive">Step 3 of 5</span>
              <h4 className="font-display text-xl font-medium text-text-main mt-1">Select your de-escalation tool</h4>
              <p className="text-xs text-text-muted mt-1">We matched tools to counter your current physiological trigger.</p>
            </div>

            {/* Recommended Tool Hero */}
            <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 bg-destructive/10 border border-destructive/30 text-destructive text-[9px] font-bold uppercase tracking-wider rounded-full">
                  Recommended
                </span>
                <h5 className="text-lg font-bold text-text-main">
                  {TOOLS.find(t => t.id === recommendedToolId)?.name}
                </h5>
                <p className="text-xs text-text-muted leading-relaxed">
                  {TOOLS.find(t => t.id === recommendedToolId)?.description}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedToolId(recommendedToolId);
                  startTool();
                }}
                className="px-6 py-3 shrink-0 bg-destructive hover:opacity-90 text-destructive-foreground font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-md flex items-center gap-2"
              >
                Start Now <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Other tools option */}
            <div className="space-y-3">
              <h6 className="text-xs uppercase tracking-widest text-text-muted font-bold">Alternative somatosensory tools</h6>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TOOLS.filter(t => t.id !== recommendedToolId).map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedToolId(t.id);
                      startTool();
                    }}
                    className="p-4 text-left rounded-xl bg-surface/40 border border-white/[0.04] hover:border-destructive/30 transition-all flex justify-between items-center group"
                  >
                    <div>
                      <div className="text-sm font-bold text-text-main group-hover:text-destructive transition-colors">{t.name}</div>
                      <div className="text-[11px] text-text-muted line-clamp-1">{t.description}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-destructive shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={() => setStep('intensity_before')}
              className="text-xs text-text-muted hover:text-text-main transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Intensity
            </button>
          </motion.div>
        )}

        {/* Active Reset Tool */}
        {step === 'active_tool' && (
          <motion.div 
            key="active_tool"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8 py-4 min-h-[380px] flex flex-col justify-between"
          >
            <div className="flex justify-between items-center border-b border-white/[0.03] pb-4">
              <div>
                <h4 className="font-display text-lg font-medium text-text-main">{activeTool.name}</h4>
                <p className="text-xs text-text-muted">Stay here until the arousal spikes begin to taper.</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono font-bold text-destructive">
                  {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
                </span>
                <span className="text-[10px] text-text-muted block font-bold uppercase tracking-widest">Est. time remaining</span>
              </div>
            </div>

            {/* Tool specific inner renderers */}
            <div className="flex-1 flex flex-col justify-center py-6">
              
              {/* Tool 1: 90-Second Calm Reset */}
              {selectedToolId === 'calm_90s' && (
                <div className="space-y-6 text-center max-w-md mx-auto">
                  <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="72" cy="72" r="64" stroke="rgba(255,255,255,0.02)" strokeWidth="6" fill="transparent" />
                      <circle cx="72" cy="72" r="64" stroke="#ef4444" strokeWidth="6" fill="transparent" 
                        strokeDasharray={402}
                        strokeDashoffset={402 - (402 * timerSeconds) / 90}
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <Clock className="w-8 h-8 text-destructive animate-pulse" />
                      <span className="text-2xl font-mono text-text-main mt-1">{timerSeconds}s</span>
                    </div>
                  </div>
                  <p className="text-sm text-text-muted italic leading-relaxed">
                    {timerSeconds > 70 ? 'Inhale deeply. Notice the safe, solid boundaries of the space you are in.' :
                     timerSeconds > 45 ? 'Let your shoulders drop 2 inches. Release any fawning response to external demands.' :
                     timerSeconds > 20 ? 'Nothing is required of you right now. We are not fixing the whole problem, just calming the nerve.' :
                     'You are crossing the threshold into baseline stability. Breathe slowly.'}
                  </p>
                </div>
              )}

              {/* Tool 2: 5-4-3-2-1 Grounding */}
              {selectedToolId === 'grounding_54321' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3, 4, 5].map(s => (
                      <div key={s} className={`h-1.5 w-12 rounded-full transition-all ${groundingStep >= s ? 'bg-destructive' : 'bg-white/10'}`} />
                    ))}
                  </div>

                  <div className="space-y-4 max-w-lg mx-auto">
                    {groundingStep === 1 && (
                      <div className="text-center space-y-4">
                        <span className="text-3xl font-bold text-destructive block">5</span>
                        <h5 className="font-bold text-text-main text-base">Things you can SEE in your immediate environment</h5>
                        <p className="text-xs text-text-muted">Acknowledge them silently or list them here to focus your sight.</p>
                        <input 
                          type="text"
                          value={groundingInputs[0]}
                          onChange={(e) => {
                            const newInputs = [...groundingInputs];
                            newInputs[0] = e.target.value;
                            setGroundingInputs(newInputs);
                          }}
                          placeholder="Type or name 5 visual shapes..."
                          className="w-full bg-surface/50 border border-border p-3 rounded-xl text-sm"
                        />
                      </div>
                    )}

                    {groundingStep === 2 && (
                      <div className="text-center space-y-4">
                        <span className="text-3xl font-bold text-destructive block">4</span>
                        <h5 className="font-bold text-text-main text-base">Things you can physically FEEL</h5>
                        <p className="text-xs text-text-muted">Feet flat on floor, texture of your desk, weight of your body, air temperature.</p>
                        <input 
                          type="text"
                          value={groundingInputs[1]}
                          onChange={(e) => {
                            const newInputs = [...groundingInputs];
                            newInputs[1] = e.target.value;
                            setGroundingInputs(newInputs);
                          }}
                          placeholder="Type or name 4 tactile sensations..."
                          className="w-full bg-surface/50 border border-border p-3 rounded-xl text-sm"
                        />
                      </div>
                    )}

                    {groundingStep === 3 && (
                      <div className="text-center space-y-4">
                        <span className="text-3xl font-bold text-destructive block">3</span>
                        <h5 className="font-bold text-text-main text-base">Things you can HEAR</h5>
                        <p className="text-xs text-text-muted">Traffic, computer fan hum, distant voices, wind outside.</p>
                        <input 
                          type="text"
                          value={groundingInputs[2]}
                          onChange={(e) => {
                            const newInputs = [...groundingInputs];
                            newInputs[2] = e.target.value;
                            setGroundingInputs(newInputs);
                          }}
                          placeholder="Type or name 3 ambient sounds..."
                          className="w-full bg-surface/50 border border-border p-3 rounded-xl text-sm"
                        />
                      </div>
                    )}

                    {groundingStep === 4 && (
                      <div className="text-center space-y-4">
                        <span className="text-3xl font-bold text-destructive block">2</span>
                        <h5 className="font-bold text-text-main text-base">Things you can SMELL</h5>
                        <p className="text-xs text-text-muted">Coffee, clean laundry, woody notes, fresh air.</p>
                        <input 
                          type="text"
                          value={groundingInputs[3]}
                          onChange={(e) => {
                            const newInputs = [...groundingInputs];
                            newInputs[3] = e.target.value;
                            setGroundingInputs(newInputs);
                          }}
                          placeholder="Type or name 2 olfactory signals..."
                          className="w-full bg-surface/50 border border-border p-3 rounded-xl text-sm"
                        />
                      </div>
                    )}

                    {groundingStep === 5 && (
                      <div className="text-center space-y-4">
                        <span className="text-3xl font-bold text-destructive block">1</span>
                        <h5 className="font-bold text-text-main text-base">Thing you can TASTE</h5>
                        <p className="text-xs text-text-muted">Toothpaste, glass of water, faint coffee, mint.</p>
                        <input 
                          type="text"
                          value={groundingInputs[4]}
                          onChange={(e) => {
                            const newInputs = [...groundingInputs];
                            newInputs[4] = e.target.value;
                            setGroundingInputs(newInputs);
                          }}
                          placeholder="Type or name 1 taste signal..."
                          className="w-full bg-surface/50 border border-border p-3 rounded-xl text-sm"
                        />
                      </div>
                    )}

                    <div className="pt-4 flex justify-between">
                      <button
                        disabled={groundingStep <= 1}
                        onClick={() => setGroundingStep(groundingStep - 1)}
                        className="px-4 py-2 text-xs bg-white/5 hover:bg-white/10 rounded-lg text-text-muted hover:text-text-main disabled:opacity-30 transition-all"
                      >
                        Prev Sensation
                      </button>
                      {groundingStep < 5 ? (
                        <button
                          onClick={() => setGroundingStep(groundingStep + 1)}
                          className="px-4 py-2 text-xs bg-destructive hover:opacity-90 text-destructive-foreground font-bold rounded-lg transition-all"
                        >
                          Next Sensation
                        </button>
                      ) : (
                        <button
                          onClick={handleCompleteTool}
                          className="px-6 py-2 text-xs bg-success hover:opacity-90 text-success-foreground font-bold rounded-lg transition-all"
                        >
                          Done Grounding
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tool 3: Breathing Pacer */}
              {selectedToolId === 'breathing_pacer' && (
                <div className="space-y-6 text-center max-w-sm mx-auto">
                  <div className="relative w-44 h-44 mx-auto flex items-center justify-center">
                    <motion.div
                      animate={{
                        scale: breathPhase === 'inhale' ? 1.6 : breathPhase === 'hold' ? 1.6 : breathPhase === 'exhale' ? 0.9 : 0.9,
                        backgroundColor: breathPhase === 'inhale' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)'
                      }}
                      transition={{ duration: 4, ease: "easeInOut" }}
                      className="absolute w-24 h-24 rounded-full border border-destructive/30 flex items-center justify-center"
                    />
                    <div className="relative z-10 flex flex-col items-center">
                      <span className="text-xl font-bold text-text-main capitalize">{breathPhase}</span>
                      <span className="text-3xl font-mono font-bold text-destructive mt-1">{breathCounter}</span>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted uppercase tracking-widest font-black">
                    {breathPhase === 'inhale' ? 'Breathe in, slow and full' : 
                     breathPhase === 'hold' ? 'Hold gently' : 
                     breathPhase === 'exhale' ? 'Let it all the way out' : 
                     'Rest before the next breath'}
                  </div>
                </div>
              )}

              {/* Tool 4: Worry Dump */}
              {selectedToolId === 'worry_dump' && (
                <div className="space-y-4 max-w-lg mx-auto w-full">
                  <h5 className="text-sm font-bold text-text-main">Worry Dump (Brain Offloader)</h5>
                  <p className="text-xs text-text-muted">Pour every single anxious scenario, racing task, or work fear here. No formatting. Just dump it.</p>
                  
                  <AnimatePresence mode="wait">
                    {!isWorryReleased ? (
                      <motion.div key="dump_area" className="space-y-4">
                        <textarea
                          rows={5}
                          value={worryText}
                          onChange={(e) => setWorryText(e.target.value)}
                          placeholder="I am stressing about..."
                          className="w-full bg-surface/50 border border-border p-4 rounded-xl text-sm focus:border-destructive focus:outline-none text-text-main"
                        />
                        <button
                          disabled={!worryText.trim()}
                          onClick={() => {
                            setIsWorryReleased(true);
                            onAwardPoints(15, "Worry Dump Cleared");
                          }}
                          className="w-full px-5 py-3 bg-destructive hover:opacity-90 text-destructive-foreground font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" /> Vaporize Chaos & Move On
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="dump_success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-8 space-y-4 bg-success/5 border border-success/20 p-6 rounded-2xl"
                      >
                        <CheckCircle2 className="w-10 h-10 text-success mx-auto" />
                        <h6 className="font-bold text-text-main text-base">Anxious energy dumped into negative space</h6>
                        <p className="text-xs text-text-muted max-w-md mx-auto">
                          It is off your shoulders. We do not have to carry or fix any of this right now. You have done enough.
                        </p>
                        <button
                          onClick={handleCompleteTool}
                          className="px-6 py-2.5 bg-success hover:opacity-90 text-success-foreground font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
                        >
                          Next: Re-Evaluate Baseline
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Tool 5: Fear vs Fact */}
              {selectedToolId === 'fear_vs_fact' && (
                <div className="space-y-4 max-w-xl mx-auto w-full">
                  <h5 className="text-sm font-bold text-text-main">Fear vs. Fact Filter</h5>
                  <p className="text-xs text-text-muted">Type your high-anxiety scenario, then force yourself to write a factual baseline statement.</p>

                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {fearsList.map((f, idx) => (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-white/[0.03] pb-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-destructive font-bold uppercase tracking-wider">The Fear Loop</label>
                          <input 
                            type="text"
                            value={f.fear}
                            onChange={(e) => {
                              const newList = [...fearsList];
                              newList[idx].fear = e.target.value;
                              setFearsList(newList);
                            }}
                            placeholder="What if I miss this deadline..."
                            className="w-full bg-surface/50 border border-border p-2.5 rounded-xl text-xs text-text-main"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-success font-bold uppercase tracking-wider">The Factual Reality</label>
                          <input 
                            type="text"
                            value={f.fact}
                            onChange={(e) => {
                              const newList = [...fearsList];
                              newList[idx].fact = e.target.value;
                              setFearsList(newList);
                            }}
                            placeholder="I have backup options..."
                            className="w-full bg-surface/50 border border-border p-2.5 rounded-xl text-xs text-text-main"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 justify-between pt-2">
                    <button
                      onClick={() => setFearsList([...fearsList, { fear: '', fact: '' }])}
                      className="px-4 py-2 text-xs bg-white/5 hover:bg-white/10 rounded-lg text-text-muted hover:text-text-main transition-all"
                    >
                      + Add Another Scenario
                    </button>
                    <button
                      onClick={handleCompleteTool}
                      className="px-6 py-2.5 bg-destructive hover:opacity-90 text-destructive-foreground font-bold text-xs uppercase tracking-widest rounded-xl transition-all"
                    >
                      Fact Filter Checked
                    </button>
                  </div>
                </div>
              )}

              {/* Tool 6: One Controllable Step */}
              {selectedToolId === 'one_step' && (
                <div className="space-y-4 max-w-md mx-auto w-full text-center">
                  <span className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center text-destructive mx-auto">
                    <Activity className="w-6 h-6 animate-pulse" />
                  </span>
                  <h5 className="font-bold text-text-main text-base">One Tiny Controllable Step</h5>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Anxiety wants us to solve things 6 months in advance. We can't. 
                    What is exactly ONE tiny step you can take in the next 15 minutes that is 100% within your immediate physical control?
                  </p>
                  <input 
                    type="text"
                    value={oneAction}
                    onChange={(e) => setOneAction(e.target.value)}
                    placeholder="e.g., Send a 1-sentence delay email / Drink a glass of water..."
                    className="w-full bg-surface/50 border border-border p-4 rounded-xl text-sm text-center text-text-main focus:border-destructive"
                  />
                  <div className="pt-4">
                    <button
                      disabled={!oneAction.trim()}
                      onClick={handleCompleteTool}
                      className="px-6 py-3 bg-destructive hover:opacity-90 text-destructive-foreground font-bold uppercase tracking-widest text-xs rounded-xl transition-all"
                    >
                      Commit to This Step
                    </button>
                  </div>
                </div>
              )}

              {/* Tool 7: Nova Grounding Script */}
              {selectedToolId === 'nova_script' && (
                <div className="space-y-6 max-w-lg mx-auto w-full">
                  <div className="bg-destructive/5 border border-destructive/20 p-5 rounded-2xl flex gap-3 items-start">
                    <Sparkles className="w-5 h-5 text-destructive shrink-0 mt-1" />
                    <div className="space-y-3">
                      <strong className="text-sm font-semibold text-text-main block">Nova's Direct Nervous Restoring Anchor</strong>
                      <p className="text-xs text-text-muted leading-relaxed font-serif italic">
                        "You are safe enough for the next two minutes. We are not solving your whole life right now. We are helping your body come down one level."
                      </p>
                      <p className="text-xs text-text-muted leading-relaxed font-serif italic">
                        "Notice the ground supporting your weight. That is a concrete physical fact. Notice your breathing. It does not have to be perfect or calm; it just has to be present."
                      </p>
                      <p className="text-xs text-text-muted leading-relaxed font-serif italic">
                        "The dread or panic you're feeling right now is a signal, not a fact about what's actually going to happen. You don't have to believe every thought your body sends you while it's stressed."
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleCompleteTool}
                      className="px-6 py-3 bg-destructive hover:opacity-90 text-destructive-foreground font-bold uppercase tracking-widest text-xs rounded-xl transition-all"
                    >
                      Proceed to Integration
                    </button>
                  </div>
                </div>
              )}

              {/* Tool 8: Tension Release */}
              {selectedToolId === 'tension_release' && (
                <div className="space-y-6 max-w-md mx-auto w-full">
                  <div className="text-center space-y-1">
                    <h5 className="font-bold text-text-main text-base">Progressive Muscle Release</h5>
                    <p className="text-xs text-text-muted">Squeeze the active muscle group tightly for 5 seconds, then completely let go.</p>
                  </div>

                  <div className="bg-surface p-6 rounded-2xl border border-white/[0.03] space-y-4">
                    {tensionGroup === 0 && (
                      <div className="text-center space-y-2">
                        <span className="text-[10px] uppercase font-bold text-destructive">Muscle Group 1 of 4</span>
                        <h6 className="font-bold text-text-main text-sm">Squeeze your fists & arms</h6>
                        <p className="text-xs text-text-muted">Tighten your fists, squeeze your biceps, clamp your forearms. Hold for 5 seconds... Now release completely.</p>
                      </div>
                    )}
                    {tensionGroup === 1 && (
                      <div className="text-center space-y-2">
                        <span className="text-[10px] uppercase font-bold text-destructive">Muscle Group 2 of 4</span>
                        <h6 className="font-bold text-text-main text-sm">Shoulders & Neck</h6>
                        <p className="text-xs text-text-muted">Pull your shoulders all the way up to your ears. Clamp down. Hold... Now drop them completely. Let them sink.</p>
                      </div>
                    )}
                    {tensionGroup === 2 && (
                      <div className="text-center space-y-2">
                        <span className="text-[10px] uppercase font-bold text-destructive">Muscle Group 3 of 4</span>
                        <h6 className="font-bold text-text-main text-sm">Jaw & Face</h6>
                        <p className="text-xs text-text-muted">Clench your jaw, scrunch your nose, squeeze your eyes shut. Hold tight... Now release, letting your mouth drop slightly open.</p>
                      </div>
                    )}
                    {tensionGroup === 3 && (
                      <div className="text-center space-y-2">
                        <span className="text-[10px] uppercase font-bold text-destructive">Muscle Group 4 of 4</span>
                        <h6 className="font-bold text-text-main text-sm">Feet & Legs</h6>
                        <p className="text-xs text-text-muted">Curl your toes, tighten your calves, squeeze your thighs. Press flat down. Hold... Release and let everything dissolve into the floor.</p>
                      </div>
                    )}

                    <div className="flex justify-between pt-2">
                      <button
                        disabled={tensionGroup <= 0}
                        onClick={() => setTensionGroup(tensionGroup - 1)}
                        className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded text-text-muted hover:text-text-main transition-all disabled:opacity-30"
                      >
                        Prev Group
                      </button>
                      {tensionGroup < 3 ? (
                        <button
                          onClick={() => setTensionGroup(tensionGroup + 1)}
                          className="px-4 py-1.5 text-xs bg-destructive hover:opacity-90 text-destructive-foreground font-bold rounded transition-all"
                        >
                          Next Group
                        </button>
                      ) : (
                        <button
                          onClick={handleCompleteTool}
                          className="px-5 py-1.5 text-xs bg-success hover:opacity-90 text-success-foreground font-bold rounded transition-all"
                        >
                          Done PMR Reset
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>

            <div className="pt-4 flex justify-between items-center border-t border-white/[0.03]">
              <button 
                onClick={() => setStep('tool_selection')}
                className="text-xs text-text-muted hover:text-text-main transition-colors"
              >
                Exit
              </button>
              <button 
                onClick={handleCompleteTool}
                className="px-5 py-2.5 bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 rounded-xl text-xs uppercase tracking-widest font-black transition-all"
              >
                Skip / Finish Reset Early
              </button>
            </div>
          </motion.div>
        )}

        {/* Intensity After */}
        {step === 'intensity_after' && (
          <motion.div 
            key="intensity_after"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 text-center py-4"
          >
            <div className="text-left">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive">Step 4 of 5</span>
              <h4 className="font-display text-xl font-medium text-text-main mt-1">Rate your intensity now</h4>
              <p className="text-xs text-text-muted mt-1">Check back in. Has your heart rate or mental spinning shifted at all?</p>
            </div>

            <div className="py-6">
              <span className="text-6xl font-light text-text-main">{intensityAfter}</span>
              <span className="text-text-muted text-lg">/10</span>
              <div className="mt-2 text-xs uppercase tracking-widest font-bold text-success">
                {intensityAfter <= 3 ? 'Stabilized' : intensityAfter <= 5 ? 'Manageable Tension' : 'Heightened (Consider repeat cycle)'}
              </div>
            </div>

            <div className="px-4">
              <input 
                type="range" 
                min="1" 
                max="10" 
                value={intensityAfter}
                onChange={(e) => setIntensityAfter(Number(e.target.value))}
                className="w-full accent-success cursor-pointer h-2 bg-border rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] text-text-muted font-bold uppercase mt-2">
                <span>1 - Grounded</span>
                <span>5 - Alert but Stable</span>
                <span>10 - Acute Panic</span>
              </div>
            </div>

            <div className="space-y-3 pt-4 text-left">
              <label className="text-xs uppercase tracking-widest text-text-muted font-bold block">Private Notes (Encrypted Trigger Journal)</label>
              <input 
                type="text"
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                placeholder="Briefly name the specific thought or context if you want to log the pattern..."
                className="w-full bg-surface/50 border border-border p-3.5 rounded-xl text-sm focus:border-destructive text-text-main"
              />
            </div>

            <div className="pt-6 text-left flex justify-end">
              <button 
                onClick={handleSaveResetEvent}
                className="px-8 py-4.5 bg-success hover:opacity-90 text-success-foreground font-bold uppercase tracking-widest text-xs rounded-2xl transition-all shadow-lg"
              >
                Log Reset & Fetch Nova Aftercare
              </button>
            </div>
          </motion.div>
        )}

        {/* Nova aftercare and feedback */}
        {step === 'nova_feedback' && (
          <motion.div 
            key="nova_feedback"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-success/10 border border-success/20 text-success rounded-2xl flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-text-main tracking-tight">De-escalation Stabilized</h3>
                <span className="text-xs uppercase tracking-widest text-success font-bold">Secure baseline restored (+50 points earned)</span>
              </div>
            </div>

            <div className="p-5 bg-surface rounded-2xl border border-white/[0.04] space-y-3">
              <strong className="text-xs uppercase tracking-widest text-destructive font-bold block">Nova's Strategic Aftercare Action</strong>
              <p className="text-sm text-text-main leading-relaxed italic">
                "Excellent. You reduced your intensity from {intensityBefore}/10 to {intensityAfter}/10. 
                That is measurable autonomic work. Your thoughts did not define reality; you intervened and patched the leak."
              </p>
              <p className="text-sm text-text-muted leading-relaxed">
                <strong className="text-text-main">Your Tiny Action:</strong> {oneAction || 'Slow down physical tasks for the next 20 minutes. Give your inbox a break while your body settles.'}
              </p>
              <p className="text-xs text-text-muted leading-relaxed italic">
                "We saved this event securely. Over time, we will help you map exactly what triggers these spikes—whether it is Sunday evening meetings or poor sleep debt. Your recovery score is stabilizing."
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button 
                onClick={() => setStep('intro')}
                className="flex-1 px-6 py-4 bg-white/5 border border-white/[0.04] hover:bg-white/10 text-text-main font-bold text-xs uppercase tracking-widest rounded-2xl transition-all text-center"
              >
                Done / Back to Reset Home
              </button>
              {onNavigate && (
                <button 
                  onClick={() => onNavigate('nova')}
                  className="flex-1 px-6 py-4 bg-destructive hover:opacity-90 text-destructive-foreground font-bold text-xs uppercase tracking-widest rounded-2xl transition-all text-center shadow-lg shadow-destructive/10"
                >
                  Consult Nova on this trigger
                </button>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};
