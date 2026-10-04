import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wind, Brain, Moon, Waves, Activity, RefreshCw, Eye, Ear, UserCircle, MapPin, Minimize2, Clock, Volume2, VolumeX, Music, CheckCircle2, Sparkles, ShieldAlert, LifeBuoy, MinusCircle, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';
import { useFocusTrap } from '../lib/useFocusTrap';
import { secureApiFetch } from '../lib/secure-api';
import { logJourney } from '../lib/nova-brain';
import { auth } from '../lib/firebase';
import {
  BreathingPracticeId, BreathingNeed, BREATHING_NEED_ORDER, BREATHING_NEED_LABELS, BREATHING_LIBRARY,
  BREATHING_LIBRARY_ORDER, recommendPractice, CheckpointResponse, CHECKPOINT_RESPONSE_ORDER,
  CHECKPOINT_RESPONSE_LABELS, CHECKPOINT_BRANCHES, CHECKPOINT_OPTION_LABELS,
  BreathingHelpfulness, shouldAskDidItHelp, computeMostHelpfulPractice, computeBreathingEffectivenessSignal,
  shouldSuggestLoadIsRealProblem, OverwhelmIntensity, OVERWHELM_INTENSITY_ORDER, OVERWHELM_INTENSITY_LABELS,
  maxChoicesForIntensity, GuidedResetStepId,
} from '../../breathing-reset-engine';
import {
  recordBreathingSession, updateBreathingSessionFeedback, loadRecentBreathingSessions,
  recordBreathingSessionCompletion,
} from '../lib/breathing-reset-service';
import { loadLatestCapacityCheckIn, loadStressors } from '../lib/energy-delta-service';
import { computeEnergyDelta } from '../../energy-delta-engine';
import { startAmbientSoundscape, AmbientSoundscapeId } from '../lib/ambient-soundscape';

interface NervousSystemResetProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

type Section = 'breathwork' | 'grounding';
type BreathingMode = BreathingPracticeId;
type GroundingMode = '60sec' | '5things' | 'scan' | 'feet' | 'sound' | 'room' | 'timer';
type Needs = BreathingNeed | null;

// Cycle timing and icons stay local to this component (the animation
// engine); the name/description/duration copy itself now comes from
// breathing-reset-engine.ts's BREATHING_LIBRARY so there's one place
// that copy is written, never two drifting copies of the same practice.
const BREATHING_CYCLE: Record<BreathingMode, { instruction: string; cycleMs: number; icon: any }> = {
  box: { instruction: 'Inhale 4s • Hold 4s • Exhale 4s • Hold 4s', cycleMs: 16000, icon: RefreshCw },
  '478': { instruction: 'Inhale 4s • Hold 7s • Exhale 8s', cycleMs: 19000, icon: Moon },
  coherent: { instruction: 'Inhale 5s • Exhale 5s', cycleMs: 10000, icon: Waves },
  sigh: { instruction: 'Double Inhale • Long Exhale', cycleMs: 8000, icon: Wind },
  extended: { instruction: 'Inhale 4s • Exhale 6s', cycleMs: 10000, icon: Activity },
  rectangle: { instruction: 'Inhale short side • Exhale long side', cycleMs: 12000, icon: RefreshCw },
  calm: { instruction: 'Inhale 1-2-3 • Exhale 1-2-3', cycleMs: 6000, icon: Brain },
};

// A small curated set offered during Guided Reset Mode's "slow the body"
// step - gentle, short practices only, never the more involved ones.
const GUIDED_RESET_PRACTICES: BreathingPracticeId[] = ['extended', 'sigh', 'coherent'];

// BACKGROUND SOUND: mature, calm labels - never novelty-heavy or
// scientifically suggestive ("solfeggio" implied a tuning-frequency
// claim this app never substantiated). Each label is only applied to a
// soundscape that's genuinely distinct audio already in this engine,
// never a label invented for a sound that doesn't exist.
const SOUNDSCAPE_LABELS: Record<'none' | 'solfeggio' | 'wind' | 'waves' | 'cosmic', string> = {
  none: 'Mute',
  wind: 'Soft Wind',
  waves: 'Ocean Drift',
  solfeggio: 'Soft Tone',
  cosmic: 'Night Air',
};

const GROUNDING_MODES: Record<GroundingMode, { name: string; description: string; instructions: string[]; icon: any }> = {
  '60sec': { name: '60-Second Grounding', description: 'Fast recalibration of your surroundings.', instructions: ['Look around', 'Name 1 thing you see', 'Name 1 thing you hear', 'Name 1 thing you feel', 'Take 1 deep breath'], icon: Clock },
  '5things': { name: 'Name 5 Things', description: 'Classic grounding when mentally overloaded.', instructions: ['Name 5 things you can see', 'Name 4 things you can feel', 'Name 3 things you can hear', 'Name 2 things you can smell', 'Name 1 thing you can taste'], icon: Eye },
  'scan': { name: 'Body Scan', description: 'Progressive awareness of physical tension.', instructions: ['Notice your toes', 'Move attention up to your calves', 'Notice your thighs and hips', 'Feel your stomach and chest', 'Release your shoulders and jaw'], icon: UserCircle },
  'feet': { name: 'Feet-on-Floor', description: 'Tethering technique for panicky feelings.', instructions: ['Place both feet flat on the ground', 'Press down gently through your heels', 'Notice the solid floor beneath you', 'Imagine roots growing from your feet', 'Breathe steadily'], icon: Activity },
  'sound': { name: 'Sound-Based Grounding', description: 'Auditory focus to stop racing thoughts.', instructions: ['Close your eyes', 'Listen for the loudest sound', 'Listen for the quietest sound', 'Listen for a sound inside the room', 'Listen for a sound outside the room'], icon: Ear },
  'room': { name: 'Come Back to the Room', description: 'Spatial awareness recovery.', instructions: ['Find a corner of the room', 'Trace the lines of the ceiling', 'Notice the colours of the walls', 'Count the windows', 'Acknowledge you are safe here'], icon: MapPin },
  'timer': { name: 'Calm Visual Timer', description: 'A soothing focus anchor.', instructions: ['Watch the shape expand and contract', 'Let your thoughts drift past', 'Keep your eyes on the centre point', 'Allow 2 minutes to pass', 'Return to your task'], icon: Minimize2 },
};

export const NervousSystemReset = ({ fingerprint, onAwardPoints }: NervousSystemResetProps) => {
  const [activeSection, setActiveSection] = useState<Section>('breathwork');
  const [selectedNeed, setSelectedNeed] = useState<Needs>(null);
  const [activeMode, setActiveMode] = useState<BreathingMode | null>(null);
  const [activeGrounding, setActiveGrounding] = useState<GroundingMode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [phase, setPhase] = useState<'inhale' | 'hold1' | 'exhale' | 'hold2'>('inhale');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const resetDialogRef = useFocusTrap(showResetConfirm);

  useEffect(() => {
    if (!showResetConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowResetConfirm(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showResetConfirm]);

  // Audio Console States
  const [soundscape, setSoundscape] = useState<'none' | 'solfeggio' | 'wind' | 'waves' | 'cosmic'>('none');
  const [ambientVol, setAmbientVol] = useState<number>(0.3);
  const [pacerSoundEnabled, setPacerSoundEnabled] = useState<boolean>(true);
  const [pacerVol, setPacerVol] = useState<number>(0.4);
  const [interactiveChimes, setInteractiveChimes] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  // NOVA RECOMMENDATION / PRIMARY POSITIONING: one practice, not three or
  // four equal options - shown by default (the brief's own "Extended
  // Exhale" example) even before the user picks a specific need.
  const [recommendedPractice, setRecommendedPractice] = useState<BreathingPracticeId>('extended');
  const [showRecommendation, setShowRecommendation] = useState(true);
  // BEFORE THE PRACTICE: a comfort screen between choosing a practice and
  // actually starting the timer/animation - never skipped, whether the
  // practice came from Nova's recommendation or the library below.
  const [prePractice, setPrePractice] = useState<BreathingPracticeId | null>(null);
  // GUIDED RESET MODE
  const [guidedReset, setGuidedReset] = useState<{ step: 'intensity' | GuidedResetStepId; intensity: OverwhelmIntensity | null } | null>(null);
  const guidedResetActiveRef = useRef(false);
  // MID-SESSION OPTION
  const [showMidSessionPrompt, setShowMidSessionPrompt] = useState(false);
  const midSessionPromptShownRef = useRef(false);
  const midSessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // POST-SESSION RESET CHECKPOINT
  const [checkpoint, setCheckpoint] = useState<{ toolName: string; practiceId: BreathingPracticeId | null; durationSeconds: number } | null>(null);
  const [checkpointResponse, setCheckpointResponse] = useState<CheckpointResponse | null>(null);
  const [checkpointSessionId, setCheckpointSessionId] = useState<string | null>(null);
  const [showDidItHelp, setShowDidItHelp] = useState(false);
  const [didItHelpAnswered, setDidItHelpAnswered] = useState(false);
  // CONNECTION TO ENERGY DELTA + PERSONALISATION
  const [energyDeltaNegative, setEnergyDeltaNegative] = useState<boolean | null>(null);
  const [resetsToday, setResetsToday] = useState(0);
  const [preferredPractice, setPreferredPractice] = useState<BreathingPracticeId | null>(null);
  const [effectivenessSignal, setEffectivenessSignal] = useState<'reliable' | 'inconsistent' | null>(null);

  const isEveningWindDown = () => {
    const hour = new Date().getHours();
    return hour >= 20 || hour < 5;
  };

  // Loads just enough real context to make the default recommendation
  // and the personalisation line honest - never claims a signal that
  // isn't actually connected (CORE PRODUCT PRINCIPLE: "Do not claim
  // access to data that is not connected or available").
  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    (async () => {
      try {
        const [checkIn, stressors, sessions] = await Promise.all([
          loadLatestCapacityCheckIn(uid),
          loadStressors(uid),
          loadRecentBreathingSessions(uid),
        ]);
        if (checkIn) {
          const result = computeEnergyDelta(checkIn.score, stressors.filter((s) => s.status === 'active'));
          setEnergyDeltaNegative(result.energyDelta < 0);
        }
        const todayKey = new Date().toDateString();
        setResetsToday(sessions.filter((s) => new Date(s.createdAt).toDateString() === todayKey).length);
        const preferred = computeMostHelpfulPractice(sessions.filter((s) => s.helpful).map((s) => ({ practiceId: s.practiceId, helpful: s.helpful as BreathingHelpfulness })));
        setPreferredPractice(preferred);
        const recentResponses = sessions.filter((s) => s.checkpointResponse).map((s) => s.checkpointResponse as CheckpointResponse);
        setEffectivenessSignal(computeBreathingEffectivenessSignal(recentResponses));
        setRecommendedPractice(recommendPractice(null, { isEveningWindDown: isEveningWindDown(), preferredPractice: preferred }));
      } catch (e) {
        // Leaves the honest defaults in place rather than pretending context loaded.
      }
    })();
  }, []);

  // ============ Real Completion Tracking ============
  // Previously this whole module had no onAwardPoints, no activity
  // marking, and no journey logging at all - meaning finishing a real
  // breathing or grounding session left no trace anywhere Nova (or the
  // rest of the app) could see it happened.
  const breathingSessionStartRef = useRef<number | null>(null);
  const groundingCompletionFiredRef = useRef(false);

  const markResetComplete = (toolName: string, durationLabel: string) => {
    if (onAwardPoints) {
      try {
        onAwardPoints(15, `Completed ${toolName}`);
      } catch (e) {
        // Non-fatal - the session itself still counts even if the points callback fails.
      }
    }
    if (auth.currentUser) {
      secureApiFetch('/api/user/mark-activity', {
        method: 'POST',
        data: { activity: 'nervousSystemReset' },
      }).catch(() => {
        // Non-fatal - this only affects the home recommendation engine's
        // freshness, not the session the person just completed.
      });
    }
    logJourney(`Completed a nervous system reset (${toolName})`, durationLabel);
  };


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

  // The active ambient soundscape's own filter/gain, exposed here so
  // applyPhaseAudio can genuinely swell and recede the sound itself with
  // each breath - not just the separate pacer tone layered on top of it.
  // Only populated for soundscapes that are meant to breathe (wind, waves);
  // solfeggio and cosmic stay as steady atmospheric beds by design.
  const ambientBreathNodesRef = useRef<{ filter: BiquadFilterNode; gain: GainNode; baseFreq: number; peakFreq: number; baseGain: number; peakGain: number } | null>(null);

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
    // Non-fatal - the Web Audio API throws if .stop() is called on a
    // node that's already stopped, which can legitimately happen here
    // depending on playback state; nothing further needs to happen if so.
    audioEngineRef.current.oscillators.forEach(osc => {
      try { osc.stop(); } catch (e) { /* already stopped */ }
    });
    audioEngineRef.current.noiseSources.forEach(src => {
      try { src.stop(); } catch (e) { /* already stopped */ }
    });
    audioEngineRef.current.oscillators = [];
    audioEngineRef.current.noiseSources = [];
    ambientBreathNodesRef.current = null;
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

      } else if (soundscape === 'wind' || soundscape === 'waves' || soundscape === 'cosmic') {
        // Delegates to the shared ambient-soundscape module (same module
        // Anxiety Reset uses) so "Soft Wind"/"Ocean Drift"/"Night Air"
        // are only ever synthesized in one place.
        const handle = startAmbientSoundscape(ctx, ambientGain, soundscape as AmbientSoundscapeId);
        audioEngineRef.current.noiseSources.push(...handle.noiseSources);
        audioEngineRef.current.oscillators.push(...handle.oscillators);
        ambientBreathNodesRef.current = handle.breathNodes;
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
      // Non-fatal - same reasoning as stopSoundscape above: .stop() on an
      // already-stopped node throws, and there's nothing further to do.
      try { p.osc.stop(); } catch (e) { /* already stopped */ }
      try { p.oscChime.stop(); } catch (e) { /* already stopped */ }
      try { p.windSrc.stop(); } catch (e) { /* already stopped */ }
      pacerNodesRef.current = null;
    }
  };

  useEffect(() => {
    if (isPlaying && pacerSoundEnabled && !isMuted) {
      const ctx = ensureAudioContext();
      if (ctx) {
        startPacerSynth();
      }
    } else {
      stopPacerSynth();
    }
    return () => {
      stopPacerSynth();
    };
  }, [isPlaying, pacerSoundEnabled, isMuted]);

  // Separate from the start/stop effect above deliberately - applyPhaseAudio
  // smoothly ramps the already-running synth's parameters (Web Audio's
  // linearRampToValueAtTime), it doesn't restart it. Combining this into the
  // effect above would stop/restart the oscillator on every phase change
  // instead of ramping it, and previously phase wasn't a dependency at all,
  // so the audio never updated past the very first phase of a session.
  useEffect(() => {
    if (isPlaying && pacerSoundEnabled && !isMuted) {
      applyPhaseAudio(phase);
    }
  }, [phase, isPlaying, pacerSoundEnabled, isMuted]);

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

      const ambient = ambientBreathNodesRef.current;
      if (ambient) {
        ambient.gain.gain.cancelScheduledValues(now);
        ambient.gain.gain.setValueAtTime(ambient.gain.gain.value, now);
        ambient.gain.gain.linearRampToValueAtTime(ambient.peakGain, now + dur);

        ambient.filter.frequency.cancelScheduledValues(now);
        ambient.filter.frequency.setValueAtTime(ambient.filter.frequency.value, now);
        ambient.filter.frequency.exponentialRampToValueAtTime(ambient.peakFreq, now + dur);
      }

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

      const ambient = ambientBreathNodesRef.current;
      if (ambient) {
        // Held at the top of the breath - ease slightly off the peak rather
        // than snapping, so a long hold doesn't sit at full intensity.
        const settled = ambient.baseGain + (ambient.peakGain - ambient.baseGain) * 0.6;
        ambient.gain.gain.cancelScheduledValues(now);
        ambient.gain.gain.setValueAtTime(ambient.gain.gain.value, now);
        ambient.gain.gain.linearRampToValueAtTime(settled, now + dur);
      }

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

      const ambient = ambientBreathNodesRef.current;
      if (ambient) {
        ambient.gain.gain.cancelScheduledValues(now);
        ambient.gain.gain.setValueAtTime(ambient.gain.gain.value, now);
        ambient.gain.gain.linearRampToValueAtTime(ambient.baseGain, now + dur);

        ambient.filter.frequency.cancelScheduledValues(now);
        ambient.filter.frequency.setValueAtTime(ambient.filter.frequency.value, now);
        ambient.filter.frequency.exponentialRampToValueAtTime(ambient.baseFreq, now + dur);
      }

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

      const ambient = ambientBreathNodesRef.current;
      if (ambient) {
        // Bottom of the breath, held empty - ease toward (not all the way
        // to) the resting floor, matching the pacer tone's own restraint here.
        const settled = ambient.baseGain * 0.7;
        ambient.gain.gain.cancelScheduledValues(now);
        ambient.gain.gain.setValueAtTime(ambient.gain.gain.value, now);
        ambient.gain.gain.linearRampToValueAtTime(settled, now + dur);
      }
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
    setPrePractice(null);
    setGuidedReset(null);
    setCheckpoint(null);
    setCheckpointResponse(null);
    setShowDidItHelp(false);
    setShowRecommendation(true);
  };

  // NOVA RECOMMENDATION: picking a need shows Nova's single recommended
  // practice (never three or four equal options) - it does not jump
  // straight into the session. BEFORE THE PRACTICE's comfort screen
  // still sits between this and actually starting.
  const handleNeedSelect = (need: NonNullable<Needs>) => {
    setSelectedNeed(need);
    const practice = recommendPractice(need, { isEveningWindDown: isEveningWindDown(), preferredPractice });
    setRecommendedPractice(practice);
    setShowRecommendation(true);
    setPrePractice(null);
    playZenChime();
  };

  // Lets Anxiety Reset's breathing handoff hand this, the real shared
  // breathing system, a pre-selected need - same window-event pattern as
  // ResetStudio's reset_studio_select_state, so Anxiety Reset never has
  // to duplicate a second breathing engine of its own.
  useEffect(() => {
    const handleSelectNeed = (e: Event) => {
      const detail = (e as CustomEvent<Needs>).detail;
      if (detail && BREATHING_NEED_ORDER.includes(detail)) {
        setActiveSection('breathwork');
        handleNeedSelect(detail);
        document.getElementById('nervous-system-reset-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    };
    window.addEventListener('breathing_reset_select_need', handleSelectNeed);
    return () => window.removeEventListener('breathing_reset_select_need', handleSelectNeed);
  }, [preferredPractice]);

  // Shared by the Nova recommendation screen, the library, and Guided
  // Reset Mode's "slow the body" step - always the same comfort screen
  // between choosing a practice and actually starting it.
  const handleChoosePractice = (practiceId: BreathingPracticeId) => {
    setPrePractice(practiceId);
    setShowRecommendation(false);
  };

  const handleBeginPractice = () => {
    if (!prePractice) return;
    ensureAudioContext();
    setActiveMode(prePractice);
    setPrePractice(null);
    breathingSessionStartRef.current = Date.now();
    midSessionPromptShownRef.current = false;
    setIsPlaying(true);
  };

  const handleUseGroundingInstead = () => {
    setPrePractice(null);
    setGuidedReset(null);
    setActiveSection('grounding');
  };

  // Shared by the Pause button and the mid-session "Finish Here" option -
  // a real session (>=60s) always ends at the POST-SESSION RESET
  // CHECKPOINT rather than silently logging in the background.
  const handlePauseOrFinish = async () => {
    setIsPlaying(false);
    if (midSessionTimeoutRef.current) clearTimeout(midSessionTimeoutRef.current);
    setShowMidSessionPrompt(false);
    const startedAt = breathingSessionStartRef.current;
    breathingSessionStartRef.current = null;
    if (!startedAt || !activeMode) return;
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    if (elapsedSeconds < 60) { setActiveMode(null); return; }
    if (guidedResetActiveRef.current) {
      // Guided Reset Mode handles its own next step instead of the
      // standalone checkpoint - fewer decisions for someone this overwhelmed.
      setActiveMode(null);
      markResetComplete(BREATHING_LIBRARY[activeMode].name, `${Math.round(elapsedSeconds / 60)} minute(s) of practice.`);
      setGuidedReset((prev) => prev ? { ...prev, step: 'reduce_noise' } : prev);
      return;
    }
    setCheckpoint({ toolName: BREATHING_LIBRARY[activeMode].name, practiceId: activeMode, durationSeconds: elapsedSeconds });
    setActiveMode(null);
  };

  const handleCheckpointResponse = async (response: CheckpointResponse) => {
    setCheckpointResponse(response);
    if (!checkpoint) return;
    markResetComplete(checkpoint.toolName, `${Math.round(checkpoint.durationSeconds / 60)} minute(s) of practice.`);
    if (auth.currentUser && checkpoint.practiceId) {
      const sessionId = await recordBreathingSession(auth.currentUser.uid, {
        practiceId: checkpoint.practiceId, durationSeconds: checkpoint.durationSeconds, checkpointResponse: response,
      }).catch(() => null);
      setCheckpointSessionId(sessionId);
    }
  };

  // Only once the checkpoint itself has actually closed (not when the
  // user is navigating off to another tool entirely) do we check whether
  // this is the occasional moment to ask "Did it help?" - DID IT HELP?:
  // "Do not ask after every session."
  const closeCheckpointThenMaybeAsk = async (response: CheckpointResponse | null) => {
    setCheckpoint(null);
    setCheckpointResponse(null);
    if (!auth.currentUser || !response) return;
    const priorTotal = await recordBreathingSessionCompletion(auth.currentUser.uid).catch(() => 0);
    if (shouldAskDidItHelp(priorTotal - 1, response)) setShowDidItHelp(true);
  };

  const handleCheckpointOptionSelect = (optionId: string) => {
    const response = checkpointResponse;
    switch (optionId) {
      case 'grounding':
      case 'use_grounding':
      case 'try_grounding':
        setCheckpoint(null); setCheckpointResponse(null); setGuidedReset(null);
        setActiveSection('grounding');
        return;
      case 'make_it_smaller':
      case 'remove_one_thing':
        window.dispatchEvent(new CustomEvent('reset_studio_select_state', { detail: 'flooded' }));
        setCheckpoint(null); setCheckpointResponse(null);
        return;
      case 'talk_to_nova':
        window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'nova' }));
        setCheckpoint(null); setCheckpointResponse(null);
        return;
      case 'quick_support':
        window.dispatchEvent(new CustomEvent('open_crisis_support'));
        setCheckpoint(null); setCheckpointResponse(null);
        return;
      case 'one_more_minute': {
        const practiceId = checkpoint?.practiceId;
        setCheckpoint(null); setCheckpointResponse(null);
        if (practiceId) handleChoosePractice(practiceId);
        return;
      }
      default:
        // good_for_now / smaller_next_step / sit_30_seconds / finish_now
        // - all stay right here, so this is the moment to maybe ask.
        closeCheckpointThenMaybeAsk(response);
    }
  };

  const handleDidItHelp = (helpful: BreathingHelpfulness) => {
    setDidItHelpAnswered(true);
    if (auth.currentUser && checkpointSessionId) {
      updateBreathingSessionFeedback(auth.currentUser.uid, checkpointSessionId, { helpful }).catch(() => {});
    }
    setTimeout(() => { setShowDidItHelp(false); setDidItHelpAnswered(false); setCheckpointSessionId(null); }, 1200);
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

  // All grounding steps checked off is a genuine completion, same as a
  // full-length breathing session above - guarded so toggling steps back
  // and forth after finishing doesn't fire this repeatedly.
  useEffect(() => {
    if (!activeGrounding) {
      groundingCompletionFiredRef.current = false;
      return;
    }
    const totalSteps = GROUNDING_MODES[activeGrounding].instructions.length;
    if (completedSteps.length >= totalSteps && totalSteps > 0 && !groundingCompletionFiredRef.current) {
      groundingCompletionFiredRef.current = true;
      markResetComplete(GROUNDING_MODES[activeGrounding].name, 'All grounding steps completed.');
    }
  }, [completedSteps, activeGrounding]);

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

  // MID-SESSION OPTION: a single, low-friction check-in partway through a
  // longer session - never shown twice in the same session.
  useEffect(() => {
    if (!isPlaying || midSessionPromptShownRef.current) return;
    midSessionTimeoutRef.current = setTimeout(() => {
      midSessionPromptShownRef.current = true;
      setShowMidSessionPrompt(true);
    }, 90000);
    return () => { if (midSessionTimeoutRef.current) clearTimeout(midSessionTimeoutRef.current); };
  }, [isPlaying]);

  return (
    <div id="nervous-system-reset-section" className="space-y-12 pb-24">
      {/* Reset Confirmation Dialog Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface/60 backdrop-blur-sm">
            <motion.div
              ref={resetDialogRef as any}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-confirm-title"
              tabIndex={-1}
              className="bg-white dark:bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-lg space-y-6"
            >
              <div className="space-y-2">
                <h4 id="reset-confirm-title" className="text-xl font-display font-medium text-text-main">Reset Studio State?</h4>
                <p className="text-sm text-text-muted leading-relaxed">
                  Are you sure you want to clear your active check-in choices, ongoing breathwork routines, and grounding toolkit selections? This action will reset your studio work-in-progress state.
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
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-destructive hover:bg-destructive/90 text-destructive-foreground cursor-pointer"
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
           <div className="tag">Breathing &amp; Guided Reset · Core Pillar: Rebuild</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Reset Studio</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              Fast support when your system feels overloaded.
            </p>
          </div>
          {(selectedNeed || activeMode || activeGrounding || isPlaying) && (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 text-xs font-black uppercase tracking-widest text-destructive dark:text-[#f87171] hover:bg-destructive/10 border border-destructive/30 rounded-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Studio
            </button>
          )}
        </div>
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

      {/* Soundscape player */}
      <div className="card border border-primary/20 bg-primary/5 p-6 relative overflow-hidden mb-8">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <h4 className="text-xs font-medium uppercase tracking-widest text-text-muted">Background Sound</h4>
            </div>
            <p className="text-sm font-bold text-text-main flex items-center gap-1.5">
              <Music className="w-4 h-4 text-primary" /> Ambient Sound
            </p>
            <p className="text-[11px] text-text-muted">
              Use as much or as little sound as you want.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wider font-medium text-text-muted">Choose a Sound</span>
              <div className="flex bg-surface dark:bg-surface rounded-xl p-1 border border-border/50">
                {(['none', 'solfeggio', 'wind', 'waves', 'cosmic'] as const).map((sc) => (
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
                    {SOUNDSCAPE_LABELS[sc]}
                  </button>
                ))}
              </div>
              {(soundscape === 'wind' || soundscape === 'waves') && (
                <span className="text-[10px] text-text-muted">Breathes with you — swells on inhale, settles on exhale.</span>
              )}
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
                  aria-label={isMuted ? "Unmute ambient sound" : "Mute ambient sound"}
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
                  aria-label="Ambient volume"
                  aria-valuetext={`${Math.round(ambientVol * 100)} percent`}
                  className="w-full accent-primary bg-border dark:bg-surface h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 w-36">
              <div className="flex justify-between items-center text-xs uppercase tracking-wider font-black text-text-muted">
                <span>Breathing Cue</span>
                <span className="text-[11px] text-[#9a3412] dark:text-primary font-bold">{pacerSoundEnabled ? "Active" : "Disabled"}</span>
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
                    aria-label="Enable pacer sound"
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-surface dark:bg-surface peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 peer-focus-visible:ring-offset-1 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary" />
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
                  aria-label="Pacer sound volume"
                  aria-valuetext={`${Math.round(pacerVol * 100)} percent`}
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
      {shouldSuggestLoadIsRealProblem(resetsToday, energyDeltaNegative) && !checkpoint && !guidedReset && !showDidItHelp && (
        <div className="card border border-warning/30 bg-warning/5 p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-text-main font-medium max-w-xl">
            You've used a few resets today, but your load is still running above your capacity. Another breathing exercise may not be the answer.
          </p>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'recover' }))}
            className="btn-primary py-2.5 px-5 text-xs shrink-0 flex items-center gap-2"
          >
            <MinusCircle className="w-4 h-4" /> Help Me Remove One Thing
          </button>
        </div>
      )}

      {guidedReset ? (
        <GuidedResetPanel
          guidedReset={guidedReset}
          setGuidedReset={setGuidedReset}
          onChoosePractice={handleChoosePractice}
          onExit={() => { guidedResetActiveRef.current = false; setGuidedReset(null); }}
          onUseGrounding={handleUseGroundingInstead}
        />
      ) : checkpoint ? (
        <CheckpointPanel
          checkpoint={checkpoint}
          response={checkpointResponse}
          onRespond={handleCheckpointResponse}
          onSelectOption={handleCheckpointOptionSelect}
        />
      ) : showDidItHelp ? (
        <DidItHelpPanel answered={didItHelpAnswered} onAnswer={handleDidItHelp} />
      ) : prePractice ? (
        <div className="card border border-primary/20 bg-primary/5 p-8 sm:p-12 mb-8 text-center space-y-6">
          <h4 className="text-2xl font-display font-bold text-text-main">Your Reset</h4>
          <div className="space-y-2 max-w-md mx-auto text-text-muted text-sm leading-relaxed">
            <p>You don't need to breathe perfectly.</p>
            <p>Let the animation guide you. Keep the breath comfortable.</p>
            <p>If breath-holding or deeper breathing feels uncomfortable, stop and switch to grounding instead.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={handleBeginPractice} className="btn-primary py-3 px-8 text-sm">Start</button>
            <button onClick={handleUseGroundingInstead} className="px-6 py-3 text-sm font-bold text-text-muted hover:text-text-main">
              Use Grounding Instead
            </button>
          </div>
        </div>
      ) : (
      <>
      {showRecommendation ? (
        <div className="card border border-primary/20 bg-primary/5 p-8 relative overflow-hidden mb-8">
          <div className="relative z-10 space-y-6">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h4 className="text-xl font-display font-medium text-text-main">Nova recommends</h4>
              </div>

              <p className="text-lg text-text-muted">What do you need right now?</p>

              <div className="flex flex-wrap gap-3">
                {BREATHING_NEED_ORDER.map((need) => (
                  <button
                    key={need}
                    onClick={() => handleNeedSelect(need)}
                    aria-pressed={selectedNeed === need}
                    className={cn(
                      "px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-widest transition-all",
                      selectedNeed === need
                        ? "bg-primary text-primary-foreground scale-105"
                        : "bg-white/5 dark:bg-surface text-text-muted hover:bg-white/10 dark:hover:bg-surface border border-border/50"
                    )}
                  >
                    {BREATHING_NEED_LABELS[need]}
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-border/30 space-y-3">
                <p className="text-2xl font-display font-bold text-text-main">{BREATHING_LIBRARY[recommendedPractice].name}</p>
                <p className="text-sm text-text-muted">{BREATHING_LIBRARY[recommendedPractice].description}</p>
                {preferredPractice === recommendedPractice && (
                  <p className="text-xs font-bold text-primary">Nova noticed this tends to help you.</p>
                )}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button onClick={() => handleChoosePractice(recommendedPractice)} className="btn-primary py-3 px-6 text-sm">
                    Start {BREATHING_LIBRARY[recommendedPractice].durationLabel.startsWith('30') ? '30-Second' : '2-Minute'} Reset
                  </button>
                  <button onClick={() => setShowRecommendation(false)} className="px-6 py-3 text-sm font-bold text-text-muted hover:text-text-main">
                    Choose Another Practice
                  </button>
                </div>
              </div>

              {effectivenessSignal === 'inconsistent' && (
                <p className="text-xs text-text-muted italic pt-4 border-t border-border/20">
                  Breathing hasn't been especially useful for you lately - grounding or reducing what's on your plate might fit better right now.
                </p>
              )}
          </div>
        </div>
      ) : (
        <div className="mb-8 p-6 rounded-xl border border-destructive/20 bg-destructive/5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="space-y-1 text-left">
              <div className="flex items-center gap-2 text-destructive dark:text-[#f87171] font-black uppercase tracking-wider text-[10px]">
                <ShieldAlert className="w-3.5 h-3.5" /> Feeling very overwhelmed right now?
              </div>
              <p className="text-xs text-text-muted max-w-xl leading-relaxed">
                If your thoughts are racing or everything feels too much, start with a guided reset.
              </p>
            </div>
            <div className="flex gap-3 shrink-0">
              <button onClick={() => { guidedResetActiveRef.current = true; setGuidedReset({ step: 'intensity', intensity: null }); }} className="btn-primary py-2.5 px-5 text-xs">
                Start Guided Reset
              </button>
              <button
                onClick={() => { const el = document.getElementById('breathwork-library'); el?.scrollIntoView({ behavior: 'smooth' }); }}
                className="px-4 py-2.5 text-xs font-bold text-text-muted hover:text-text-main border border-border rounded-xl"
              >
                Browse Breathing Tools
              </button>
            </div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'anxiety_reset' }))}
            className="text-[10px] text-text-muted/70 hover:text-text-muted underline underline-offset-2"
          >
            Need a more structured walkthrough? Try the Anxiety &amp; Overwhelm Reset.
          </button>
        </div>
      )}

      <div id="breathwork-library" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <button onClick={() => setShowRecommendation(true)} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Nova's Recommendation
          </button>
          {Array.from(new Set(BREATHING_LIBRARY_ORDER.map((id) => BREATHING_LIBRARY[id].category))).map((category) => (
            <div key={category} className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-widest text-text-muted">{category}</h4>
              {BREATHING_LIBRARY_ORDER.filter((id) => BREATHING_LIBRARY[id].category === category).map((id) => {
                const mode = BREATHING_LIBRARY[id];
                const isSelected = activeMode === id;
                const Icon = BREATHING_CYCLE[id].icon;
                return (
                  <button
                    key={id}
                    onClick={() => handleChoosePractice(id)}
                    aria-pressed={isSelected}
                    className={cn(
                      "w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4",
                      isSelected
                        ? "bg-primary/10 border-primary/30"
                        : "bg-transparent border-transparent hover:border-border/50 opacity-70 hover:opacity-100"
                    )}
                  >
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0", isSelected ? "bg-primary text-primary-foreground" : "bg-white/10 text-text-main")}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="font-bold text-text-main font-display flex items-center gap-2">
                        {mode.name}
                        {mode.badge && <span className="text-[9px] font-black uppercase tracking-widest text-primary">{mode.badge}</span>}
                      </h5>
                      <p className="text-xs text-text-muted mt-1 line-clamp-1">{mode.description}</p>
                      <p className="text-[10px] uppercase tracking-widest text-text-muted/70 font-bold mt-0.5">{mode.durationLabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="lg:col-span-2">
          {activeMode ? (
            <BreathingSession
              practiceId={activeMode}
              isPlaying={isPlaying}
              phase={phase}
              showMidSessionPrompt={showMidSessionPrompt}
              onFinish={handlePauseOrFinish}
              onContinueMidSession={() => setShowMidSessionPrompt(false)}
            />
          ) : (
            <div className="card border border-border h-full flex flex-col items-center justify-center text-center p-6 sm:p-8 md:p-12 min-h-[500px]">
              <div className="w-24 h-24 mb-6 rounded-full bg-surface dark:bg-surface flex items-center justify-center opacity-50">
                <Wind className="w-10 h-10 text-text-muted" />
              </div>
              <h3 className="text-2xl font-display font-bold text-text-main mb-4">Choose a Practice</h3>
              <p className="text-sm font-medium text-text-muted max-w-md mx-auto">
                Talk with Nova above or select a practice from the library to begin.
              </p>
            </div>
          )}
        </div>
      </div>
      </>
      )}
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
                  setCompletedSteps([]);
                }}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all flex items-center gap-4",
                  isSelected
                    ? "bg-primary/10 border-primary/30"
                    : "bg-transparent border-transparent hover:border-border/50 opacity-70 hover:opacity-100"
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
            <div className="card border border-border p-6 sm:p-8 md:p-12 h-full flex flex-col items-center justify-center relative overflow-hidden min-h-[500px]">
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
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleToggleStep(idx);
                          }
                        }}
                        role="checkbox"
                        aria-checked={isCompleted}
                        tabIndex={0}
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
                            : "bg-primary/10 text-[#9a3412] dark:text-primary"
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
            <div className="card border border-border h-full flex flex-col items-center justify-center text-center p-6 sm:p-8 md:p-12 min-h-[500px]">
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

// BREATHING ANIMATION: a soft orb that expands and contracts with the
// breath cycle - soft glow, gentle easing, no hard edges or mechanical
// progress bars. ON-SCREEN BREATHING COPY stays minimal (one phase word
// + one short supporting line). Respects prefers-reduced-motion with a
// static, non-animated equivalent rather than skipping the cue entirely.
const PHASE_LABELS: Record<'inhale' | 'hold1' | 'exhale' | 'hold2', { word: string; support: string }> = {
  inhale: { word: 'Breathe in', support: 'Easy and comfortable.' },
  hold1: { word: 'Let it pause', support: 'Only if it feels natural.' },
  exhale: { word: 'Let go', support: 'Slowly. No forcing.' },
  hold2: { word: 'Again', support: 'Nothing to achieve. Just stay with the next breath.' },
};

const BreathingSession = ({ practiceId, isPlaying, phase, showMidSessionPrompt, onFinish, onContinueMidSession }: {
  practiceId: BreathingPracticeId;
  isPlaying: boolean;
  phase: 'inhale' | 'hold1' | 'exhale' | 'hold2';
  showMidSessionPrompt: boolean;
  onFinish: () => void;
  onContinueMidSession: () => void;
}) => {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const practice = BREATHING_LIBRARY[practiceId];
  const cycle = BREATHING_CYCLE[practiceId];
  const expanded = phase === 'inhale' || phase === 'hold1';
  const label = PHASE_LABELS[phase];

  return (
    <div className="card border border-border p-6 sm:p-8 md:p-12 h-full flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[500px]">
      <div className="absolute top-8 left-8 text-left">
        <span className="tag mb-4">{practice.name}</span>
        <p className="text-sm font-medium text-text-muted mt-4 max-w-sm">{cycle.instruction}</p>
      </div>

      {showMidSessionPrompt && (
        <div className="absolute top-20 sm:top-8 right-6 left-6 sm:left-auto sm:w-80 z-20 p-5 rounded-2xl border border-border bg-background shadow-xl text-left space-y-3">
          <p className="text-sm text-text-main font-medium">That's enough effort. Let the breathing do less, not more.</p>
          <div className="flex gap-2">
            <button onClick={onContinueMidSession} className="px-4 py-2 rounded-lg bg-surface text-xs font-bold text-text-main">Continue</button>
            <button onClick={onFinish} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold">Finish Here</button>
          </div>
        </div>
      )}

      <div className="relative w-64 h-64 flex items-center justify-center my-12">
        {reducedMotion ? (
          <div className="w-40 h-40 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
            {isPlaying && <span role="status" aria-live="polite" className="text-text-main font-bold text-base">{label.word}</span>}
          </div>
        ) : (
          <>
            <motion.div
              className="absolute inset-0 bg-primary/15 rounded-full"
              style={{ filter: 'blur(40px)' }}
              animate={isPlaying ? { scale: expanded ? 1.4 : 0.85, opacity: expanded ? 0.7 : 0.25 } : { scale: 0.9, opacity: 0.15 }}
              transition={{ duration: phase === 'inhale' || phase === 'exhale' ? 4 : 1.2, ease: [0.45, 0, 0.2, 1] }}
            />
            <motion.div
              className="w-28 h-28 rounded-full relative z-10 bg-primary shadow-2xl shadow-primary/30"
              animate={isPlaying ? { scale: expanded ? 1.6 : 1 } : { scale: 1 }}
              transition={{ duration: phase === 'inhale' || phase === 'exhale' ? 4 : 1.2, ease: [0.45, 0, 0.2, 1] }}
            />
            <div className="absolute inset-0 border border-primary/10 rounded-full scale-[1.4]" />
          </>
        )}

        {isPlaying && (
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-x-0 -bottom-16 text-center"
            >
              <p role="status" aria-live="polite" aria-atomic="true" className="text-text-main font-display font-medium text-xl">{label.word}</p>
              <p className="text-xs text-text-muted mt-1">{label.support}</p>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <button onClick={onFinish} className="mt-16 flex items-center gap-3 px-8 py-4 bg-text-main text-background rounded-full font-bold uppercase tracking-widest hover:scale-105 transition-transform">
        <CheckCircle2 className="w-5 h-5" /> Finish
      </button>
    </div>
  );
};

// GUIDED RESET MODE: the more overwhelmed the user appears, the fewer
// decisions each step offers (maxChoicesForIntensity) - never analytics,
// educational content or long menus for someone this overwhelmed.
const GuidedResetPanel = ({ guidedReset, setGuidedReset, onChoosePractice, onExit }: {
  guidedReset: { step: 'intensity' | GuidedResetStepId; intensity: OverwhelmIntensity | null };
  setGuidedReset: (next: { step: 'intensity' | GuidedResetStepId; intensity: OverwhelmIntensity | null } | null) => void;
  onChoosePractice: (id: BreathingPracticeId) => void;
  onExit: () => void;
  onUseGrounding: () => void;
}) => {
  const { step, intensity } = guidedReset;
  const maxChoices = intensity ? maxChoicesForIntensity(intensity) : 3;

  return (
    <div className="card border border-destructive/20 bg-destructive/5 p-8 sm:p-12 space-y-8 text-center relative">
      <button onClick={onExit} className="absolute top-6 left-6 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted hover:text-text-main">
        <ArrowLeft className="w-3.5 h-3.5" /> Exit Guided Reset
      </button>

      {step === 'intensity' && (
        <div className="space-y-6 pt-10">
          <h4 className="text-2xl font-display font-bold text-text-main">How activated do you feel?</h4>
          <div className="flex flex-wrap justify-center gap-3">
            {OVERWHELM_INTENSITY_ORDER.map((id) => (
              <button
                key={id}
                onClick={() => setGuidedReset({ step: 'slow_body', intensity: id })}
                className="px-6 py-3 rounded-full border border-border hover:border-primary/50 font-bold text-text-main"
              >
                {OVERWHELM_INTENSITY_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'slow_body' && (
        <div className="space-y-6 pt-10">
          <h4 className="text-2xl font-display font-bold text-text-main">Let's slow the body first.</h4>
          <p className="text-sm text-text-muted">No need to think. Just pick one.</p>
          <div className="flex flex-wrap justify-center gap-3">
            {GUIDED_RESET_PRACTICES.slice(0, maxChoices).map((id) => (
              <button
                key={id}
                onClick={() => onChoosePractice(id)}
                className="px-6 py-3 rounded-full border border-border hover:border-primary/50 font-bold text-text-main"
              >
                {BREATHING_LIBRARY[id].name}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'reduce_noise' && (
        <div className="space-y-6 pt-10">
          <h4 className="text-2xl font-display font-bold text-text-main">Now let's reduce the noise.</h4>
          <p className="text-sm text-text-muted max-w-md mx-auto">
            {maxChoices === 1
              ? "You don't need to think about anything else right now."
              : "If something's crowding your head, you could unload it. Otherwise, just continue."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {maxChoices > 1 && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('reset_studio_select_state', { detail: 'scattered' }))}
                className="px-6 py-3 rounded-full border border-border hover:border-primary/50 font-bold text-text-main"
              >
                Unload My Thoughts
              </button>
            )}
            <button onClick={() => setGuidedReset({ step: 'next_step', intensity })} className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold">
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 'next_step' && (
        <div className="space-y-6 pt-10">
          <h4 className="text-2xl font-display font-bold text-text-main">The next safe step.</h4>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={onExit} className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold">I'm okay to continue</button>
            {maxChoices > 1 && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open_crisis_support'))}
                className="px-6 py-3 rounded-full border border-border hover:border-primary/50 font-bold text-text-main flex items-center gap-2"
              >
                <LifeBuoy className="w-4 h-4" /> Quick Support
              </button>
            )}
            {maxChoices > 2 && (
              <button
                onClick={() => setGuidedReset({ step: 'intensity', intensity: null })}
                className="px-6 py-3 rounded-full border border-border hover:border-primary/50 font-bold text-text-main"
              >
                Stay here a little longer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// POST-SESSION RESET CHECKPOINT - mandatory after every completed
// session, closing the loop between intervention and outcome.
const CheckpointPanel = ({ checkpoint, response, onRespond, onSelectOption }: {
  checkpoint: { toolName: string; practiceId: BreathingPracticeId | null; durationSeconds: number };
  response: CheckpointResponse | null;
  onRespond: (r: CheckpointResponse) => void;
  onSelectOption: (optionId: string) => void;
}) => {
  const branch = response ? CHECKPOINT_BRANCHES[response] : null;
  return (
    <div className="card border border-primary/20 bg-primary/5 p-8 sm:p-12 text-center space-y-6">
      {!response || !branch ? (
        <>
          <h4 className="text-2xl font-display font-bold text-text-main">Reset Complete</h4>
          <p className="text-xs uppercase tracking-widest font-bold text-text-muted">{checkpoint.toolName}</p>
          <p className="text-sm text-text-muted max-w-sm mx-auto">Don't rush straight back into everything. Give yourself a second.</p>
          <p className="text-lg font-medium text-text-main pt-4">Where are you now?</p>
          <div className="flex flex-wrap justify-center gap-3">
            {CHECKPOINT_RESPONSE_ORDER.map((r) => (
              <button key={r} onClick={() => onRespond(r)} className="px-5 py-3 rounded-full border border-border hover:border-primary/50 font-bold text-text-main">
                {CHECKPOINT_RESPONSE_LABELS[r]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-lg font-medium text-text-main">{branch.novaLine}</p>
          {branch.supportingLine && <p className="text-sm text-text-muted">{branch.supportingLine}</p>}
          {branch.followUpQuestion && <p className="text-sm text-text-muted pt-2">{branch.followUpQuestion}</p>}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {branch.options.map((optionId) => (
              <button key={optionId} onClick={() => onSelectOption(optionId)} className="px-5 py-3 rounded-full border border-border hover:border-primary/50 font-bold text-text-main flex items-center gap-2">
                {optionId === 'quick_support' && <LifeBuoy className="w-4 h-4" />}
                {(optionId === 'remove_one_thing' || optionId === 'make_it_smaller') && <MinusCircle className="w-4 h-4" />}
                {CHECKPOINT_OPTION_LABELS[optionId]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// DID IT HELP? - occasional, gated by shouldAskDidItHelp, never a fake
// effectiveness percentage.
const DidItHelpPanel = ({ answered, onAnswer }: { answered: boolean; onAnswer: (h: BreathingHelpfulness) => void }) => (
  <div className="card border border-border p-8 text-center space-y-4">
    {!answered ? (
      <>
        <p className="text-lg font-medium text-text-main">Did this practice feel useful?</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => onAnswer('yes')} className="px-5 py-2.5 rounded-full border border-border hover:border-primary/50 font-bold text-text-main">Yes</button>
          <button onClick={() => onAnswer('a_little')} className="px-5 py-2.5 rounded-full border border-border hover:border-primary/50 font-bold text-text-main">A little</button>
          <button onClick={() => onAnswer('not_really')} className="px-5 py-2.5 rounded-full border border-border hover:border-primary/50 font-bold text-text-main">Not really</button>
        </div>
      </>
    ) : (
      <p className="text-sm text-text-muted">Noted - thank you.</p>
    )}
  </div>
);
