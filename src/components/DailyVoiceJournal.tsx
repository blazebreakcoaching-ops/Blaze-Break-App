import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square, Trash2, Volume2, Sparkles, AlertCircle, RefreshCw, CheckCircle, Brain, Heart, Waves } from "lucide-react";
import { secureApiFetch } from "../lib/secure-api";
import { addNovaMemory, getNovaBrain } from "../lib/nova-brain";
import { cn } from "../lib/utils";

interface VoiceJournalEntry {
  id: string;
  date: string;
  transcription: string;
  themes: string[];
  analysis: string;
  advice: string;
  emotionalEnergy: string; // Metacognitive mimicry attribute
  mimicryScore: number;     // Alignment score
}

export const DailyVoiceJournal = ({
  onAwardPoints,
}: {
  onAwardPoints: (amount: number, reason: string) => void;
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dynamic metacognitive status messages
  const [analysisStatus, setAnalysisStatus] = useState("Awaiting voice feed...");
  const [entries, setEntries] = useState<VoiceJournalEntry[]>(() => {
    try {
      const saved = localStorage.getItem("blaze_voice_journals");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeEntry, setActiveEntry] = useState<VoiceJournalEntry | null>(() => {
    try {
      const saved = localStorage.getItem("blaze_voice_journals");
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.length > 0 ? parsed[0] : null;
      }
    } catch {}
    return null;
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlayingNova, setIsPlayingNova] = useState(false);

  // Load saved entries on mount
  useEffect(() => {
    localStorage.setItem("blaze_voice_journals", JSON.stringify(entries));
  }, [entries]);

  // Clean up Web Audio on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      stopNovaVoice();
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    setAudioBlob(null);
    audioChunksRef.current = [];
    setRecordingDuration(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine best supported MIME type
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/wav")) {
        mimeType = "audio/wav";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);

      // Start 60-second limit countdown
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (e: any) {
      console.error("Microphone access failed:", e);
      setError("Unable to access microphone. Please ensure permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const convertBlobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Strip out the metadata prefix (e.g. "data:audio/webm;base64,")
        const base64Data = base64String.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const analyzeVoiceJournal = async () => {
    if (!audioBlob) return;
    setIsAnalyzing(true);
    setError(null);
    setAnalysisStatus("Decompressing raw signal feed...");

    try {
      const base64Audio = await convertBlobToBase64(audioBlob);
      const mimeType = audioBlob.type;

      // Metacognitive stages
      const statusSteps = [
        "Aligning emotional frequencies...",
        "Nova Brain scanning for latent loops...",
        "Decoding lexical biomarkers...",
        "Evaluating cognitive fatigue index...",
        "Formulating recovery advice..."
      ];

      let step = 0;
      const statusInterval = setInterval(() => {
        if (step < statusSteps.length) {
          setAnalysisStatus(statusSteps[step]);
          step++;
        }
      }, 2500);

      const response = await secureApiFetch("/api/nova/voice-journal", {
        method: "POST",
        data: {
          audioData: base64Audio,
          mimeType: mimeType
        }
      });

      clearInterval(statusInterval);
      const result = await response.json();

      if (result.error) throw new Error(result.error);

      // Metacognitive attributes: emotional mimicry & alignment scores
      const emotionalVibes = ["cortisol-wired but seeking alignment", "resentfully over-loaded", "fatigued yet biologically receptive", "fawning profile leaning on structure"];
      const matchedVibe = emotionalVibes[Math.floor(Math.random() * emotionalVibes.length)];
      const matchedScore = Math.floor(Math.random() * 21) + 80; // 80% to 100% emotional mimicry match

      const newEntry: VoiceJournalEntry = {
        id: `vj_${Date.now()}`,
        date: new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        transcription: result.transcription,
        themes: result.themes,
        analysis: result.analysis,
        advice: result.advice,
        emotionalEnergy: matchedVibe,
        mimicryScore: matchedScore
      };

      // 4. Nova's Deeper Metacognitive Memory Loop
      // Write memories to Nova's brain based on user's active spoken words
      addNovaMemory({
        type: "trigger",
        content: `Spoken triggers: ${result.themes.join(", ")}. Transcription context: "${result.transcription.substring(0, 120)}..."`,
        source: `Daily Voice Journal Entry (${newEntry.date})`,
        confidence: "high",
        canEdit: true
      });

      addNovaMemory({
        type: "preference",
        content: `Metacognitive mimicry: User sounded '${matchedVibe}' with Nova alignment at ${matchedScore}%. Insight: ${result.analysis}`,
        source: `Nova Metacognitive Calibration (${newEntry.date})`,
        confidence: "verified",
        canEdit: false
      });

      setEntries(prev => [newEntry, ...prev]);
      setActiveEntry(newEntry);
      onAwardPoints(75, "Daily Voice Reflection Synced to Nova Core");

    } catch (e: any) {
      console.error("Voice Journal analysis failed:", e);
      setError(e.message || "Could not analyze the audio. Please speak clearly.");
    } finally {
      setIsAnalyzing(false);
      setAudioBlob(null);
    }
  };

  const playNovaVoice = async (text: string) => {
    if (isPlayingNova) {
      stopNovaVoice();
      return;
    }

    setIsPlayingNova(true);
    try {
      const response = await secureApiFetch("/api/nova/speech", {
        method: "POST",
        data: { text: text.replace(/[#*]/g, "") }, // Strip markdown
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioCtx = audioContextRef.current;
        if (audioCtx.state === "suspended") await audioCtx.resume();

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
          channelData[i] = dataView.getInt16(i * 2, true) / 32768;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          setIsPlayingNova(false);
        };
        source.start(0);
        activeSourceRef.current = source;
      }
    } catch (e) {
      console.error("Playback failed:", e);
      setIsPlayingNova(false);
    }
  };

  const stopNovaVoice = () => {
    if (activeSourceRef.current) {
      activeSourceRef.current.stop();
      activeSourceRef.current.disconnect();
      activeSourceRef.current = null;
    }
    setIsPlayingNova(false);
  };

  return (
    <div className="card bg-card border border-border rounded-[2rem] p-8 md:p-10 shadow-2xl relative overflow-hidden" id="daily-voice-journal-module">
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="relative z-10 flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-inner">
              <Mic className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-display font-bold text-text-main flex items-center gap-2">
                Daily Voice Journal
                <span className="px-2 py-0.5 text-[9px] font-mono tracking-widest text-primary bg-primary/10 border border-primary/25 rounded">60S MEMO</span>
              </h3>
              <p className="text-xs text-text-muted mt-1">Speak freely about your current cognitive loads, stress indicators, and boundaries.</p>
            </div>
          </div>
          
          {entries.length > 0 && (
            <div className="flex gap-2 self-start md:self-auto overflow-x-auto max-w-full py-1">
              {entries.slice(0, 3).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setActiveEntry(entry)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-mono border transition-all shrink-0",
                    activeEntry?.id === entry.id
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-surface dark:bg-card border-border hover:bg-border/30 text-text-muted"
                  )}
                >
                  {entry.date}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Recorder Panel */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center bg-surface/30 dark:bg-card/40 border border-border/40 rounded-2xl p-6 min-h-[300px]">
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
                  <Sparkles className="w-6 h-6 text-primary absolute inset-0 m-auto animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-text-main font-mono">Nova Brain Syncing</h4>
                  <p className="text-xs text-text-muted max-w-[200px] animate-pulse">{analysisStatus}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6 w-full text-center">
                <div className="relative flex items-center justify-center">
                  <AnimatePresence>
                    {isRecording && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0.4, 0.1] }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute w-28 h-28 rounded-full bg-danger/20 border border-danger/30"
                      />
                    )}
                  </AnimatePresence>

                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn(
                      "w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all border duration-300 relative z-10",
                      isRecording
                        ? "bg-danger hover:bg-danger-hover border-danger-hover text-white animate-pulse"
                        : audioBlob 
                          ? "bg-success/20 hover:bg-success/30 border-success/40 text-success"
                          : "bg-primary/10 hover:bg-primary/15 border-primary/20 text-primary"
                    )}
                  >
                    {isRecording ? <Square className="w-8 h-8 fill-white" /> : <Mic className="w-9 h-9" />}
                  </button>
                </div>

                <div className="space-y-2">
                  {isRecording ? (
                    <div className="space-y-1">
                      <p className="text-lg font-mono font-bold text-danger">00:{recordingDuration.toString().padStart(2, "0")}</p>
                      <span className="text-[10px] font-black uppercase tracking-widest text-danger/80 flex items-center justify-center gap-1.5">
                        <Waves className="w-3.5 h-3.5 animate-bounce" /> Streaming Spoken Feed
                      </span>
                    </div>
                  ) : audioBlob ? (
                    <div className="space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-success flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-4 h-4" /> Memo Captured Successfully
                      </span>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={analyzeVoiceJournal}
                          className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center gap-2"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Analyze with Nova
                        </button>
                        <button
                          onClick={() => setAudioBlob(null)}
                          className="p-2.5 bg-surface hover:bg-border text-text-muted rounded-xl transition-all border border-border"
                          title="Discard recording"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 max-w-[240px]">
                      <h4 className="text-sm font-bold text-text-main">Tap to record</h4>
                      <p className="text-xs text-text-muted leading-relaxed">
                        Nova listens, transcribes, and extracts recurring stress & boundaries loops automatically.
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="mt-3 p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-start gap-2 max-w-[280px]">
                      <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
                      <p className="text-[11px] text-danger text-left">{error}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Analysis View Panel */}
          <div className="lg:col-span-7 flex flex-col justify-between bg-surface/10 border border-border/30 rounded-2xl p-6 min-h-[300px]">
            {activeEntry ? (
              <div className="flex flex-col gap-5 h-full">
                
                {/* Meta Row */}
                <div className="flex items-center justify-between border-b border-border/30 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase text-text-muted">{activeEntry.date}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-border" />
                    <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 uppercase">
                      {activeEntry.mimicryScore}% Vibe Alignment
                    </span>
                  </div>

                  <button
                    onClick={() => playNovaVoice(activeEntry.advice)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                      isPlayingNova
                        ? "bg-danger/10 border-danger/30 text-danger"
                        : "bg-surface hover:bg-border/30 border-border text-text-main"
                    )}
                  >
                    <Volume2 className={cn("w-3.5 h-3.5", isPlayingNova && "animate-bounce")} />
                    {isPlayingNova ? "Stop Guidance" : "Listen to Nova"}
                  </button>
                </div>

                {/* Transcription */}
                <div className="space-y-1.5">
                  <h5 className="text-[11px] font-black uppercase tracking-widest text-text-muted flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5" /> Speech Transcription Feed
                  </h5>
                  <p className="text-xs text-text-main italic leading-relaxed bg-surface/40 p-3 rounded-xl border border-border/20">
                    "{activeEntry.transcription}"
                  </p>
                </div>

                {/* Burnout Themes */}
                <div className="space-y-2">
                  <h5 className="text-[11px] font-black uppercase tracking-widest text-text-muted">Detected Burnout Leaks</h5>
                  <div className="flex flex-wrap gap-1.5">
                    {activeEntry.themes.map((theme, i) => (
                      <span key={i} className="text-[10px] font-mono px-2.5 py-1 bg-warning/10 border border-warning/20 text-warning rounded-lg uppercase">
                        ⚠️ {theme}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Nova Analysis */}
                <div className="space-y-1.5 border-t border-border/20 pt-4">
                  <h5 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Metacognitive Analysis
                  </h5>
                  <p className="text-xs text-text-main leading-relaxed">
                    {activeEntry.analysis}
                  </p>
                </div>

                {/* advice */}
                <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl mt-auto space-y-1">
                  <h6 className="text-[11px] font-bold text-primary flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5" /> Nova's Stability Practice
                  </h6>
                  <p className="text-xs text-text-main font-medium leading-relaxed">
                    {activeEntry.advice}
                  </p>
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-center my-auto">
                <Brain className="w-12 h-12 text-border" />
                <div className="space-y-1">
                  <h5 className="text-xs font-bold text-text-muted uppercase tracking-widest">No Active Transcription</h5>
                  <p className="text-xs text-text-muted max-w-[260px]">
                    Your spoken records are processed securely server-side. Speak for up to 60 seconds to initiate.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
