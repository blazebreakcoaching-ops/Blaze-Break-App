import { useCallback, useEffect, useRef, useState } from 'react';
import { auth, getAppCheckToken } from './firebase';
import { secureApiFetch } from './secure-api';
import { buildContinuityPreamble, VoiceSessionRecord } from '../../voice-continuity';

// One shared home for the real-time voice-coach client logic, used by every
// surface that talks to Nova by voice (the full-screen call, the NovaChat
// inline toggle, the OmniNova copilot). Before this existed the logic was
// copy-pasted per component, which is how OmniNova ended up connecting to the
// socket WITHOUT the auth token the server requires - its voice was simply
// broken. Centralising it fixes that once and gives every surface the same
// AudioWorklet capture, streamed playback, barge-in handling, live transcript,
// and calm in-UI errors (never a browser alert()).

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface TranscriptLine {
  role: 'user' | 'nova';
  text: string;
}

export interface UseNovaLiveVoiceOptions {
  // Optional context to prime the session with before the person speaks
  // (burnout fingerprint, recent chat, Nova's memory of them). Returned as a
  // plain string; the server forwards it with turnComplete:false so Nova has
  // it in mind without treating it as a turn to answer.
  buildInitialPrompt?: () => string;
  // Called once when the session ends for any reason, so a host component can
  // reset its own UI. Optional.
  onEnded?: () => void;
}

const CAPTURE_SAMPLE_RATE = 16000; // what the Gemini Live API expects for input
const PLAYBACK_SAMPLE_RATE = 24000; // what the model streams back

function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

export function useNovaLiveVoice(options: UseNovaLiveVoiceOptions = {}) {
  const { buildInitialPrompt, onEnded } = options;

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isNovaSpeaking, setIsNovaSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [elapsedMs, setElapsedMs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const legacyProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutedRef = useRef(false);
  const endedByUserRef = useRef(false);
  // Continuity: count Nova's turns for the session record, and remember
  // whether a call actually connected so we only record real calls once.
  const turnCountRef = useRef(0);
  const connectedRef = useRef(false);
  const recordedRef = useRef(false);
  const continuityPreambleRef = useRef('');
  // The role of the last transcript fragment, so incremental fragments extend
  // the current line and a change of speaker starts a new one.
  const lastTranscriptRoleRef = useRef<'user' | 'nova' | null>(null);

  const cleanupAudio = useCallback(() => {
    if (speakingTimerRef.current) { clearTimeout(speakingTimerRef.current); speakingTimerRef.current = null; }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    scheduledSourcesRef.current.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    scheduledSourcesRef.current = [];
    if (workletRef.current) { try { workletRef.current.disconnect(); } catch { /* noop */ } workletRef.current.port.onmessage = null; workletRef.current = null; }
    if (legacyProcessorRef.current) { try { legacyProcessorRef.current.disconnect(); } catch { /* noop */ } legacyProcessorRef.current.onaudioprocess = null; legacyProcessorRef.current = null; }
    if (sourceRef.current) { try { sourceRef.current.disconnect(); } catch { /* noop */ } sourceRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /* noop */ } audioCtxRef.current = null; }
  }, []);

  // Records METADATA only (duration + turn count), once, and only for a call
  // that actually connected - never transcript content. Fire-and-forget: a
  // failed record must never disrupt ending a call.
  const recordSession = useCallback(() => {
    if (!connectedRef.current || recordedRef.current) return;
    recordedRef.current = true;
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    void secureApiFetch('/api/nova/voice-sessions', {
      method: 'POST',
      data: { durationMs, turnCount: turnCountRef.current },
    }).catch(() => { /* continuity is best-effort */ });
  }, []);

  const stop = useCallback(() => {
    endedByUserRef.current = true;
    recordSession();
    if (wsRef.current) { try { wsRef.current.close(); } catch { /* noop */ } wsRef.current = null; }
    cleanupAudio();
    setIsNovaSpeaking(false);
    setStatus('idle');
    setElapsedMs(0);
    onEnded?.();
  }, [cleanupAudio, onEnded, recordSession]);

  const appendTranscript = useCallback((role: 'user' | 'nova', text: string) => {
    setTranscript((prev) => {
      if (lastTranscriptRoleRef.current === role && prev.length > 0) {
        const next = prev.slice();
        next[next.length - 1] = { role, text: next[next.length - 1].text + text };
        return next;
      }
      lastTranscriptRoleRef.current = role;
      return [...prev, { role, text }];
    });
  }, []);

  const playChunk = useCallback((base64: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const numSamples = bytes.length / 2;
    const audioBuffer = ctx.createBuffer(1, numSamples, PLAYBACK_SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < numSamples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    if (nextStartTimeRef.current < ctx.currentTime) nextStartTimeRef.current = ctx.currentTime;
    src.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
    scheduledSourcesRef.current.push(src);
    src.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter((s) => s !== src);
    };

    setIsNovaSpeaking(true);
    // Settle the speaking indicator shortly after the currently-scheduled
    // audio is due to finish, unless more arrives first.
    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
    const msUntilDone = Math.max(0, (nextStartTimeRef.current - ctx.currentTime) * 1000) + 150;
    speakingTimerRef.current = setTimeout(() => setIsNovaSpeaking(false), msUntilDone);
  }, []);

  const handleInterrupt = useCallback(() => {
    // Barge-in: the person started talking over Nova. Stop everything already
    // scheduled so Nova goes quiet immediately, and reset the playback clock.
    scheduledSourcesRef.current.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    scheduledSourcesRef.current = [];
    if (audioCtxRef.current) nextStartTimeRef.current = audioCtxRef.current.currentTime;
    setIsNovaSpeaking(false);
    lastTranscriptRoleRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (status === 'connecting' || status === 'live') return;
    endedByUserRef.current = false;
    connectedRef.current = false;
    recordedRef.current = false;
    turnCountRef.current = 0;
    setError(null);
    setTranscript([]);
    lastTranscriptRoleRef.current = null;
    setStatus('connecting');

    try {
      if (!auth.currentUser) throw new Error('needs-auth');
      const idToken = await auth.currentUser.getIdToken();
      let appCheckToken = '';
      try { appCheckToken = await getAppCheckToken(); } catch { /* dev bypass allowed server-side */ }

      // Fetch past-call metadata so Nova can open as someone who knows this
      // person. Best-effort: continuity is a nicety, never a blocker.
      continuityPreambleRef.current = '';
      try {
        const res = await secureApiFetch('/api/nova/voice-sessions', { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          continuityPreambleRef.current = buildContinuityPreamble((data.sessions || []) as VoiceSessionRecord[], Date.now());
        }
      } catch { /* proceed without continuity */ }

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://${window.location.host}/api/nova/live?token=${encodeURIComponent(idToken)}&appCheckToken=${encodeURIComponent(appCheckToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: CAPTURE_SAMPLE_RATE });
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      nextStartTimeRef.current = ctx.currentTime;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const sendPcm = (buffer: ArrayBuffer) => {
        if (mutedRef.current) return;
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ audio: base64FromArrayBuffer(buffer) }));
      };

      // Prefer AudioWorklet (capture off the main thread); fall back to the
      // deprecated ScriptProcessor only where the worklet API is unavailable.
      let usingWorklet = false;
      if (ctx.audioWorklet) {
        try {
          await ctx.audioWorklet.addModule(new URL('./pcm-capture-processor.js', import.meta.url));
          const node = new AudioWorkletNode(ctx, 'pcm-capture-processor');
          node.port.onmessage = (ev: MessageEvent) => sendPcm(ev.data as ArrayBuffer);
          source.connect(node);
          node.connect(ctx.destination); // node emits silence, so no echo
          workletRef.current = node;
          usingWorklet = true;
        } catch {
          usingWorklet = false;
        }
      }
      if (!usingWorklet) {
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          const buffer = new ArrayBuffer(input.length * 2);
          const view = new DataView(buffer);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
          }
          sendPcm(buffer);
        };
        source.connect(processor);
        processor.connect(ctx.destination);
        legacyProcessorRef.current = processor;
      }

      ws.onopen = () => {
        setStatus('live');
        connectedRef.current = true;
        startedAtRef.current = Date.now();
        setElapsedMs(0);
        elapsedTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
        // Continuity preamble (if any) leads, then the caller's own context.
        const initial = [continuityPreambleRef.current, buildInitialPrompt?.() || ''].filter(Boolean).join('\n\n');
        if (initial) ws.send(JSON.stringify({ initialPrompt: initial }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.audio) playChunk(msg.audio);
          if (msg.interrupted) handleInterrupt();
          if (msg.userTranscript) appendTranscript('user', msg.userTranscript);
          if (msg.novaTranscript) appendTranscript('nova', msg.novaTranscript);
          if (msg.turnComplete) { lastTranscriptRoleRef.current = null; turnCountRef.current += 1; }
          if (msg.error) {
            setError(msg.error);
            setStatus('error');
            endedByUserRef.current = true; // server already ended it; don't double-report
            cleanupAudio();
            try { ws.close(); } catch { /* noop */ }
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onerror = () => {
        if (endedByUserRef.current) return;
        setError('The voice connection dropped. You can try reconnecting.');
        setStatus('error');
        cleanupAudio();
      };

      ws.onclose = () => {
        recordSession(); // covers server-ended calls too; idempotent
        cleanupAudio();
        if (!endedByUserRef.current && status !== 'error') {
          setError('The voice session ended unexpectedly. You can reconnect when you’re ready.');
          setStatus('error');
        }
        setIsNovaSpeaking(false);
      };
    } catch (e: any) {
      cleanupAudio();
      if (e?.message === 'needs-auth') {
        setError('You need to be signed in to talk with Nova.');
      } else if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        setError('Nova needs microphone access for a voice call. Enable it in your browser settings and try again.');
      } else if (e?.name === 'NotFoundError') {
        setError('No microphone was found. Connect one and try again.');
      } else {
        setError('Couldn’t start the voice session. Please try again.');
      }
      setStatus('error');
    }
  }, [status, buildInitialPrompt, playChunk, handleInterrupt, appendTranscript, cleanupAudio, recordSession]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setIsMuted(mutedRef.current);
  }, []);

  // Tear everything down if the host component unmounts mid-call.
  useEffect(() => () => {
    endedByUserRef.current = true;
    recordSession();
    if (wsRef.current) { try { wsRef.current.close(); } catch { /* noop */ } wsRef.current = null; }
    cleanupAudio();
  }, [cleanupAudio, recordSession]);

  return { status, error, isNovaSpeaking, isMuted, transcript, elapsedMs, start, stop, toggleMute };
}
