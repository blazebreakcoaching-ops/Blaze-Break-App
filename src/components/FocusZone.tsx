import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Target, 
  Clock, 
  Play, 
  Square, 
  Volume2, 
  VolumeX, 
  Compass, 
  Sparkles, 
  Brain, 
  CheckCircle, 
  AlertTriangle, 
  X,
  RefreshCw,
  Heart
} from 'lucide-react';
import { cn } from '../lib/utils';

// Ambient Synthesizer using Web Audio API
class FocusSynthEngine {
  private ctx: AudioContext | null = null;
  private oscL: OscillatorNode | null = null;
  private oscR: OscillatorNode | null = null;
  private gainL: GainNode | null = null;
  private gainR: GainNode | null = null;
  private noiseNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private lfo: OscillatorNode | null = null;
  private masterGain: GainNode | null = null;

  startBinauralBeats(freq: number = 140, beatFreq: number = 6) {
    this.stop();
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.15, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    // Left Ear
    const pannerL = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pannerL) pannerL.pan.value = -1;
    this.oscL = ctx.createOscillator();
    this.oscL.frequency.value = freq;
    this.gainL = ctx.createGain();
    this.gainL.gain.value = 0.5;

    // Right Ear
    const pannerR = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pannerR) pannerR.pan.value = 1;
    this.oscR = ctx.createOscillator();
    this.oscR.frequency.value = freq + beatFreq;
    this.gainR = ctx.createGain();
    this.gainR.gain.value = 0.5;

    // Connect Left
    if (pannerL) {
      this.oscL.connect(this.gainL).connect(pannerL).connect(this.masterGain);
    } else {
      this.oscL.connect(this.gainL).connect(this.masterGain);
    }

    // Connect Right
    if (pannerR) {
      this.oscR.connect(this.gainR).connect(pannerR).connect(this.masterGain);
    } else {
      this.oscR.connect(this.gainR).connect(this.masterGain);
    }

    this.oscL.start();
    this.oscR.start();
  }

  startOceanRain() {
    this.stop();
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.2, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    // Generate White Noise
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter white noise to sound like gentle rain/ocean waves
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 1;

    // LFO to create waving ocean/wind sweeps
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.08; // Very slow, 12 seconds per wave
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 400; // Frequency variance

    this.lfo.connect(lfoGain);
    // Base frequency 500Hz, modulated by LFO
    this.filter.frequency.value = 500;
    lfoGain.connect(this.filter.frequency);

    whiteNoise.connect(this.filter).connect(this.masterGain);

    this.lfo.start();
    whiteNoise.start();
    (this as any).noiseSource = whiteNoise;
  }

  startDeepDrone() {
    this.stop();
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.12, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    // Warm Analog Drone chords (Fm9 or similar low frequency root)
    const roots = [87.31, 130.81, 174.61, 220.00]; // F2, C3, F3, A3
    roots.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.value = 0.25;

      // Slow pan modulation for immersive field
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = (Math.random() * 2 - 1) * 0.5;
        osc.connect(gain).connect(panner).connect(this.masterGain!);
      } else {
        osc.connect(gain).connect(this.masterGain!);
      }

      osc.start();
      this.droneOscs.push(osc);
    });
  }

  stop() {
    try {
      if (this.oscL) { this.oscL.stop(); this.oscL.disconnect(); }
      if (this.oscR) { this.oscR.stop(); this.oscR.disconnect(); }
      if ((this as any).noiseSource) { (this as any).noiseSource.stop(); (this as any).noiseSource.disconnect(); }
      if (this.lfo) { this.lfo.stop(); this.lfo.disconnect(); }
      this.droneOscs.forEach(o => { o.stop(); o.disconnect(); });
      this.droneOscs = [];
      if (this.ctx) {
        this.ctx.close();
        this.ctx = null;
      }
    } catch (e) {
      console.warn("Synth shutdown warning", e);
    }
  }
}

interface FocusZoneProps {
  onAwardPoints: (amount: number, reason: string) => void;
  isFocusActive: boolean;
  setIsFocusActive: (active: boolean) => void;
  currentShipStage?: string;
}

export function FocusZone({ onAwardPoints, isFocusActive, setIsFocusActive, currentShipStage = "Habits" }: FocusZoneProps) {
  const [duration, setDuration] = useState<number>(25); // minutes
  const [timeLeft, setTimeLeft] = useState<number>(25 * 60); // seconds
  const [soundMode, setSoundMode] = useState<'none' | 'binaural' | 'ocean' | 'drone'>('none');
  const [isMuted, setIsMuted] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [quitInterceptOpen, setQuitInterceptOpen] = useState(false);

  // Breathing Box Guide state
  const [breathPhase, setBreathPhase] = useState<'In' | 'Hold1' | 'Out' | 'Hold2'>('In');
  const [breathCount, setBreathCount] = useState(4);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const synthRef = useRef<FocusSynthEngine | null>(null);

  // Initialize synth engine once
  useEffect(() => {
    synthRef.current = new FocusSynthEngine();
    return () => {
      if (synthRef.current) synthRef.current.stop();
    };
  }, []);

  // Sync Timer countdown when active
  useEffect(() => {
    if (isFocusActive && timeLeft > 0 && !sessionCompleted) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleCompleteSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isFocusActive, timeLeft, sessionCompleted]);

  // Sync Breathing pattern helper
  useEffect(() => {
    if (!isFocusActive || sessionCompleted) return;
    const interval = setInterval(() => {
      setBreathCount((prev) => {
        if (prev <= 1) {
          // Switch phase
          setBreathPhase((current) => {
            switch (current) {
              case 'In': return 'Hold1';
              case 'Hold1': return 'Out';
              case 'Out': return 'Hold2';
              case 'Hold2': return 'In';
            }
          });
          return 4; // 4 second box
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isFocusActive, sessionCompleted]);

  // Manage Live Synthesizer Audio playback
  useEffect(() => {
    if (!synthRef.current) return;
    if (!isFocusActive || isMuted || sessionCompleted) {
      synthRef.current.stop();
      return;
    }

    switch (soundMode) {
      case 'binaural':
        synthRef.current.startBinauralBeats(145, 8); // 8Hz Alpha waves
        break;
      case 'ocean':
        synthRef.current.startOceanRain();
        break;
      case 'drone':
        synthRef.current.startDeepDrone();
        break;
      case 'none':
        synthRef.current.stop();
        break;
    }
  }, [isFocusActive, soundMode, isMuted, sessionCompleted]);

  const handleStartSession = () => {
    setTimeLeft(duration * 60);
    setSessionCompleted(false);
    setIsFocusActive(true);
    setQuitInterceptOpen(false);
    // Request full lockout
    localStorage.setItem("blaze_lockout_active", "true");
  };

  const handleCompleteSession = () => {
    if (synthRef.current) synthRef.current.stop();
    setSessionCompleted(true);
    setIsFocusActive(false);
    localStorage.removeItem("blaze_lockout_active");

    // Play synthesized visual chime or gong!
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, audioCtx.currentTime); // 528Hz Solfeggio Repair frequency!
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 3);
    } catch (e) {}

    // Save success metric to local storage
    const focusHistory = JSON.parse(localStorage.getItem("blaze_focus_blocks_history") || "[]");
    focusHistory.unshift({
      date: new Date().toISOString(),
      durationMinutes: duration,
      completed: true,
      stage: currentShipStage
    });
    localStorage.setItem("blaze_focus_blocks_history", JSON.stringify(focusHistory));

    // Update Nova's Memory
    const prevMemory = JSON.parse(localStorage.getItem("blaze_nova_memories") || "[]");
    const updatedMemory = [
      {
        id: "focus-" + Date.now(),
        source: "Focus Zone Engine",
        type: "state",
        content: `User successfully completed a ${duration}-minute deep work block inside the ${currentShipStage} stage, demonstrating deliberate focus protection.`,
        confidence: "verified",
        timestamp: new Date().toISOString(),
        canEdit: false
      },
      ...prevMemory
    ];
    localStorage.setItem("blaze_nova_memories", JSON.stringify(updatedMemory));

    onAwardPoints(100, `${duration}-Minute Deep Work Focus Zone Complete`);
  };

  const handleCancelRequest = () => {
    setQuitInterceptOpen(true);
  };

  const confirmQuit = () => {
    if (synthRef.current) synthRef.current.stop();
    setIsFocusActive(false);
    localStorage.removeItem("blaze_lockout_active");
    setQuitInterceptOpen(false);

    // Log the incomplete block
    const focusHistory = JSON.parse(localStorage.getItem("blaze_focus_blocks_history") || "[]");
    focusHistory.unshift({
      date: new Date().toISOString(),
      durationMinutes: duration,
      completed: false,
      stage: currentShipStage
    });
    localStorage.setItem("blaze_focus_blocks_history", JSON.stringify(focusHistory));
  };

  // Convert seconds to digital display
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Breathing Visual Classes & Texts
  const getBreathingTip = () => {
    switch (breathPhase) {
      case 'In': return { title: 'Breathe In', scale: 1.4, color: 'text-primary' };
      case 'Hold1': return { title: 'Hold Breath', scale: 1.4, color: 'text-warning' };
      case 'Out': return { title: 'Breathe Out', scale: 1.0, color: 'text-success' };
      case 'Hold2': return { title: 'Hold Breath', scale: 1.0, color: 'text-warning' };
    }
  };

  const breathingDetails = getBreathingTip();

  return (
    <div className="font-sans">
      {/* 1. Dashboard Preview Card */}
      {!isFocusActive && !sessionCompleted && (
        <div className="card bg-card border border-border rounded-[2rem] p-8 md:p-10 shadow-2xl relative overflow-hidden text-left">
          <div className="absolute top-0 right-0 w-72 h-72 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shadow-inner">
                <Target className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-display font-black text-text-main tracking-tight">Nova Focus Zone</h3>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text-muted mt-0.5">Deep Focus & Recovery Mode</p>
              </div>
            </div>

            <p className="text-sm text-text-muted leading-relaxed font-medium">
              Over-givers and high achievers burn 40% more energy due to unsolicited context-switching and fawning behaviors. Lock out non-essential apps for a tactical deep work block to repair mental reserves.
            </p>

            {/* Config Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Set Block Duration</span>
                <div className="grid grid-cols-3 gap-2">
                  {[15, 25, 50].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => {
                        setDuration(mins);
                        setTimeLeft(mins * 60);
                      }}
                      className={cn(
                        "py-3 rounded-xl text-xs font-black transition-all cursor-pointer border",
                        duration === mins 
                          ? "bg-primary border-primary text-primary-foreground shadow-lg" 
                          : "bg-surface hover:bg-card border-border text-text-muted"
                      )}
                    >
                      {mins} Min
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Calming Audio Shield</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'none', label: 'Absolute Silence' },
                    { id: 'binaural', label: '8Hz Binaural (Alpha)' },
                    { id: 'ocean', label: 'Solfeggio Ocean Rain' },
                    { id: 'drone', label: 'Sub-harmonic Drone' }
                  ].map((track) => (
                    <button
                      key={track.id}
                      onClick={() => setSoundMode(track.id as any)}
                      className={cn(
                        "py-2.5 px-2 rounded-xl text-[10px] font-black transition-all cursor-pointer border text-center leading-snug",
                        soundMode === track.id 
                          ? "bg-primary/10 border-primary/40 text-primary" 
                          : "bg-surface hover:bg-card border-border/80 text-text-muted"
                      )}
                    >
                      {track.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleStartSession}
              className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2 cursor-pointer mt-4"
            >
              <Play className="w-4 h-4 fill-primary-foreground/20" />
              Enter Deep Focus Zone & Lock Apps
            </button>
          </div>
        </div>
      )}

      {/* 2. Fullscreen Active Focus State (The lock out screen) */}
      <AnimatePresence>
        {isFocusActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#070b13] z-[999] flex flex-col justify-between p-8 sm:p-12 md:p-16 text-center select-none overflow-hidden"
          >
            {/* Ambient Animated moving glow shapes */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse pointer-events-none" style={{ animationDuration: '8s' }} />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-success/15 rounded-full blur-[120px] animate-pulse pointer-events-none" style={{ animationDuration: '12s' }} />
            
            {/* Star particles generator */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-thread.png')] opacity-20 pointer-events-none" />

            {/* Top Row - Status and Controls */}
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary animate-spin" style={{ animationDuration: '10s' }}>
                  <Brain className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary font-mono block">Nova Focus Fortress Active</span>
                  <span className="text-xs text-text-muted font-bold">Non-essential app actions locked out</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white transition-all cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleCancelRequest}
                  className="p-3 bg-danger/10 hover:bg-danger/20 border border-danger/25 text-danger rounded-xl transition-all flex items-center gap-2 text-xs font-black uppercase tracking-widest cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  Break Focus
                </button>
              </div>
            </div>

            {/* Center Focus Wheel & Timer */}
            <div className="relative z-10 flex flex-col items-center justify-center space-y-12 my-auto">
              {/* Dynamic Breathing Sphere Indicator */}
              <div className="relative w-64 h-64 flex items-center justify-center">
                {/* Secondary expanding visual ripples */}
                <motion.div 
                  animate={{ scale: breathingDetails.scale, opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
                  className="absolute inset-0 rounded-full border border-primary/10 bg-primary/5 blur-[2px]" 
                />
                <motion.div 
                  animate={{ scale: breathingDetails.scale - 0.15, opacity: [0.1, 0.4, 0.1] }}
                  transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, delay: 0.5 }}
                  className="absolute inset-4 rounded-full border border-success/15 bg-success/5 blur-[1px]" 
                />

                <div className="w-44 h-44 rounded-full bg-slate-900/90 border border-border/80 shadow-2xl flex flex-col items-center justify-center space-y-1 relative z-10">
                  <span className="text-4xl font-mono font-black text-white tracking-tight">
                    {formatTime(timeLeft)}
                  </span>
                  <span className="text-[9px] uppercase font-black text-text-muted tracking-widest">
                    Remaining
                  </span>
                </div>
              </div>

              {/* Box Breathing instructions */}
              <div className="space-y-2">
                <motion.span 
                  key={breathPhase}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn("text-xl font-display font-black uppercase tracking-widest", breathingDetails.color)}
                >
                  {breathingDetails.title}
                </motion.span>
                <p className="text-xs text-text-muted font-bold font-mono">
                  Somatic Recalibration: {breathCount} seconds remaining
                </p>
              </div>
            </div>

            {/* Bottom Row - Nova Metacognitive Encouragement */}
            <div className="relative z-10 max-w-xl mx-auto p-6 bg-white/5 border border-white/10 rounded-2xl flex gap-4 items-center text-left backdrop-blur-md">
              <Sparkles className="w-6 h-6 text-primary shrink-0 animate-spin" style={{ animationDuration: '8s' }} />
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-primary font-mono block">Nova Real-Time Companion</span>
                <p className="text-xs text-text-muted font-bold leading-relaxed mt-1">
                  "You are protecting your cognitive budget. Your worth is not measured by the speed of your Slack replies. Breathe, focus on this single stream, and let the chaos fade."
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Quit Intercept Interstitial */}
      <AnimatePresence>
        {quitInterceptOpen && (
          <div className="fixed inset-0 bg-black/80 z-[1000] flex items-center justify-center p-6 backdrop-blur-xl">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-card border border-border p-8 rounded-3xl shadow-2xl space-y-6 text-left relative overflow-hidden"
            >
              {/* Caution background */}
              <div className="absolute top-0 right-0 w-44 h-44 bg-danger/10 rounded-full blur-[50px] pointer-events-none" />

              <div className="flex items-center gap-4 border-b border-border pb-4">
                <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger">
                  <AlertTriangle className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-text-main uppercase tracking-wider">Nova Coach Check-In</h4>
                  <p className="text-[10px] text-text-muted font-bold">Unplanned Context Swap Detected</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-text-main">
                  "Are you sure you want to let the chaos win?"
                </p>
                <p className="text-xs text-text-muted leading-relaxed font-semibold">
                  Yielding to instant gratification triggers loops of cortisol loading. You completed a fraction of your target block. Nova requests you to take one deep breath before deciding.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setQuitInterceptOpen(false)}
                  className="py-3 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest text-center cursor-pointer"
                >
                  Stay in Zone
                </button>
                <button
                  onClick={confirmQuit}
                  className="py-3 bg-surface hover:bg-card border border-border text-danger rounded-xl text-xs font-black uppercase tracking-widest text-center cursor-pointer"
                >
                  Abandon Block
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Victory State Screen */}
      <AnimatePresence>
        {sessionCompleted && (
          <div className="fixed inset-0 bg-[#070b13]/95 z-[999] flex items-center justify-center p-6 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="max-w-md w-full bg-card border border-primary/25 p-8 rounded-[2.5rem] shadow-[0_20px_50px_rgba(99,102,241,0.2)] text-center space-y-6 relative overflow-hidden"
            >
              <div className="absolute -top-12 -left-12 w-44 h-44 bg-success/15 rounded-full blur-[60px]" />
              <div className="absolute -bottom-12 -right-12 w-44 h-44 bg-primary/10 rounded-full blur-[60px]" />

              <div className="relative z-10 flex flex-col items-center space-y-4">
                <div className="w-16 h-16 bg-success/20 border border-success/40 rounded-3xl flex items-center justify-center text-success relative">
                  <Sparkles className="w-8 h-8 animate-spin" style={{ animationDuration: '4s' }} />
                  <CheckCircle className="w-4 h-4 text-white bg-success rounded-full absolute -bottom-1 -right-1" />
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-success font-mono">Focus Session Complete</span>
                  <h4 className="text-2xl font-serif font-black text-text-main">Fortress Defended</h4>
                </div>

                <p className="text-xs text-text-muted leading-relaxed font-semibold max-w-sm">
                  You successfully preserved {duration} minutes of high cognitive bandwidth. Nova has recorded this as a peak stability achievement and synchronized it with your recovery index.
                </p>

                {/* Reward breakdown */}
                <div className="w-full bg-surface border border-border rounded-2xl p-4 flex justify-between text-left items-center">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Gained Reward</span>
                    <span className="text-sm font-bold text-text-main">+100 Recovery Points</span>
                  </div>
                  <div className="px-3 py-1 bg-success/15 border border-success/25 rounded-lg text-success text-[10px] font-mono font-black uppercase tracking-wider">
                    Laser Focus Badge
                  </div>
                </div>

                <button
                  onClick={() => setSessionCompleted(false)}
                  className="w-full py-4 bg-primary hover:bg-primary/95 text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-lg"
                >
                  Return to Recovery Hub
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
