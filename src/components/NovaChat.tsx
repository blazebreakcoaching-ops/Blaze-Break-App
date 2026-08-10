import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  User,
  Sparkles,
  Loader2,
  Volume2,
  Mic,
  MicOff,
  VolumeX,
  Target,
  History as HistoryIcon,
  ThumbsUp,
  ThumbsDown,
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "../lib/utils";
import { getNovaBrain, addNovaMemory } from "../lib/nova-brain";
import { secureApiFetch } from "../lib/secure-api";
import { auth, db, getAppCheckToken } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";

interface Message {
  role: "user" | "model";
  parts: [{ text: string }];
  privacyMetadata?: {
    contextTriggered: boolean;
    modulesUsed: string[];
    rationale: string;
  };
}

export const NovaChat = ({
  systemInstruction,
  initialMessage,
  fingerprint,
  onAwardPoints,
  onNavigate,
}: {
  systemInstruction?: string;
  initialMessage?: string;
  fingerprint?: any;
  onAwardPoints?: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
}) => {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem("nova_chat_history");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [flags, setFlags] = useState<{ [key: string]: boolean }>({
    enable_nova_voice: false,
  });

  useEffect(() => {
    const loadFlags = () => {
      try {
        const savedFlags = localStorage.getItem("blaze_feature_flags");
        if (savedFlags) {
          setFlags(JSON.parse(savedFlags));
        }
      } catch (e) {}
    };
    loadFlags();
    window.addEventListener("storage", loadFlags);
    return () => window.removeEventListener("storage", loadFlags);
  }, []);

  const voiceFeatureEnabled = flags.enable_nova_voice;

  const [ratings, setRatings] = useState<{
    [key: number]: "up" | "down" | null;
  }>(() => {
    try {
      const saved = localStorage.getItem("nova_chat_ratings");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [activeFeedbackForm, setActiveFeedbackForm] = useState<number | null>(
    null,
  );
  const [feedbackNotes, setFeedbackNotes] = useState<{ [key: number]: string }>(
    () => {
      try {
        const saved = localStorage.getItem("nova_chat_feedback_notes");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    },
  );
  const [feedbackTag, setFeedbackTag] = useState<{ [key: number]: string }>(
    () => {
      try {
        const saved = localStorage.getItem("nova_chat_feedback_tags");
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    },
  );
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState<{
    [key: number]: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem("nova_chat_feedback_submitted");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const submitFeedbackMemory = (index: number) => {
    const rating = ratings[index];
    const notes = feedbackNotes[index] || "";
    const selectedTag = feedbackTag[index] || "";
    const originalText = messages[index]?.parts[0]?.text || "";
    const truncatedText =
      originalText.length > 55
        ? `${originalText.substring(0, 55)}...`
        : originalText;

    addNovaMemory({
      type: "preference",
      content: `User rated advice as ${rating === "up" ? "Helpful 👍" : "Unhelpful 👎"}.${selectedTag ? ` Highlight: "${selectedTag}".` : ""}${notes ? ` Notes: "${notes}"` : ""} - Checked against baseline prompt sequence.`,
      source: `User Feedback: Refined Match for "${truncatedText}"`,
      confidence: rating === "up" ? "high" : "medium",
      canEdit: true,
    });

    const newSubmitted = { ...isFeedbackSubmitted, [index]: true };
    setIsFeedbackSubmitted(newSubmitted);
    localStorage.setItem(
      "nova_chat_feedback_submitted",
      JSON.stringify(newSubmitted),
    );

    // Persist all other states
    localStorage.setItem("nova_chat_ratings", JSON.stringify(ratings));
    localStorage.setItem(
      "nova_chat_feedback_notes",
      JSON.stringify({ ...feedbackNotes, [index]: notes }),
    );
    localStorage.setItem(
      "nova_chat_feedback_tags",
      JSON.stringify({ ...feedbackTag, [index]: selectedTag }),
    );

    setIsFeedbackSubmitted((prev) => ({ ...prev, [index]: true }));
    setActiveFeedbackForm(null);
    if (onAwardPoints) {
      onAwardPoints(15, "Model Feedback Calibration Loop");
    }
  };

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => {
    const saved = localStorage.getItem("nova_voice_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [isListening, setIsListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [activeToolSuggestion, setActiveToolSuggestion] = useState<{
    name: string;
    tab?: string;
    description: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const [thinkingMessage, setThinkingMessage] = useState(
    "Thinking about your patterns...",
  );

  const thinkingMessages = [
    "Thinking about your patterns...",
    "Drawing on what's worked before...",
    "Looking for where your energy's going...",
    "Considering what's weighing on you...",
    "Checking in with the SHIP framework...",
    "Putting together a next step...",
    "Making sure this actually fits you...",
    "Looking for what will actually help...",
    "Working through the Event vs. Verdict lens...",
    "Considering how hydration might be playing in...",
    "Thinking through your nutrition...",
    "Considering your stress load before that meeting...",
    "Checking in on your nervous system...",
    "Almost there...",
  ];

  // Speech Recognition / Voice Input Dictation State & Hook
  const [isDictating, setIsDictating] = useState(false);
  const dictationRecognitionRef = useRef<any>(null);

  const startDictation = () => {
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert(
          "Voice input is not supported or permission is restricted in this browser environment.",
        );
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsDictating(true);
      };

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (text) {
          setInput((prev) => prev + (prev ? " " : "") + text);
          analyzeInputForTools(text);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Dictation error", event);
        setIsDictating(false);
      };

      recognition.onend = () => {
        setIsDictating(false);
      };

      dictationRecognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.error(e);
      setIsDictating(false);
    }
  };

  const stopDictation = () => {
    if (dictationRecognitionRef.current) {
      try {
        dictationRecognitionRef.current.stop();
      } catch (e) {}
    }
    setIsDictating(false);
  };

  useEffect(() => {
    let interval: any;
    if (loading) {
      let index = 0;
      interval = setInterval(() => {
        index = (index + 1) % thinkingMessages.length;
        setThinkingMessage(thinkingMessages[index]);
      }, 1200); // More dynamic 1.2s cadence
    }
    return () => clearInterval(interval);
  }, [loading]);

  const [situationalContext, setSituationalContext] = useState<string>("");

  useEffect(() => {
    try {
      const profileStr = localStorage.getItem("blaze_profile");
      if (profileStr) {
        const profile = JSON.parse(profileStr);
        let ctx = `\n[SITUATIONAL ONBOARDING CONTEXT]\n`;
        if (profile.purpose) ctx += `- Primary Goal: ${profile.purpose}\n`;
        if (profile.primaryDrain)
          ctx += `- Current Pressure Point: ${profile.primaryDrain}\n`;
        if (profile.pathway) ctx += `- Environment: ${profile.pathway}\n`;
        if (profile.novaTone)
          ctx += `- Preferred Nova Tone: ${profile.novaTone}\n`;
        setSituationalContext(ctx);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("nova_chat_history", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("nova_voice_enabled", String(isVoiceEnabled));
  }, [isVoiceEnabled]);

  useEffect(() => {
    if (messages.length === 0) {
      let greeting =
        initialMessage ||
        "Nova interface active. What behavioral pattern are we breaking today?";
      const profileStr = localStorage.getItem("blaze_profile");
      let profileData: any = null;
      try {
        if (profileStr) profileData = JSON.parse(profileStr);
      } catch (e) {}

      if (!initialMessage && (fingerprint || profileData)) {
        const username = profileData?.useNameInGreetings
          ? profileData?.fullName.split(" ")[0]
          : "Executive";
        const role =
          profileData?.role || fingerprint?.profile || "High Achiever";
        const purpose = profileData?.purpose
          ? `your priority is to ${profileData.purpose.toLowerCase()}`
          : "we need to secure your baseline";
        greeting = `Nova active. Good to see you, ${username}. As a ${role}, ${purpose}. Where are we seeing the most friction in your operating environment today?`;
      }

      setMessages([{ role: "model", parts: [{ text: greeting }] }]);
    }
  }, [initialMessage, fingerprint]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  // Live Audio Setup
  const wsRef = useRef<WebSocket | null>(null);
  const liveAudioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const pcmToBase64 = (pcmData: Float32Array) => {
    const buffer = new ArrayBuffer(pcmData.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < pcmData.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmData[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const playLiveAudioChunk = (audioCtx: AudioContext, base64: string) => {
    const binaryString = window.atob(base64);
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

    if (nextStartTimeRef.current < audioCtx.currentTime) {
      nextStartTimeRef.current = audioCtx.currentTime;
    }
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  };

  const stopListening = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsListening(false);
  };

  const toggleListening = async () => {
    if (isListening) {
      stopListening();
      return;
    }

    try {
      setIsListening(true);

      if (!auth.currentUser) {
        throw new Error("You need to be signed in to use live voice mode.");
      }
      const idToken = await auth.currentUser.getIdToken();
      let appCheckToken = "";
      try {
        appCheckToken = await getAppCheckToken();
      } catch (e) {
        // App Check may not be configured in dev — the server allows a dev bypass in that case.
      }

      const wsUrl = `ws${window.location.protocol === "https:" ? "s" : ""}://${window.location.host}/api/nova/live?token=${encodeURIComponent(idToken)}&appCheckToken=${encodeURIComponent(appCheckToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const audioCtx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )({ sampleRate: 16000 });
      liveAudioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      nextStartTimeRef.current = audioCtx.currentTime;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64 = pcmToBase64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: base64 }));
        }
      };

      ws.onopen = () => {
        let brainContext = "";
        try {
          const brain = getNovaBrain();
          if (brain.length > 0) {
            brainContext =
              "\nNova Personal Brain Context:\n" +
              brain.map((mem) => `[${mem.type}]: ${mem.content}`).join("\n") +
              "\n";
          }
        } catch (e) {}

        ws.send(
          JSON.stringify({
            initialPrompt: `User Burnout Fingerprint: ${JSON.stringify(fingerprint || "Not taken yet")}.
          Recent chat history: ${messages
            .slice(-5)
            .map((m) => m.role + ": " + m.parts[0].text)
            .join("\n")}.
          ${brainContext}
          We are now in real-time voice mode. Be concise and conversational, you don't need to use markdown.`,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.audio) {
            playLiveAudioChunk(audioCtx, msg.audio);
          }
          if (msg.interrupted) {
            nextStartTimeRef.current = audioCtx.currentTime;
          }
          if (msg.error) {
            console.error("Live session error:", msg.error);
            stopListening();
          }
        } catch (err) {
          console.error("Audio msg decode error", err);
        }
      };

      ws.onclose = () => {
        stopListening();
      };
    } catch (e: any) {
      console.error("Detailed voice setup error:", e);
      alert(`Voice mode unavailable: ${e.message}`);
      stopListening();
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
      stopAudio();
    };
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopAudio = () => {
    if (activeSourceRef.current) {
      activeSourceRef.current.stop();
      activeSourceRef.current.disconnect();
      activeSourceRef.current = null;
    }
  };

  const playPcmAudio = async (base64Audio: string) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new window.AudioContext({ sampleRate: 24000 });
    }
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    stopAudio();

    const binaryString = window.atob(base64Audio);
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
      setSpeakingIndex(null);
    };
    source.start(0);
    activeSourceRef.current = source;
  };

  const speakText = async (text: string, index: number) => {
    if (speakingIndex === index) {
      stopAudio();
      setSpeakingIndex(null);
      setAudioLoading(false);
      return;
    }

    try {
      setSpeakingIndex(index);
      setAudioLoading(true);
      const response = await secureApiFetch("/api/nova/speech", {
        method: "POST",
        data: { text: text.replace(/[#*]/g, "") }, // Clean markdown
      });

      const data = await response.json();
      setAudioLoading(false);

      if (data.error) throw new Error(data.error);

      if (data.audio) {
        await playPcmAudio(data.audio);
      } else {
        setSpeakingIndex(null);
      }
    } catch (error: any) {
      console.error("Playback error:", error);
      setAudioLoading(false);
      setSpeakingIndex(null);
      // Let the user know the TTS failed for visibility
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          parts: [
            {
              text: `*System Note: Voice Module Offline (${error.message || "Failed to connect"})*`,
            },
          ],
        },
      ]);
    }
  };

  const analyzeInputForTools = (text: string) => {
    const t = text.toLowerCase();

    if (
      t.includes("budget") ||
      t.includes("energy") ||
      t.includes("matrix") ||
      t.includes("cost") ||
      t.includes("tasks")
    ) {
      setActiveToolSuggestion({
        name: "Energy Budget",
        tab: "budget",
        description:
          "Track and analyze daily energetic spending, tasks, and core metabolic balance indices.",
      });
    } else if (
      t.includes("boundary") ||
      t.includes("boundaries") ||
      t.includes("say no") ||
      t.includes("negotiator") ||
      t.includes("rehearsal") ||
      t.includes("script") ||
      t.includes("client")
    ) {
      setActiveToolSuggestion({
        name: "Boundary Rehearsal",
        tab: "boundaries",
        description:
          "Practice asserting personal bounds and setting limits in customized stressful roleplay nodes.",
      });
    } else if (
      t.includes("debt") ||
      t.includes("fatigue") ||
      t.includes("exhaustion") ||
      t.includes("inventory")
    ) {
      setActiveToolSuggestion({
        name: "Debt Tracker",
        tab: "debt",
        description:
          "Audit and payoff chronic physical, circadian, and sensory exhaustion balances.",
      });
    } else if (
      t.includes("fuel") ||
      t.includes("hydration") ||
      t.includes("water") ||
      t.includes("sugar") ||
      t.includes("eat") ||
      t.includes("food") ||
      t.includes("meal")
    ) {
      setActiveToolSuggestion({
        name: "Recovery Fuel Engine",
        tab: "fuel",
        description:
          "Verify slow-release energy anchors, nutrition stability patterns, and hydration targets.",
      });
    } else if (
      t.includes("sleep") ||
      t.includes("rest") ||
      t.includes("light") ||
      t.includes("circadian") ||
      t.includes("wake")
    ) {
      setActiveToolSuggestion({
        name: "Sleep Builder",
        tab: "sleep",
        description:
          "Leverage circadian science, custom slow-wave rest setups, and optimal morning lux thresholds.",
      });
    } else if (
      t.includes("movement") ||
      t.includes("snack") ||
      t.includes("stretch") ||
      t.includes("exercise") ||
      t.includes("walk")
    ) {
      setActiveToolSuggestion({
        name: "Movement Snacks",
        tab: "movement",
        description:
          "Use targeted desk-friendly movements to clear deep neural fatigue and physically reset.",
      });
    } else if (
      t.includes("doorway") ||
      t.includes("decompression") ||
      t.includes("disconnect") ||
      t.includes("shutdown")
    ) {
      setActiveToolSuggestion({
        name: "Decompression Doorway",
        tab: "doorway",
        description:
          "Perform cognitive shutdown protocols to fully sever work mode from recovery.",
      });
    } else if (
      t.includes("guardian") ||
      t.includes("circle") ||
      t.includes("social") ||
      t.includes("safety")
    ) {
      setActiveToolSuggestion({
        name: "Guardian Relay",
        tab: "safety",
        description:
          "Connect with trusted people who can support you when things feel like too much.",
      });
    } else if (
      t.includes("org") ||
      t.includes("pulse") ||
      t.includes("team") ||
      t.includes("company")
    ) {
      setActiveToolSuggestion({
        name: "Organization Pulse",
        tab: "org",
        description:
          "Review systemic pressure indicators, company-wide capacity tracking, and alignment scorecards.",
      });
    } else if (
      t.includes("signal") ||
      t.includes("trigger") ||
      t.includes("mood") ||
      t.includes("log")
    ) {
      setActiveToolSuggestion({
        name: "Recovery Signals",
        tab: "signals",
        description:
          "Log triggers, record mood signals, and monitor system-wide recovery velocity factors.",
      });
    } else if (
      t.includes("diagnose") ||
      t.includes("fingerprint") ||
      t.includes("archetype") ||
      t.includes("assessment") ||
      t.includes("test")
    ) {
      setActiveToolSuggestion({
        name: "Burnout Diagnostic",
        tab: "diagnose",
        description:
          "Recheck your chronic exhaustion archetype, burnout triggers, and baseline profiles.",
      });
    } else {
      setActiveToolSuggestion(null);
    }
  };

  const getDynamicContext = async () => {
    let contextStr = "";

    if (situationalContext) {
      contextStr += situationalContext;
    }

    try {
      const brain = getNovaBrain();
      if (brain.length > 0) {
        contextStr += `\n--- Nova Personal Context Brain ---\n`;
        brain.forEach((mem) => {
          contextStr += `[${mem.type.toUpperCase()}] (${mem.confidence} confidence): ${mem.content}\n`;
        });
        contextStr += `-----------------------------------\n`;
      }
    } catch (e) {}

    try {
      if (auth.currentUser) {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid, "workload_reality_check", "state"));
        const workload = snap.exists() ? snap.data().answers : null;
        if (workload) {
          const answeredKeys = Object.keys(workload).filter(
            (k) => (workload[k] || "").trim() !== "",
          );
          if (answeredKeys.length > 0) {
            contextStr += `\nLatest Workload Reality Check Answers:\n`;
            if (workload.must)
              contextStr += `- Must happen today: ${workload.must}\n`;
            if (workload.wait) contextStr += `- Can wait: ${workload.wait}\n`;
            if (workload.delegate)
              contextStr += `- Can delegate: ${workload.delegate}\n`;
            if (workload.pretend)
              contextStr += `- Pretending is urgent: ${workload.pretend}\n`;
            if (workload.future)
              contextStr += `- Future self wants removed: ${workload.future}\n`;
          }
        }
      }
    } catch (e) {}

    try {
      if (auth.currentUser) {
        const recoverySnap = await getDoc(doc(db, "users", auth.currentUser.uid, "micro_recovery", "latest"));
        if (recoverySnap.exists()) {
          const recovery = recoverySnap.data();
          contextStr += `\nLatest Completed Micro-Recovery Session:\n`;
          contextStr += `- Protocol duration: ${recovery.duration || "N/A"}\n`;
          contextStr += `- Executed time: ${recovery.time || "N/A"}\n`;
          contextStr += `- Description: ${recovery.description || "N/A"}\n`;
          contextStr += `- Completed at: ${recovery.completedAt || "N/A"}\n`;
        }
      }
    } catch (e) {}
    return contextStr;
  };

  const handleSend = async (overrideInput?: string) => {
    const messageText = overrideInput || input;
    if (!messageText.trim() || loading) return;

    analyzeInputForTools(messageText);

    const userMsg: Message = { role: "user", parts: [{ text: messageText }] };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const dynamicContext = await getDynamicContext();
      let toneModifier = "";
      if (fingerprint?.profile === "High-Functioning Exhausted") {
        toneModifier =
          "TONE OVERRIDE: Be extremely direct. Focus on baseline stability and nervous system regulation over optimization. Do not let them 'hack' their way out of tiredness.";
      } else if (fingerprint?.profile === "Silent Resenter") {
        toneModifier =
          "TONE OVERRIDE: Validate their resentment as valuable data. Encourage radical candor and setting boundaries, even if it causes minor friction.";
      }

      const response = await secureApiFetch("/api/nova/chat", {
        method: "POST",
        data: {
          message: messageText,
          history: messages,
          systemInstruction: `
            ${systemInstruction || ""}
            User Burnout Fingerprint: ${JSON.stringify(fingerprint || "Not taken yet")}.
            ${dynamicContext}
            Conversation context is critical. Refer to past behaviors mentioned in history if relevant. Match the user's preferred tone noted above. Gently call out performance-identity fawning or anxiety-driven overwork if they're pretending things are urgent, but stay warm - this is a person going through burnout, not a performance review.
            ${toneModifier}
          `,
        },
      });

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      const botMessage: Message = {
        role: "model",
        parts: [{ text: data.text }],
        privacyMetadata: data.privacyMetadata
      };

      const newMessages = [...messages, userMsg, botMessage];
      setMessages(newMessages);

      if (voiceFeatureEnabled && isVoiceEnabled) {
        speakText(data.text, newMessages.length - 1);
      }
    } catch (error: any) {
      console.error("Chat Error:", error);
      const errorMessage: Message = {
        role: "model",
        parts: [
          {
            text:
              error.message ||
              "I'm having trouble connecting right now. Please try again in a moment.",
          },
        ],
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden relative transition-all duration-500">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary relative overflow-hidden group">
            <Sparkles className="w-4 h-4 relative z-10" />
          </div>
          <div>
            <h3 className="text-sm font-display font-medium text-text-main tracking-tight">
              Nova
            </h3>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[11px] uppercase tracking-widest font-medium text-text-muted">
                Ready
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {voiceFeatureEnabled && (
            <button
              onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                isVoiceEnabled
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-text-muted hover:text-primary",
              )}
            >
              {isVoiceEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            onClick={() => {
              if (
                window.confirm("Clear this conversation? This can't be undone.")
              ) {
                setMessages([]);
                localStorage.removeItem("nova_chat_history");
              }
            }}
            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-text-muted hover:text-destructive transition-colors"
          >
            <HistoryIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isListening ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-12 relative overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-gradient-to-tr from-destructive/5 via-transparent to-primary/5 opacity-50"
          />
          <div className="space-y-6 text-center relative z-10">
            <div className="w-32 h-32 mx-auto rounded-full bg-destructive/10 flex items-center justify-center relative shadow-lg shadow-destructive/20">
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute inset-0 bg-destructive/20 rounded-full blur-xl"
              />
              <Mic className="w-12 h-12 text-destructive relative z-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-display font-bold text-text-main tracking-tight">
                Voice Session Active
              </h2>
              <p className="text-text-muted font-medium ">
                Speak naturally. Nova is listening.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-4">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height: ["10px", `${20 + Math.random() * 30}px`, "10px"],
                  }}
                  transition={{
                    duration: 0.8 + Math.random() * 0.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="w-1.5 bg-destructive rounded-full"
                />
              ))}
            </div>
          </div>
          <button
            onClick={toggleListening}
            className="px-8 py-4 bg-primary text-primary-foreground rounded-full font-bold shadow-xl hover:scale-105 active:scale-95 transition-all relative z-10 flex items-center gap-2"
          >
            <MicOff className="w-5 h-5" /> End Conversation
          </button>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar"
        >
          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-8">
              <div className="space-y-4">
                <div className="w-16 h-16 rounded-xl bg-primary/10 mx-auto flex items-center justify-center text-primary">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h4 className="text-2xl font-display font-medium text-text-main tracking-tight">
                  Nova is ready
                </h4>
                <p className="text-text-muted font-serif italic leading-relaxed">
                  "I don't do surface-level tips. I look at what's actually
                  driving this."
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 w-full">
                {[
                  {
                    label: "What's draining me today?",
                    prompt: "I'm leaking energy today. Run analysis.",
                  },
                  {
                    label: "Help me set a boundary",
                    prompt: "I need to set a firm boundary. Draft script.",
                  },
                  {
                    label: "How am I doing on SHIP?",
                    prompt: "How am I doing on the SHIP journey?",
                  },
                ].map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.prompt)}
                    className="p-4 text-sm font-medium text-text-muted border border-border hover:border-primary/40 hover:text-primary transition-colors rounded-lg"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex gap-4 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 relative overflow-hidden",
                    msg.role === "user"
                      ? "bg-card dark:bg-surface text-text-main border border-border"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {msg.role === "user" ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </div>
                <div className="space-y-2">
                  <div
                    className={cn(
                      "px-5 py-4 rounded-xl relative group min-w-[80px]",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground font-medium text-sm rounded-tr-sm"
                        : "bg-surface text-text-main border border-border rounded-tl-sm",
                    )}
                  >
                    {msg.role === "model" && (
                      <button
                        onClick={() => speakText(msg.parts[0].text, i)}
                        className={cn(
                          "absolute -right-12 top-0 w-10 h-10 bg-card border border-border rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100",
                          speakingIndex === i
                            ? "opacity-100 text-primary"
                            : "text-text-muted hover:text-primary",
                        )}
                      >
                        {speakingIndex === i ? (
                          audioLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          ) : (
                            <div className="flex items-end gap-[2px] h-3">
                              <motion.div
                                animate={{ height: ["40%", "100%", "40%"] }}
                                transition={{ duration: 0.5, repeat: Infinity }}
                                className="w-1 bg-primary rounded-full"
                              />
                              <motion.div
                                animate={{ height: ["20%", "80%", "20%"] }}
                                transition={{
                                  duration: 0.6,
                                  repeat: Infinity,
                                  delay: 0.1,
                                }}
                                className="w-1 bg-primary rounded-full"
                              />
                              <motion.div
                                animate={{ height: ["60%", "30%", "60%"] }}
                                transition={{
                                  duration: 0.4,
                                  repeat: Infinity,
                                  delay: 0.2,
                                }}
                                className="w-1 bg-primary rounded-full"
                              />
                              <motion.div
                                animate={{ height: ["30%", "90%", "30%"] }}
                                transition={{
                                  duration: 0.7,
                                  repeat: Infinity,
                                  delay: 0.3,
                                }}
                                className="w-1 bg-primary rounded-full"
                              />
                            </div>
                          )
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <div className="markdown-body font-medium leading-relaxed prose-sm dark:prose-invert">
                      <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
                      {msg.privacyMetadata && (
                        <div className="mt-3 pt-2 text-[11px] leading-relaxed flex items-start gap-1.5 text-text-muted border-t border-border/10 group-hover:text-primary transition-colors cursor-help" title={msg.privacyMetadata.rationale}>
                          <span className="shrink-0 text-success" aria-label="Privacy Shield">🛡️</span>
                          <span>Permissioned context used: Uses {msg.privacyMetadata.modulesUsed?.length > 0 ? "compact " + msg.privacyMetadata.modulesUsed.map((m: string) => m.replace(/_|-/g, ' ')).join(', ') + " summary" : "no personalized context"}. No raw notes shared (completely hidden).</span>
                        </div>
                      )}
                    </div>

                    {msg.role === "model" && (
                      <div className="mt-4 pt-3 border-t border-border/20 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] uppercase tracking-wider font-extrabold text-text-muted ">
                            Was this recovery directive helpful?
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => {
                                const newR = { ...ratings, [i]: "up" as const };
                                setRatings(newR);
                                localStorage.setItem(
                                  "nova_chat_ratings",
                                  JSON.stringify(newR),
                                );
                                setActiveFeedbackForm(
                                  activeFeedbackForm === i ? null : i,
                                );
                              }}
                              className={cn(
                                "p-1.5 rounded-lg transition-all border cursor-pointer",
                                ratings[i] === "up"
                                  ? "bg-success/10 text-success border-success/20"
                                  : "bg-surface/30 text-text-muted hover:text-success border-transparent",
                              )}
                              title="Helpful advice"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                const newR = {
                                  ...ratings,
                                  [i]: "down" as const,
                                };
                                setRatings(newR);
                                localStorage.setItem(
                                  "nova_chat_ratings",
                                  JSON.stringify(newR),
                                );
                                setActiveFeedbackForm(
                                  activeFeedbackForm === i ? null : i,
                                );
                              }}
                              className={cn(
                                "p-1.5 rounded-lg transition-all border cursor-pointer",
                                ratings[i] === "down"
                                  ? "bg-destructive/10 text-destructive border-destructive/20"
                                  : "bg-surface/30 text-text-muted hover:text-destructive border-transparent",
                              )}
                              title="Unhelpful advice"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Inline Feedback Collector */}
                        <AnimatePresence>
                          {activeFeedbackForm === i && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden space-y-3 bg-surface/20 p-3 rounded-xl border border-border/40"
                            >
                              <p className="text-[11px] font-black uppercase text-text-muted ">
                                {ratings[i] === "up"
                                  ? "Verify what worked for Nova's baseline memory:"
                                  : "Flag why this directive missed the mark:"}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {(ratings[i] === "up"
                                  ? [
                                      "Spot on!",
                                      "Highly practical",
                                      "Great framing",
                                      "Perfect length",
                                    ]
                                  : [
                                      "Too clinical",
                                      "Too demanding",
                                      "Too passive",
                                      "Generic advice",
                                    ]
                                ).map((tag) => (
                                  <button
                                    key={tag}
                                    onClick={() =>
                                      setFeedbackTag((t) => ({
                                        ...t,
                                        [i]: tag,
                                      }))
                                    }
                                    className={cn(
                                      "px-2 py-1 rounded-md text-[10px] uppercase font-black tracking-wider border transition-all cursor-pointer",
                                      feedbackTag[i] === tag
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-white dark:bg-card text-text-muted border-border/30",
                                    )}
                                  >
                                    {tag}
                                  </button>
                                ))}
                              </div>
                              <input
                                type="text"
                                value={feedbackNotes[i] || ""}
                                onChange={(e) =>
                                  setFeedbackNotes((n) => ({
                                    ...n,
                                    [i]: e.target.value,
                                  }))
                                }
                                placeholder="Refine Nova's context brain (optional)..."
                                className="w-full bg-white dark:bg-surface border border-border/40 rounded-xl px-3 py-2 text-[11px] font-medium text-text-main placeholder: focus:outline-none focus:border-primary"
                              />
                              <button
                                onClick={() => submitFeedbackMemory(i)}
                                className="w-full py-2 bg-card dark:bg-white text-text-main dark:text-foreground border border-border/10 rounded-xl text-[11px] uppercase font-black tracking-widest hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
                              >
                                Commit to Memory Baseline{" "}
                                <Check className="w-3 h-3" />
                              </button>
                            </motion.div>
                          )}

                          {isFeedbackSubmitted[i] && (
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="text-[11px] text-success font-extrabold uppercase tracking-widest flex items-center gap-1 animate-pulse"
                            >
                              <Check className="w-3 h-3 shrink-0" />{" "}
                              Recalibrated. Feedback added to Nova memory
                              baseline (+15 pts).
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  {activeToolSuggestion &&
                    i === messages.length - 1 &&
                    msg.role === "model" && (
                      <motion.div
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className="p-5 bg-primary/5 border border-primary/20 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10"
                      >
                        <div className="flex gap-3.5 items-start">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Target className="w-4 h-4" />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[11px] font-medium uppercase tracking-widest text-primary flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-primary" />{" "}
                              Suggested for you
                            </span>
                            <h5 className="text-xs font-bold text-text-main">
                              Start {activeToolSuggestion.name}?
                            </h5>
                            <p className="text-[11px] leading-relaxed text-text-muted opacity-90 max-w-md">
                              {activeToolSuggestion.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0 self-end md:self-center">
                          {onNavigate && activeToolSuggestion.tab && (
                            <button
                              onClick={() => {
                                onNavigate(activeToolSuggestion.tab!);
                                if (onAwardPoints) {
                                  onAwardPoints(
                                    10,
                                    `Navigated to ${activeToolSuggestion.name} via Coach Nudge`,
                                  );
                                }
                              }}
                              className="px-4 py-2 bg-primary/10 hover:bg-primary hover:text-primary-foreground font-medium text-[11px] uppercase tracking-wider rounded-lg transition-colors text-primary border border-primary/25 cursor-pointer"
                            >
                              Open Tool
                            </button>
                          )}
                          <button
                            onClick={() => {
                              handleSend(
                                `Start ${activeToolSuggestion.name}.`,
                              );
                              setActiveToolSuggestion(null);
                            }}
                            className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground font-medium text-[11px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                          >
                            Start
                          </button>
                          <button
                            onClick={() => setActiveToolSuggestion(null)}
                            className="px-3 py-2 border border-border text-text-muted hover:text-text-main font-medium text-[11px] uppercase tracking-wider rounded-lg hover:bg-surface transition-colors cursor-pointer"
                          >
                            Ignore
                          </button>
                        </div>
                      </motion.div>
                    )}
                </div>
              </div>
            </motion.div>
          ))}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="flex gap-4 max-w-[80%] items-start">
                <div className="w-9 h-9 rounded-[1rem] bg-primary flex items-center justify-center shrink-0 shadow-lg relative overflow-hidden">
                  <Sparkles className="w-4 h-4 text-text-main relative z-10" />
                  <motion.div
                    animate={{
                      rotate: 360,
                      scale: [1, 1.2, 1],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="absolute inset-0 bg-gradient-to-tr from-primary via-teal-400 to-primary opacity-30"
                  />
                </div>
                <div className="space-y-4 pt-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-[0.25em] text-primary animate-pulse">
                      Nova Synthesis
                    </span>
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            delay: i * 0.2,
                          }}
                          className="w-1 h-1 rounded-full bg-primary"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="p-5 rounded-xl border border-border bg-surface space-y-4">
                    <p className="text-xs text-text-muted font-serif italic leading-relaxed flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                      "{thinkingMessage}"
                    </p>

                    {/* Waveform indicator while Nova composes a response */}
                    <div className="flex items-center gap-[4px] h-6 px-1">
                      {[...Array(16)].map((_, index) => (
                        <motion.div
                          key={index}
                          animate={{
                            height: ["15%", "100%", "15%"],
                            opacity: [0.4, 1, 0.4],
                          }}
                          transition={{
                            duration: 0.5 + ((index * 0.07) % 0.8),
                            repeat: Infinity,
                            repeatType: "reverse",
                            ease: "easeInOut",
                          }}
                          className="w-[3px] rounded-full bg-primary"
                          style={{ height: "30%" }}
                        />
                      ))}
                      <span className="text-[10px] font-mono font-black uppercase text-text-muted tracking-wider ml-2">
                        coaching-model-4.0-active
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Hide the text input bar during voice session to enforce clean experience */}
      {!isListening && (
        <div className="p-6 border-t border-border font-sans">
          <div className="flex items-center gap-3">
            {voiceFeatureEnabled && (
              <button
                onClick={toggleListening}
                className="w-12 h-12 rounded-xl border border-border flex items-center justify-center relative overflow-hidden group text-text-muted hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  isDictating
                    ? "Listening... Speak naturally"
                    : "Type or speak to Nova..."
                }
                className={cn(
                  "w-full bg-surface text-text-main border rounded-xl py-4 px-12 pr-16 text-base font-display focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-muted",
                  isDictating
                    ? "border-destructive ring-2 ring-destructive/15 bg-destructive/[0.04] text-text-main animate-pulse"
                    : "border-border focus:border-primary",
                )}
              />

              {/* Dictation Speaking Microphone Button left aligned inside input container */}
              <button
                type="button"
                onClick={isDictating ? stopDictation : startDictation}
                className={cn(
                  "absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer",
                  isDictating
                    ? "bg-destructive text-destructive-foreground animate-pulse scale-110"
                    : "text-text-muted hover:text-destructive hover:bg-surface/50 hover:scale-105",
                )}
                title="Speak to type (voice dictation)"
              >
                <Mic
                  className={cn("w-4.5 h-4.5", isDictating && "animate-bounce")}
                />
              </button>

              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="absolute right-2 top-2 w-11 h-11 bg-primary text-primary-foreground rounded-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 cursor-pointer"
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
