import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wind, Brain, Moon, Zap, Waves, Play, Pause, Activity, RefreshCw, Eye, Ear, UserCircle, MapPin, Minimize2, Clock, Volume2, VolumeX, Music, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface NervousSystemResetProps {
  fingerprint: BurnoutFingerprint | null;
}

type Section = 'breathwork' | 'grounding';
type BreathingMode = 'box' | '478' | 'coherent' | 'sigh' | 'extended' | 'rectangle' | 'calm';
type GroundingMode = '60sec' | '5things' | 'scan' | 'feet' | 'sound' | 'room' | 'timer';
type Needs = 'calm' | 'clarity' | 'sleep' | 'focus' | 'release' | null;

const BREATHING_MODES: Record<BreathingMode, { name: string; description: string; instruction: string; cycleMs: number; icon: any }> = {
  box: { name: 'Box Breathing', description: 'Steady focus. Balances the nervous system.', instruction: 'Inhale 4s • Hold 4s • Exhale 4s • Hold 4s', cycleMs: 16000, icon: RefreshCw },
  '478': { name: '4-7-8 Breathing', description: 'Evening wind-down. Prepares body for sleep.', instruction: 'Inhale 4s • Hold 7s • Exhale 8s', cycleMs: 19000, icon: Moon },
  coherent: { name: 'Coherent Breathing', description: 'Calm rhythm. Aligns heart rate and breathing.', instruction: 'Inhale 5s • Exhale 5s', cycleMs: 10000, icon: Waves },
  sigh: { name: 'Physiological Sigh', description: 'Quick reset. Offloads carbon dioxide immediately.', instruction: 'Double Inhale • Long Exhale', cycleMs: 8000, icon: Wind },
  extended: { name: 'Extended Exhale', description: 'Downshifting stress. Triggers parasympathetic response.', instruction: 'Inhale 4s • Exhale 6s', cycleMs: 10000, icon: Activity },
  rectangle: { name: 'Rectangle Breathing', description: 'Visual breathing tool for grounding.', instruction: 'Inhale short side • Exhale long side', cycleMs: 12000, icon: RefreshCw },
  calm: { name: 'Calm Count', description: 'Simple beginner version. Gentle regulation.', instruction: 'Inhale 1-2-3 • Exhale 1-2-3', cycleMs: 6000, icon: Brain },
};

const NEEDS_MAPPING: Record<NonNullable<Needs>, BreathingMode> = {
  calm: 'coherent',
  clarity: 'box',
  sleep: '478',
  focus: 'rectangle',
  release: 'sigh',
};

const GROUNDING_MODES: Record<GroundingMode, { name: string; description: string; instructions: string[]; icon: any }> = {
  '60sec': { name: '60-Second Grounding', description: 'Fast recalibration of your surroundings.', instructions: ['Look around', 'Name 1 thing you see', 'Name 1 thing you hear', 'Name 1 thing you feel', 'Take 1 deep breath'], icon: Clock },
  '5things': { name: 'Name 5 Things', description: 'Classic grounding when mentally overloaded.', instructions: ['Name 5 things you can see', 'Name 4 things you can feel', 'Name 3 things you can hear', 'Name 2 things you can smell', 'Name 1 thing you can taste'], icon: Eye },
  'scan': { name: 'Body Scan', description: 'Progressive awareness of physical tension.', instructions: ['Notice your toes', 'Move attention up to your calves', 'Notice your thighs and hips', 'Feel your stomach and chest', 'Release your shoulders and jaw'], icon: UserCircle },
  'feet': { name: 'Feet-on-Floor', description: 'Tethering technique for panicky feelings.', instructions: ['Place both feet flat on the ground', 'Press down gently through your heels', 'Notice the solid floor beneath you', 'Imagine roots growing from your feet', 'Breathe steadily'], icon: Activity },
  'sound': { name: 'Sound-Based Grounding', description: 'Auditory focus to stop racing thoughts.', instructions: ['Close your eyes', 'Listen for the loudest sound', 'Listen for the quietest sound', 'Listen for a sound inside the room', 'Listen for a sound outside the room'], icon: Ear },
  'room': { name: 'Come Back to the Room', description: 'Spatial awareness recovery.', instructions: ['Find a corner of the room', 'Trace the lines of the ceiling', 'Notice the colors of the walls', 'Count the windows', 'Acknowledge you are safe here'], icon: MapPin },
  'timer': { name: 'Calm Visual Timer', description: 'A soothing focus anchor.', instructions: ['Watch the shape expand and contract', 'Let your thoughts drift past', 'Keep your eyes on the center point', 'Allow 2 minutes to pass', 'Return to your task'], icon: Minimize2 },
};

export const NervousSystemReset = ({ fingerprint }: NervousSystemResetProps) => {
  const [activeSection, setActiveSection] = useState<Section>('breathwork');
  const [selectedNeed, setSelectedNeed] = useState<Needs>(null);
  const [activeMode, setActiveMode] = useState<BreathingMode | null>(null);
  const [activeGrounding, setActiveGrounding] = useState<GroundingMode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState<'inhale' | 'hold1' | 'exhale' | 'hold2'>('inhale');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Audio Console States
  const [soundscape, setSoundscape] = useState<'none' | 'solfeggio' | 'waves' | 'cosmic'>('none');
  const [ambientVol, setAmbientVol] = useState<number>(0.3);
  const [pacerSoundEnabled, setPacerSoundEnabled] = useState<boolean>(true);
  const [pacerVol, setPacerVol] = useState<number>(0.4);
  const [interactiveChimes, setInteractiveChimes] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  // Persistent Web Audio Graph Reference
  const audioEngineRef = useRef<{
    ctx: AudioContext | null;
    masterGain: GainNode | null;
    ambientGain: GainNode | null;
    pacerGain: GainNode | null;
    analyser: AnalyserNode | null;
    oscillators: any[];
    noiseSources: any[];
  }>({
    ctx: null,
    masterGain: null,
    ambientGain: null,
    pacerGain: null,
    analyser: null,
    oscillators: [],
    noiseSources: []
  });

  // Track active pacer sound parameters
  const pacerNodesRef = useRef<{
    osc: OscillatorNode;
    filter: BiquadFilterNode;
    gain: GainNode;
    oscChime: OscillatorNode;
    chimeGain: GainNode;
    windSrc: AudioBufferSourceNode;
    windFilter: BiquadFilterNode;
    windGain: GainNode;
  } | null>(null);

  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);

  // Visualizer drawing loop
  useEffect(() => {
    const canvas = visualizerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const dataArray = new Uint8Array(128); // For fftSize 256

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const analyser = audioEngineRef.current?.analyser;
      
      if (!analyser || isMuted) {
        // Draw resting state straight line
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      analyser.fftSize = 256;
      analyser.getByteTimeDomainData(dataArray);
      
      ctx.strokeStyle = '#0ea5e9'; // primary color (sky-500 equivalent)
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      const sliceWidth = width / 128;
      let x = 0;

      for (let i = 0; i < 128; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * (height / 2);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.stroke();
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [isMuted]);

  // Initialize or resume the context
  const ensureAudioContext = () => {
    let ctx = audioEngineRef.current.ctx;
    if (ctx && ctx.state === 'closed') {
      ctx = null;
    }
    if (!ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      ctx = new AudioContextClass();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      analyser.smoothingTimeConstant = 0.8;
      
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(isMuted ? 0 : 0.8, ctx.currentTime);
      masterGain.connect(analyser);
      analyser.connect(ctx.destination);

      const ambientGain = ctx.createGain();
      ambientGain.gain.setValueAtTime(ambientVol, ctx.currentTime);
      ambientGain.connect(masterGain);

      const pacerGain = ctx.createGain();
      pacerGain.gain.setValueAtTime(pacerSoundEnabled ? pacerVol : 0, ctx.currentTime);
      pacerGain.connect(masterGain);

      audioEngineRef.current = {
        ctx,
        masterGain,
        ambientGain,
        pacerGain,
        analyser,
        oscillators: [],
        noiseSources: []
      };
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(e => console.warn('Audio resume failed', e));
    }

    return ctx;
  };

  // Stop current active background loops
  const stopSoundscape = () => {
    audioEngineRef.current.oscillators.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    audioEngineRef.current.noiseSources.forEach(src => {
      try { src.stop(); } catch (e) {}
    });
    audioEngineRef.current.oscillators = [];
    audioEngineRef.current.noiseSources = [];
  };

  // Play beautiful high-fidelity Zen chimes
  const playZenChime = async () => {
    if (isMuted || !interactiveChimes) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [840, 1260, 1680];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.04 / (idx + 1), now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.0 - (idx * 0.15));

      osc.connect(gainNode);
      if (audioEngineRef.current.masterGain) {
        gainNode.connect(audioEngineRef.current.masterGain);
      } else {
        gainNode.connect(ctx.destination);
      }

      osc.start(now);
      osc.stop(now + 1.2);
    });
  };

  // Clean unmount safety
  useEffect(() => {
    return () => {
      stopSoundscape();
      stopPacerSynth();
      if (audioEngineRef.current.ctx) {
        audioEngineRef.current.ctx.close();
      }
    };
  }, []);

  // Synchronize live sliders values with gains
  useEffect(() => {
    const { masterGain, ambientGain, pacerGain, ctx } = audioEngineRef.current;
    if (ctx && ctx.currentTime) {
      const now = ctx.currentTime;
      masterGain?.gain.setTargetAtTime(isMuted ? 0 : 0.8, now, 0.05);
      ambientGain?.gain.setTargetAtTime(ambientVol, now, 0.05);
      pacerGain?.gain.setTargetAtTime(pacerSoundEnabled ? pacerVol : 0, now, 0.05);
    }
  }, [ambientVol, pacerVol, pacerSoundEnabled, isMuted]);

  // Handle background soundscape activation loops
  useEffect(() => {
    const updateSoundscape = async () => {
      const ctx = ensureAudioContext();
      if (!ctx) return;

      stopSoundscape();

      if (soundscape === 'none' || isMuted) return;

      const ambientGain = audioEngineRef.current.ambientGain;
      if (!ambientGain) return;

      const now = ctx.currentTime;

      if (soundscape === 'solfeggio') {
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(432, now); // Solfeggio 432Hz Alignment

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(432.5, now); // 0.5Hz Binaural Brain Calm

        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(108, now); // Grounding chord depth subharmonic

        const gain1 = ctx.createGain();
        gain1.gain.setValueAtTime(0.03, now);

        const gain2 = ctx.createGain();
        gain2.gain.setValueAtTime(0.03, now);

        const gain3 = ctx.createGain();
        gain3.gain.setValueAtTime(0.08, now);

        osc1.connect(gain1);
        gain1.connect(ambientGain);

        osc2.connect(gain2);
        gain2.connect(ambientGain);

        osc3.connect(gain3);
        gain3.connect(ambientGain);

        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.07, now); // Slow organic amplitude swell (LFO)
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.015, now);

        lfo.connect(lfoGain);
        lfoGain.connect(gain1.gain);
        lfoGain.connect(gain2.gain);

        osc1.start(now);
        osc2.start(now);
        osc3.start(now);
        lfo.start(now);

        audioEngineRef.current.oscillators.push(osc1, osc2, osc3, lfo);

      } else if (soundscape === 'waves') {
        // Programmatic ocean tide synthesis (Pink-filtered surf noise)
        const bufferSize = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(2.0, now);
        filter.frequency.setValueAtTime(220, now);

        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.12, now); // Ocean tide swells takes 8.3s
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(120, now);

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.35, now);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ambientGain);

        source.start(now);
        lfo.start(now);

        audioEngineRef.current.noiseSources.push(source);
        audioEngineRef.current.oscillators.push(lfo);

      } else if (soundscape === 'cosmic') {
        const bufferSize = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(5.5, now);
        filter.frequency.setValueAtTime(140, now);

        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.04, now);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(90, now);

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        const subHarmonic = ctx.createOscillator();
        subHarmonic.type = 'triangle';
        subHarmonic.frequency.setValueAtTime(63.2, now);
        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.05, now);

        source.connect(filter);
        filter.connect(ambientGain);

        subHarmonic.connect(subGain);
        subGain.connect(ambientGain);

        source.start(now);
        lfo.start(now);
        subHarmonic.start(now);

        audioEngineRef.current.noiseSources.push(source);
        audioEngineRef.current.oscillators.push(lfo, subHarmonic);
      }
    };

    updateSoundscape();
  }, [soundscape, isMuted]);

  // Breathing Pacer Synth Lifecycle Management
  const startPacerSynth = () => {
    const ctx = audioEngineRef.current.ctx;
    const pacerGain = audioEngineRef.current.pacerGain;
    if (!ctx || !pacerGain) return;

    stopPacerSynth();

    const osc = ctx.createOscillator();
    osc.type = 'triangle'; // Smooth grounding synth
    osc.frequency.setValueAtTime(120, ctx.currentTime);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(1.5, ctx.currentTime);
    filter.frequency.setValueAtTime(160, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, ctx.currentTime);

    const oscChime = ctx.createOscillator();
    oscChime.type = 'sine';
    oscChime.frequency.setValueAtTime(440, ctx.currentTime);
    const chimeGain = ctx.createGain();
    chimeGain.gain.setValueAtTime(0.0, ctx.currentTime);

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buffer;
    windSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.setValueAtTime(8.0, ctx.currentTime);
    windFilter.frequency.setValueAtTime(200, ctx.currentTime);

    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.0, ctx.currentTime);

    // Node graph connections
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(pacerGain);

    oscChime.connect(chimeGain);
    chimeGain.connect(pacerGain);

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(pacerGain);

    osc.start(ctx.currentTime);
    oscChime.start(ctx.currentTime);
    windSrc.start(ctx.currentTime);

    pacerNodesRef.current = {
      osc,
      filter,
      gain,
      oscChime,
      chimeGain,
      windSrc,
      windFilter,
      windGain
    };
  };

  const stopPacerSynth = () => {
    if (pacerNodesRef.current) {
      const p = pacerNodesRef.current;
      try { p.osc.stop(); } catch (e) {}
      try { p.oscChime.stop(); } catch (e) {}
      try { p.windSrc.stop(); } catch (e) {}
      pacerNodesRef.current = null;
    }
  };

  useEffect(() => {
    if (isPlaying && pacerSoundEnabled && !isMuted) {
      const ctx = ensureAudioContext();
      if (ctx) {
        startPacerSynth();
        applyPhaseAudio(phase);
      }
    } else {
      stopPacerSynth();
    }
    return () => {
      stopPacerSynth();
    };
  }, [isPlaying, pacerSoundEnabled, isMuted]);

  // Compute precise pacer duration in seconds
  const getPhaseDuration = (mode: BreathingMode, p: typeof phase): number => {
    if (mode === 'box') return 4;
    if (mode === '478') {
      if (p === 'inhale') return 4;
      if (p === 'hold1') return 7;
      if (p === 'exhale') return 8;
      return 4;
    }
    if (mode === 'coherent') return 5;
    if (mode === 'sigh') {
      if (p === 'inhale') return 3;
      if (p === 'exhale') return 5;
      return 3;
    }
    if (mode === 'extended') {
      if (p === 'inhale') return 4;
      if (p === 'exhale') return 6;
      return 4;
    }
    return 3;
  };

  const applyPhaseAudio = (currentPhase: typeof phase) => {
    if (!isPlaying || !activeMode || pacerSoundEnabled === false || isMuted) return;

    const ctx = audioEngineRef.current.ctx;
    const nodes = pacerNodesRef.current;
    if (!ctx || !nodes) return;

    const dur = getPhaseDuration(activeMode, currentPhase);
    const now = ctx.currentTime;

    if (currentPhase === 'inhale') {
      // Swelling volume and high cut sweeps to represent deep breathing inhale
      nodes.gain.gain.cancelScheduledValues(now);
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
      nodes.gain.gain.linearRampToValueAtTime(0.12, now + dur);

      nodes.filter.frequency.cancelScheduledValues(now);
      nodes.filter.frequency.setValueAtTime(nodes.filter.frequency.value, now);
      nodes.filter.frequency.exponentialRampToValueAtTime(450, now + dur);

      nodes.osc.frequency.cancelScheduledValues(now);
      nodes.osc.frequency.setValueAtTime(nodes.osc.frequency.value, now);
      nodes.osc.frequency.linearRampToValueAtTime(220, now + dur);

      nodes.windGain.gain.cancelScheduledValues(now);
      nodes.windGain.gain.setValueAtTime(nodes.windGain.gain.value, now);
      nodes.windGain.gain.linearRampToValueAtTime(0.07, now + dur);

      nodes.windFilter.frequency.cancelScheduledValues(now);
      nodes.windFilter.frequency.setValueAtTime(nodes.windFilter.frequency.value, now);
      nodes.windFilter.frequency.exponentialRampToValueAtTime(600, now + dur);

      if (interactiveChimes) {
        nodes.chimeGain.gain.cancelScheduledValues(now);
        nodes.chimeGain.gain.setValueAtTime(0, now);
        nodes.chimeGain.gain.linearRampToValueAtTime(0.04, now + 0.02);
        nodes.chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      }

    } else if (currentPhase === 'hold1') {
      nodes.gain.gain.cancelScheduledValues(now);
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
      nodes.gain.gain.linearRampToValueAtTime(0.08, now + dur);

      nodes.windGain.gain.cancelScheduledValues(now);
      nodes.windGain.gain.setValueAtTime(nodes.windGain.gain.value, now);
      nodes.windGain.gain.linearRampToValueAtTime(0.01, now + dur);

    } else if (currentPhase === 'exhale') {
      // Relaxing and descending sweeps
      nodes.gain.gain.cancelScheduledValues(now);
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
      nodes.gain.gain.linearRampToValueAtTime(0.01, now + dur);

      nodes.filter.frequency.cancelScheduledValues(now);
      nodes.filter.frequency.setValueAtTime(nodes.filter.frequency.value, now);
      nodes.filter.frequency.exponentialRampToValueAtTime(130, now + dur);

      nodes.osc.frequency.cancelScheduledValues(now);
      nodes.osc.frequency.setValueAtTime(nodes.osc.frequency.value, now);
      nodes.osc.frequency.linearRampToValueAtTime(100, now + dur);

      nodes.windGain.gain.cancelScheduledValues(now);
      nodes.windGain.gain.setValueAtTime(nodes.windGain.gain.value, now);
      nodes.windGain.gain.linearRampToValueAtTime(0.02, now + dur);

      nodes.windFilter.frequency.cancelScheduledValues(now);
      nodes.windFilter.frequency.setValueAtTime(nodes.windFilter.frequency.value, now);
      nodes.windFilter.frequency.exponentialRampToValueAtTime(180, now + dur);

      if (interactiveChimes) {
        nodes.chimeGain.gain.cancelScheduledValues(now);
        nodes.chimeGain.gain.setValueAtTime(0, now);
        nodes.chimeGain.gain.linearRampToValueAtTime(0.02, now + 0.02);
        nodes.chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      }

    } else if (currentPhase === 'hold2') {
      nodes.gain.gain.cancelScheduledValues(now);
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
      nodes.gain.gain.linearRampToValueAtTime(0.002, now + dur);

      nodes.windGain.gain.cancelScheduledValues(now);
      nodes.windGain.gain.setValueAtTime(nodes.windGain.gain.value, now);
      nodes.windGain.gain.linearRampToValueAtTime(0.0, now + dur);
    }
  };

  // Synchronize phase duration transitions with audio ramps
  useEffect(() => {
    applyPhaseAudio(phase);
  }, [phase, isPlaying, activeMode, pacerSoundEnabled, isMuted, interactiveChimes]);

  const handleResetAllState = () => {
    setSelectedNeed(null);
    setActiveMode(null);
    setActiveGrounding(null);
    setIsPlaying(false);
    setPhase('inhale');
    setShowResetConfirm(false);
    setSoundscape('none');
    setCompletedSteps([]);
  };

  const handleNeedSelect = (need: NonNullable<Needs>) => {
    setSelectedNeed(need);
    setActiveMode(NEEDS_MAPPING[need]);
    setIsPlaying(false);
    playZenChime();
  };

  const handleToggleStep = (idx: number) => {
    setCompletedSteps(prev => {
      const isExist = prev.includes(idx);
      if (isExist) {
        return prev.filter(p => p !== idx);
      } else {
        playZenChime();
        return [...prev, idx];
      }
    });
  };

  // Master Breathing loop timer triggering React states
  useEffect(() => {
    if (!isPlaying || !activeMode) return;

    let timeout1: NodeJS.Timeout, timeout2: NodeJS.Timeout, timeout3: NodeJS.Timeout, timeout4: NodeJS.Timeout;

    const cycle = () => {
      if (activeMode === 'box') {
        setPhase('inhale');
        timeout1 = setTimeout(() => setPhase('hold1'), 4000);
        timeout2 = setTimeout(() => setPhase('exhale'), 8000);
        timeout3 = setTimeout(() => setPhase('hold2'), 12000);
        timeout4 = setTimeout(cycle, 16000);
      } else if (activeMode === '478') {
        setPhase('inhale');
        timeout1 = setTimeout(() => setPhase('hold1'), 4000);
        timeout2 = setTimeout(() => setPhase('exhale'), 11000);
        timeout3 = setTimeout(cycle, 19000);
      } else if (activeMode === 'extended') {
        setPhase('inhale');
        timeout1 = setTimeout(() => setPhase('exhale'), 4000);
        timeout2 = setTimeout(cycle, 10000);
      } else if (activeMode === 'coherent') {
          setPhase('inhale');
          timeout1 = setTimeout(() => setPhase('exhale'), 5000);
          timeout2 = setTimeout(cycle, 10000);
      } else if (activeMode === 'sigh') {
          setPhase('inhale');
          timeout1 = setTimeout(() => setPhase('exhale'), 3000);
          timeout2 = setTimeout(cycle, 8000);
      } else {
        setPhase('inhale');
        timeout1 = setTimeout(() => setPhase('exhale'), 3000);
        timeout2 = setTimeout(cycle, 6000);
      }
    };

    cycle();

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      clearTimeout(timeout4);
    };
  }, [isPlaying, activeMode]);

  return (
    <div className="space-y-12 pb-24">
      {/* Reset Confirmation Dialog Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-card border border-border rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="space-y-2">
                <h4 className="text-xl font-display font-bold text-text-main">Reset Reset Studio State?</h4>
                <p className="text-sm text-text-muted leading-relaxed">
                  Are you sure you want to clear your active somatic diagnostic choices, ongoing breathwork routines, and grounding toolkit selections? This action will reset your studio work-in-progress state.
                </p>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:text-text-main border border-border/80 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetAllState}
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-destructive hover:bg-destructive-foreground hover:bg-opacity-90 text-destructive-foreground cursor-pointer"
                >
                  Yes, Reset State
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 8 / Somatic Control</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Nervous System Reset Studio</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Fast tools when you are overwhelmed, tense, scattered, panicky, angry, flat, or mentally fried."
            </p>
          </div>
          {(selectedNeed || activeMode || activeGrounding || isPlaying) && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest text-destructive hover:bg-destructive/10 border border-destructive/30 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Studio
            </button>
          )}
        </div>
      </div>

      {/* Acute Overwhelm / Panic shortcut */}
      <div className="mt-8 p-6 rounded-2xl border border-red-500/20 bg-red-500/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-[40px] pointer-events-none" />
        <div className="space-y-1 relative z-10 text-left">
          <div className="flex items-center gap-2 text-red-400 font-bold uppercase tracking-wider text-[10px]">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Acute Overwhelm / Somatic Panic Alert
          </div>
          <h4 className="font-serif text-lg font-medium text-text-main">Experiencing severe anxiety, tight chest, or racing thoughts?</h4>
          <p className="text-xs text-text-muted max-w-2xl leading-relaxed">
            The standard Breathwork and Grounding tools are below. If you need a fully structured sensory reset path with intensity tracking and interactive de-escalation tools, launch the dedicated Reset Mode.
          </p>
        </div>
        <button
          onClick={() => {
            const event = new CustomEvent('navigate_tab', { detail: 'anxiety_reset' });
            window.dispatchEvent(event);
          }}
          className="px-5 py-3 shrink-0 bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-md shadow-red-500/10 relative z-10 flex items-center gap-2 cursor-pointer"
        >
          Launch Reset Mode <Play className="w-4 h-4 fill-current" />
        </button>
      </div>

      <div className="flex bg-surface dark:bg-surface/50 p-1 border border-border/50 rounded-full w-max mt-8 mb-8">
        <button
          onClick={() => setActiveSection('breathwork')}
          className={cn("px-6 py-2 rounded-full text-sm font-bold tracking-wide transition-all", activeSection === 'breathwork' ? 'bg-white dark:bg-surface shadow-md text-text-main' : 'text-text-muted hover:text-text-main')}
        >
          Breathwork
        </button>
        <button
          onClick={() => setActiveSection('grounding')}
          className={cn("px-6 py-2 rounded-full text-sm font-bold tracking-wide transition-all", activeSection === 'grounding' ? 'bg-white dark:bg-surface shadow-md text-text-main' : 'text-text-muted hover:text-text-main')}
        >
          Grounding Toolkit
        </button>
      </div>

      {/* Somatic Audio Synthesizer Console */}
      <div className="card glass border-primary/20 bg-primary/5 p-6 relative overflow-hidden mb-8 shadow-xl">
        <div className="absolute inset-0 bg-radial-gradient from-primary/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <h4 className="text-xs font-black uppercase tracking-widest text-text-muted">Acoustic Bio-Guidance Console</h4>
            </div>
            <p className="text-sm font-bold text-text-main flex items-center gap-1.5">
              <Music className="w-4 h-4 text-primary" /> Synthesized Neural Entrainment
            </p>
            <p className="text-[11px] text-text-muted">
              Generates physical wave frequencies locally to anchor breathing & soothe autonomic overdrive.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wider font-black text-text-muted">Soundscape Selection</span>
              <div className="flex bg-surface dark:bg-surface rounded-xl p-1 border border-border/50">
                {(['none', 'solfeggio', 'waves', 'cosmic'] as const).map((sc) => (
                  <button
                    key={sc}
                    onClick={() => {
                      setSoundscape(sc);
                      if (sc !== 'none' && isMuted) {
                        setIsMuted(false);
                      }
                      const ctx = ensureAudioContext();
                      if (ctx && ctx.state === 'suspended') ctx.resume();
                      playZenChime();
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                      soundscape === sc && !isMuted
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-text-muted hover:text-text-main"
                    )}
                  >
                    {sc === 'none' ? 'Mute' : sc}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 w-32">
              <div className="flex justify-between items-center text-xs uppercase tracking-wider font-black text-text-muted">
                <span>Ambient Vol</span>
                <span>{Math.round(ambientVol * 100)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsMuted(!isMuted);
                    ensureAudioContext();
                  }}
                  className="text-text-muted hover:text-text-main shrink-0"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-destructive pointer-events-auto" /> : <Volume2 className="w-4 h-4 text-primary pointer-events-auto" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={ambientVol}
                  onChange={(e) => {
                    setAmbientVol(parseFloat(e.target.value));
                    if (isMuted) setIsMuted(false);
                    ensureAudioContext();
                  }}
                  className="w-full accent-primary bg-border dark:bg-surface h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 w-36">
              <div className="flex justify-between items-center text-xs uppercase tracking-wider font-black text-text-muted">
                <span>Pacer Sound</span>
                <span className="text-[11px] text-primary font-bold">{pacerSoundEnabled ? "Active" : "Disabled"}</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pacerSoundEnabled}
                    onChange={(e) => {
                      setPacerSoundEnabled(e.target.checked);
                      ensureAudioContext();
                      playZenChime();
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-surface dark:bg-surface peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
                </label>
                <input
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={pacerVol}
                  onChange={(e) => {
                    setPacerVol(parseFloat(e.target.value));
                    if (!pacerSoundEnabled) setPacerSoundEnabled(true);
                    ensureAudioContext();
                  }}
                  className="w-full accent-primary bg-border dark:bg-surface h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Interactive Live Audio Output Visualizer */}
          <div className="flex items-center justify-center h-12 w-24 border border-border/30 rounded-xl bg-surface/50 dark:bg-card/40 px-3 py-2 shrink-0">
            <canvas ref={visualizerCanvasRef} width={80} height={40} className="w-full h-full opacity-80" />
          </div>
        </div>
      </div>

      {activeSection === 'breathwork' && (
      <>
      <div className="card glass border-primary/20 bg-primary/5 p-8 relative overflow-hidden mb-8">
        <div className="relative z-10 space-y-6">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                <Wind className="w-5 h-5" />
              </div>
              <h4 className="text-xl font-display font-bold text-text-main">Nova's Recommendation</h4>
            </div>
            
            <p className="text-lg text-text-muted font-medium">"Do you need calm, clarity, sleep, focus, or release?"</p>
            
            <div className="flex flex-wrap gap-4">
              {(['calm', 'clarity', 'sleep', 'focus', 'release'] as const).map((need) => (
                <button
                  key={need}
                  onClick={() => handleNeedSelect(need)}
                  className={cn(
                    "px-6 py-3 rounded-full text-sm font-bold uppercase tracking-widest transition-all",
                    selectedNeed === need 
                      ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20 scale-105" 
                      : "bg-white/5 dark:bg-surface text-text-muted hover:bg-white/10 dark:hover:bg-surface border border-border/50"
                  )}
                >
                  {need}
                </button>
              ))}
            </div>
        </div>
        <div className="absolute right-[-10%] top-[-10%] w-96 h-96 bg-primary/10 rounded-full blur-[100px]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <h4 className="text-sm font-black uppercase tracking-widest text-text-muted mb-6">Breathwork Library</h4>
          {Object.entries(BREATHING_MODES).map(([key, mode]) => {
            const isSelected = activeMode === key;
            const Icon = mode.icon;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveMode(key as BreathingMode);
                  setIsPlaying(false);
                  setSelectedNeed(null);
                }}
                className={cn(
                  "w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4",
                  isSelected 
                    ? "bg-primary/10 border-primary/30 shadow-inner" 
                    : "glass border-transparent hover:border-border/50 opacity-70 hover:opacity-100"
                )}
              >
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-colors", isSelected ? "bg-primary text-primary-foreground" : "bg-white/10 text-text-main")}>
                  <Icon className="w-4 h-4 cursor-pointer" />
                </div>
                <div>
                  <h5 className="font-bold text-text-main font-display">{mode.name}</h5>
                  <p className="text-xs uppercase tracking-widest text-text-muted font-bold mt-1 line-clamp-1">{mode.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          {activeMode ? (
            <div className="card glass p-6 sm:p-8 md:p-12 h-full flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[500px]">
              <div className="absolute top-8 left-8 text-left">
                <span className="tag mb-4">{BREATHING_MODES[activeMode].name}</span>
                <p className="text-xl font-display font-medium text-text-main mt-4 max-w-sm">
                  {BREATHING_MODES[activeMode].instruction}
                </p>
              </div>

              <div className="relative w-64 h-64 flex items-center justify-center my-12">
                <motion.div
                  className="absolute inset-0 bg-primary/20 rounded-full blur-2xl"
                  animate={isPlaying ? {
                    scale: phase === 'inhale' ? 1.5 : (phase === 'hold1' ? 1.5 : (phase === 'exhale' ? 0.8 : 0.8)),
                    opacity: phase === 'inhale' ? 0.8 : 0.3
                  } : { scale: 1, opacity: 0.1 }}
                  transition={{ duration: phase === 'inhale' || phase === 'exhale' ? 4 : 1, ease: 'easeInOut' }}
                />
                <motion.div
                  className="w-32 h-32 bg-primary rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center relative z-10"
                  animate={isPlaying ? {
                    scale: phase === 'inhale' ? 2 : (phase === 'hold1' ? 2 : (phase === 'exhale' ? 1 : 1)),
                  } : { scale: 1 }}
                  transition={{ duration: phase === 'inhale' || phase === 'exhale' ? 4 : 1, ease: 'easeInOut' }}
                >
                  {isPlaying && (
                    <motion.span 
                      key={phase}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-text-main font-black uppercase tracking-widest text-lg"
                    >
                      {phase.replace('1', '').replace('2', '')}
                    </motion.span>
                  )}
                </motion.div>
                
                {/* Decorative rings */}
                <div className="absolute inset-0 border border-primary/20 rounded-full scale-[1.5]" />
                <div className="absolute inset-0 border border-primary/10 rounded-full scale-[2]" />
              </div>

              <button
                onClick={async () => {
                  ensureAudioContext();
                  setIsPlaying(!isPlaying);
                }}
                className="mt-8 flex items-center gap-3 px-8 py-4 bg-text-main text-bg-main rounded-full font-bold uppercase tracking-widest hover:scale-105 transition-transform"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-5 h-5" /> Pause Practice
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 text-primary" /> Begin Reset Sequence
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="card glass h-full flex flex-col items-center justify-center text-center p-6 sm:p-8 md:p-12 min-h-[500px]">
              <div className="w-24 h-24 mb-6 rounded-full bg-surface dark:bg-surface flex items-center justify-center opacity-50">
                <Wind className="w-10 h-10 text-text-muted" />
              </div>
              <h3 className="text-2xl font-display font-bold text-text-main mb-4">Choose a Practice</h3>
              <p className="text-sm font-medium text-text-muted max-w-md mx-auto">
                Connect with Nova's diagnostic above or select a breathing mode from the library to begin nervous system regulation.
              </p>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {activeSection === 'grounding' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <h4 className="text-sm font-black uppercase tracking-widest text-text-muted mb-6">Grounding Toolkit</h4>
          {Object.entries(GROUNDING_MODES).map(([key, mode]) => {
            const isSelected = activeGrounding === key;
            const Icon = mode.icon;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveGrounding(key as GroundingMode);
                }}
                className={cn(
                  "w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4",
                  isSelected 
                    ? "bg-primary/10 border-primary/30 shadow-inner" 
                    : "glass border-transparent hover:border-border/50 opacity-70 hover:opacity-100"
                )}
              >
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-colors", isSelected ? "bg-primary text-primary-foreground" : "bg-white/10 text-text-main")}>
                  <Icon className="w-4 h-4 cursor-pointer" />
                </div>
                <div>
                  <h5 className="font-bold text-text-main font-display">{mode.name}</h5>
                  <p className="text-xs uppercase tracking-widest text-text-muted font-bold mt-1 line-clamp-1">{mode.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="lg:col-span-2">
          {activeGrounding ? (
            <div className="card glass p-6 sm:p-8 md:p-12 h-full flex flex-col items-center justify-center relative overflow-hidden min-h-[500px]">
              <div className="absolute top-8 left-8 text-left">
                <span className="tag mb-4">{GROUNDING_MODES[activeGrounding].name}</span>
                <p className="text-xl font-display font-medium text-text-main mt-4 max-w-sm">
                  {GROUNDING_MODES[activeGrounding].description}
                </p>
              </div>

              {activeGrounding === 'timer' ? (
                 <div className="relative w-64 h-64 flex items-center justify-center my-12">
                   <motion.div
                     className="absolute inset-0 bg-primary/20 rounded-full blur-2xl"
                     animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
                     transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                   />
                   <motion.div
                     className="w-16 h-16 bg-primary rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center relative z-10"
                     animate={{ scale: [1, 2, 1] }}
                     transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                   />
                   <div className="absolute inset-0 border border-primary/20 rounded-full scale-[1.5]" />
                   <div className="absolute inset-0 border border-primary/10 rounded-full scale-[2]" />
                 </div>
              ) : (
                <div className="w-full max-w-md mx-auto my-12 space-y-4">
                  <p className="text-xs text-text-muted font-black text-center mb-4 uppercase tracking-[0.2em] bg-surface/70 dark:bg-surface/60 py-2 px-4 rounded-full">
                    Tap steps to check off • Plays Acoustic Chimes
                  </p>
                  {GROUNDING_MODES[activeGrounding].instructions.map((instruction, idx) => {
                    const isCompleted = completedSteps.includes(idx);
                    return (
                      <motion.div
                        key={idx}
                        onClick={() => handleToggleStep(idx)}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.12 }}
                        className={cn(
                          "flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer select-none",
                          isCompleted
                            ? "bg-success/10 border-success/30 opacity-85 shadow-inner"
                            : "bg-white dark:bg-surface/40 border-border/50 hover:border-primary/40 shadow-sm"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-full font-black flex items-center justify-center shrink-0 transition-colors",
                          isCompleted
                            ? "bg-success text-white"
                            : "bg-primary/10 text-primary"
                        )}>
                          {isCompleted ? <CheckCircle2 className="w-5 h-5 text-text-main" /> : idx + 1}
                        </div>
                        <p className={cn(
                          "text-text-main font-bold text-base transition-all",
                          isCompleted && "line-through text-text-muted font-normal"
                        )}>
                          {instruction}
                        </p>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="card glass h-full flex flex-col items-center justify-center text-center p-6 sm:p-8 md:p-12 min-h-[500px]">
              <div className="w-24 h-24 mb-6 rounded-full bg-surface dark:bg-surface flex items-center justify-center opacity-50">
                <Brain className="w-10 h-10 text-text-muted" />
              </div>
              <h3 className="text-2xl font-display font-bold text-text-main mb-4">Mental Overload Toolkit</h3>
              <p className="text-sm font-medium text-text-muted max-w-md mx-auto">
                Practical self-regulation tools for moments of high tension or detachment. Select a grounding mode to begin.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
