import { auth } from '../lib/firebase';
import { db } from '../lib/firestore';
import { collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { secureApiFetch } from '../lib/secure-api';
import { logJourney } from '../lib/nova-brain';
import { 
  ShieldAlert, 
  ArrowRight, 
  MessageSquare, 
  Shield, 
  CheckCircle2, 
  UserPlus, 
  Briefcase, 
  Heart,
  Sparkles,
  Loader2,
  Target,
  Zap,
  Wand2,
  Copy,
  Users,
  Network,
  Volume2
} from 'lucide-react';
import { NovaChat } from './NovaChat';
import type { NovaQuestioningStyle } from './NovaStyleControl';
import type { UserProfileData } from '../types';
import { cn } from '../lib/utils';
import {
  CONDITIONAL_YES_LEVER_ORDER, CONDITIONAL_YES_LEVER_LABELS, ConditionalYesLever, CONDITIONAL_YES_QUESTION,
  buildConditionalYesMessage,
} from '../../capacity-firewall-engine';
import {
  BACK_DOWN_REASON_ORDER, BACK_DOWN_REASON_LABELS, BackDownReason, WHAT_MIGHT_MAKE_YOU_BACK_DOWN_QUESTION,
  recommendPushbackPattern, PUSHBACK_PATTERN_LABELS, PUSHBACK_PATTERN_ROLEPLAY_HINT,
  PUSHBACK_END_CHOICE_ORDER, PUSHBACK_END_CHOICE_LABELS, PushbackEndChoice,
} from '../../boundary-pushback-engine';

interface Script {
  id: string;
  title: string;
  situation: string;
  script: string;
  advice: string;
}

interface ScriptGroup {
  category: string;
  icon: any;
  scenarios: Script[];
}

const scriptGroups: ScriptGroup[] = [
  {
    category: 'Manager & Workload',
    icon: Briefcase,
    scenarios: [
      {
        id: 'scope-creep',
        title: 'The "Scope Creep" Block',
        situation: 'A manager adds a mid-week project that threatens your baseline stability.',
        script: "I've reviewed the project requirements. To ensure I deliver this to the standard we need, I'll need to push the final review of [Current Project] to next Tuesday. Which of these takes priority for the team's goals this week?",
        advice: 'Don\'t say "I\'m too busy." Force a trade-off. It makes the decision theirs, but the boundary yours.'
      },
      {
        id: '4pm-meeting',
        title: 'The 16:00 Meeting Decline',
        situation: 'Late-day energy drain is your primary burnout trigger.',
        script: "I've reached my capacity for deep focus today and want to ensure I'm fully present for this discussion. Can we move this to my 10 AM block tomorrow when I can give it my full cognitive energy?",
        advice: "Frame it as a quality issue, not a 'me' issue. You're protecting the conversation, not just your time."
      },
      {
        id: 'promo-talk',
        title: 'High-Output Negotiation',
        situation: 'You are being asked to do more senior work without the title/pay.',
        script: "I'm excited to take on these [Senior Tasks]. To do this effectively, I'd like to formalise this transition. Can we look at the promotion criteria this week so we're aligned on the roadmap for my new role?",
        advice: "Turn 'extra work' into 'career advancement' immediately. If they aren't ready for the title, they aren't ready for the work."
      },
      {
        id: 'unreasonable-request-decline',
        title: 'The Unreasonable Request Decline',
        situation: 'A stakeholder asks for an unrealistic deliverable with an impossible timeline.',
        script: "I've assessed the request, and while I understand the urgency, the timeline proposed isn't feasible without severely compromising the quality or dropping our current primary commitments. I can deliver a scoped-down version by that date, or we can look at a more realistic timeline for the full request. Which path should we take?",
        advice: 'Never absorb structural dysfunction. Shift the problem back to the requester as a choice between scope, quality, and time.'
      }
    ]
  },
  {
    category: 'Delegation & Asking Help',
    icon: Users,
    scenarios: [
      {
        id: 'task-handoff',
        title: 'Delegating Up or Across',
        situation: 'You are overwhelmed with low-leverage tasks that belong elsewhere.',
        script: "To maintain velocity on the [Core Strategic Project], I am going to hand off the [Low Leverage Task] data gathering to you starting this week. Let's block 15 minutes to review the hand-over.",
        advice: 'Be decisive. State the hand-off as a required operational adjustment rather than a request for permission.'
      },
      {
        id: 'requesting-resources',
        title: 'Asking for structural help',
        situation: 'You realise a project cannot be completed without more resources.',
        script: "I've mapped the critical path for this delivery. To hit the current deadline without compromising quality, we need an additional analyst for 15 hours a week. Otherwise, we will need to adjust the operational timeline by two weeks.",
        advice: 'Present the problem as a maths equation (resources versus timeline), not an emotional appeal.'
      }
    ]
  },
  {
    category: 'Clients & Fees',
    icon: UserPlus,
    scenarios: [
      {
        id: 'weekend-client',
        title: 'The Weekend Boundary',
        situation: 'A client expects an immediate response on a Sunday.',
        script: "(Send Monday 9AM) Thanks for your note. To maintain the quality of service I provide my clients, I dedicate my weekends to recovery so I can be fully available during business hours. I'll have an answer for you by noon today.",
        advice: 'Never apologise for having a weekend. You are a high-value resource; resources need maintenance.'
      },
      {
        id: 'discount-ask',
        title: 'The "Quick Favour" Ask',
        situation: 'Client asks for extra work for free.',
        script: "That's a great addition to the project scope. I've drafted a quick addendum with the adjusted timeline and fee for this extra module. Shall I send it over for approval?",
        advice: "Never say 'No' to more work, say 'Yes, and here is the price.' It frames you as a professional, not a volunteer."
      }
    ]
  },
  {
    category: 'Personal & Family',
    icon: Heart,
    scenarios: [
      {
        id: 'social-battery',
        title: 'Social Battery Depletion',
        situation: 'Friends want to go out, but you are in the "Safety" stage.',
        script: "I'd love to see you all, but my system is currently at red-line. I'm taking a mandatory recovery night to avoid a total crash. Let's aim for coffee next Saturday morning instead?",
        advice: 'Be honest about the "System Status." People who care about your ambition will respect your maintenance.'
      },
      {
        id: 'family-burnout',
        title: 'Emotional Labour Check',
        situation: 'Being the "emotional rock" for family while depleted.',
        script: "I really want to be there for you, but I don't have the emotional capacity right now to give this the attention it deserves. Can we talk about this tomorrow after I've had some rest?",
        advice: "Setting boundaries with family is the hardest. Use the 'quality' argument: 'I want to be a good listener, and I can't be one right now.'"
      }
    ]
  }
];

export const BoundaryRehearsal = ({
  onAwardPoints,
  onRehearsalComplete,
  profile,
  onToneChange,
  onStyleChange,
}: {
  onAwardPoints: (amount: number, reason: string) => void,
  onRehearsalComplete: () => void,
  // Threaded through to the embedded NovaChat below so its Tone/Style
  // controls read and persist the same canonical preference as the main
  // Nova tab, instead of a second, disconnected copy that only ever
  // reaches this device's localStorage (see NovaChat.tsx for the full
  // reasoning - same gap, same fix, applied here too).
  profile?: UserProfileData,
  onToneChange?: (tone: string) => void,
  onStyleChange?: (style: NovaQuestioningStyle | undefined) => void,
}) => {
  const [selected, setSelected] = useState<Script | null>(null);
  const [activeCategory, setActiveCategory] = useState(scriptGroups[0].category);
  const [isPractising, setIsPractising] = useState(false);
  const [mode, setMode] = useState<'library' | 'generator'>('generator');

  const [generatorInput, setGeneratorInput] = useState('');
  // The Boundary Compiler's short optional context - who this is with and
  // what the user actually has room for - sharpens the breakdown without
  // forcing a long form before they can start.
  const [compilerWho, setCompilerWho] = useState('');
  const [compilerCapacity, setCompilerCapacity] = useState('');
  const [compilerOutcome, setCompilerOutcome] = useState('');
  const [generatingScripts, setGeneratingScripts] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [isSpeakingScript, setIsSpeakingScript] = useState(false);
  const [scriptAudioLoading, setScriptAudioLoading] = useState(false);
  const ttsAudioCtxRef = useRef<AudioContext | null>(null);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [selectedTone, setSelectedTone] = useState<'warm' | 'clear' | 'firm'>('clear');
  // "Sounds Like Me" - an explicit opt-in. Nova never silently imitates a
  // personal communication style; this only matches when the user has
  // turned it on themselves.
  const [soundsLikeMe, setSoundsLikeMe] = useState(false);
  // Strategic/Conditional Yes - deterministic and instant (same engine
  // Capacity Firewall uses), kept exactly as prominent as the decline-
  // leaning Compiler output rather than buried under it.
  const [conditionalYesLever, setConditionalYesLever] = useState<ConditionalYesLever | null>(null);
  const [conditionalYesDetail, setConditionalYesDetail] = useState('');

  // Boundary Resilience: "What might make you back down?" is asked once
  // per practice session, before the live roleplay, and tailors which
  // pushback pattern Nova leans into - never a personality diagnosis.
  const [showBackDownPicker, setShowBackDownPicker] = useState(false);
  const [backDownReason, setBackDownReason] = useState<BackDownReason | null>(null);
  // Bumped on "Try That Moment Again" to remount NovaChat with a fresh
  // conversation rather than continuing the one where the boundary caved.
  const [practiceAttempt, setPracticeAttempt] = useState(0);

  const [showCritique, setShowCritique] = useState(false);
  const [critiqueLoading, setCritiqueLoading] = useState(false);
  const [finalCritique, setFinalCritique] = useState<string | null>(null);
  const [detailedFeedback, setDetailedFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [savedScripts, setSavedScripts] = useState<{ id: string, title: string, scriptText: string, createdAt: string }[]>([]);

  const uid = auth.currentUser?.uid;

  const fetchSavedScripts = async () => {
    if (!uid) return;
    try {
      const q = query(collection(db, 'users', uid, 'boundary_scripts'), orderBy('createdAt', 'desc'), limit(5));
      const snap = await getDocs(q);
      setSavedScripts(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    } catch (e) {
      // Non-critical - the generator still works even if history fails to load.
    }
  };
  const fetchSoundsLikeMePreference = async () => {
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'preferences', 'boundary_architect'));
      if (snap.exists() && typeof snap.data().soundsLikeMeEnabled === 'boolean') {
        setSoundsLikeMe(snap.data().soundsLikeMeEnabled);
      }
    } catch (e) {
      // Falls back to off - style-matching is an opt-in convenience, not required.
    }
  };
  useEffect(() => {
    const load = async () => { await Promise.all([fetchSavedScripts(), fetchSoundsLikeMePreference()]); };
    load();
  }, [uid]);

  const toggleSoundsLikeMe = async () => {
    const next = !soundsLikeMe;
    setSoundsLikeMe(next);
    if (uid) {
      try {
        await setDoc(doc(db, 'users', uid, 'preferences', 'boundary_architect'), {
          soundsLikeMeEnabled: next, updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (e) {
        // Non-critical - the toggle still works for this session either way.
      }
    }
  };

  // The Boundary Compiler's breakdown - separates the user's internal
  // reaction from what actually needs external communication, generically
  // by heading rather than two hardcoded section names, so it survives
  // Nova phrasing a heading slightly differently.
  const getCompilerSections = (): Record<string, string> => {
    if (!generatedResult) return {};
    const sections: Record<string, string> = {};
    const parts = generatedResult.split(/^###\s*/m).slice(1);
    for (const part of parts) {
      const newlineIdx = part.indexOf('\n');
      const headingRaw = newlineIdx === -1 ? part : part.slice(0, newlineIdx);
      const heading = headingRaw.toLowerCase().replace(/['’]/g, '').trim();
      const body = (newlineIdx === -1 ? '' : part.slice(newlineIdx + 1)).trim();
      sections[heading] = body;
    }
    return sections;
  };

  const getParsedCustomScript = () => {
    const sections = getCompilerSections();
    const script = sections['message'] || generatedResult || '';
    const advice = sections['behavioral strategy'] || sections['strategy'] || "Nova recommends holding this line high and matching with visual boundaries.";
    return { script, advice };
  };

  const stopScriptAudio = () => {
    if (ttsSourceRef.current) {
      ttsSourceRef.current.stop();
      ttsSourceRef.current.disconnect();
      ttsSourceRef.current = null;
    }
  };

  const playScriptPcmAudio = async (base64Audio: string) => {
    if (!ttsAudioCtxRef.current) {
      ttsAudioCtxRef.current = new window.AudioContext({ sampleRate: 24000 });
    }
    const audioCtx = ttsAudioCtxRef.current;
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    stopScriptAudio();

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
      channelData[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.onended = () => setIsSpeakingScript(false);
    source.start(0);
    ttsSourceRef.current = source;
  };

  // Reads just the isolated script text, not the full generatedResult -
  // this is a "practice saying this out loud" feature, so hearing the
  // behavioral-strategy explanation read aloud too would be noise, not
  // the model of the actual delivery the person is meant to rehearse.
  const playScriptAloud = async () => {
    if (isSpeakingScript) {
      stopScriptAudio();
      setIsSpeakingScript(false);
      setScriptAudioLoading(false);
      return;
    }
    const { script } = getParsedCustomScript();
    if (!script) return;
    try {
      setIsSpeakingScript(true);
      setScriptAudioLoading(true);
      const response = await secureApiFetch("/api/nova/speech", {
        method: "POST",
        data: { text: script.replace(/[#*]/g, "") },
      });
      const data = await response.json();
      setScriptAudioLoading(false);
      if (data.error) throw new Error(data.error);
      if (data.audio) {
        await playScriptPcmAudio(data.audio);
      } else {
        setIsSpeakingScript(false);
      }
    } catch (error: any) {
      console.error("Playback error:", error);
      setScriptAudioLoading(false);
      setIsSpeakingScript(false);
    }
  };

  // BOUNDARY COMPILER: turns a messy, possibly frustrated description of
  // an incoming demand into a clear external boundary - separating what
  // objectively happened from what needs negotiating from the raw
  // frustration that doesn't need to be sent. Never invalidates the
  // emotion; it just keeps it out of the message.
  const BUILD_TONE_LABELS: Record<'warm' | 'clear' | 'firm', string> = { warm: 'Warm', clear: 'Clear', firm: 'Firm' };
  const BUILD_TONE_DESCRIPTIONS: Record<'warm' | 'clear' | 'firm', string> = {
    warm: 'warm in register, but still clear about the boundary itself',
    clear: 'plain and matter-of-fact, with no extra softening',
    firm: 'direct and non-negotiable in tone, while staying professional',
  };

  const handleCompileBoundary = async () => {
    if (!generatorInput.trim()) return;
    setGeneratingScripts(true);
    setGeneratedResult(null);

    try {
      const contextLines = [
        compilerWho.trim() ? `Who this is with: ${compilerWho.trim()}.` : '',
        compilerCapacity.trim() ? `What the user actually has capacity for right now: ${compilerCapacity.trim()}.` : '',
        compilerOutcome.trim() ? `The outcome the user wants: ${compilerOutcome.trim()}.` : '',
      ].filter(Boolean).join(' ');

      const styleNote = soundsLikeMe && savedScripts.length > 0
        ? ` Where it fits naturally, match the general directness/length of the user's own previous messages: ${savedScripts.slice(0, 2).map(s => `"${s.scriptText}"`).join(' / ')}.`
        : '';

      const response = await secureApiFetch('/api/nova/chat', {
        method: 'POST',
        data: {
          message: `Here is the situation, in the user's own words: "${generatorInput}". ${contextLines}

First separate the user's internal reaction from what actually needs to be communicated externally. Respond in exactly this format, with these exact headings:

### What Happened
[One neutral sentence - what objectively happened, stripped of frustration.]

### What You Can Do
[One sentence - what the user can still deliver or offer as-is.]

### What Needs Negotiating
[One sentence - the specific thing that needs to change: deadline, scope, ownership, timing, or similar.]

### What Doesn't Need To Be Sent
[One sentence naming the raw frustration that should stay internal - never say the feeling is invalid, just note it doesn't belong in the message itself.]

### Message
[The actual message to send, in a ${BUILD_TONE_LABELS[selectedTone]} tone: ${BUILD_TONE_DESCRIPTIONS[selectedTone]}. Zero apology unless genuinely warranted.]

### Behavioral Strategy
[One sentence of tactical advice on why this works for a high achiever protecting their capacity.]`,
          systemInstruction: `You are Nova, a Blaze Break recovery coach. Help a high achiever turn a messy, emotional description of an incoming demand into a clear external boundary. Never tell them their feelings are invalid - just separate the internal reaction from the external communication. Never diagnose, never use clinical language, no fluff or introductory chatter.${styleNote}`
        }
      });
      const data = await response.json();
      setGeneratedResult(data.text);
      onAwardPoints(20, "Compiled a Boundary");

      // Persist so this generation survives a refresh and shows up in
      // Recent Custom Scripts below - reuses the same boundary_scripts
      // collection and schema ConnectedBoundaryScripts already reads from.
      if (uid) {
        try {
          const messageMatch = data.text.split(/###\s*Message\s*\n/i)[1];
          const message = messageMatch ? messageMatch.split(/\n###/)[0].trim() : data.text;
          const id = Date.now().toString();
          await setDoc(doc(db, 'users', uid, 'boundary_scripts', id), {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            title: generatorInput.slice(0, 80),
            scenarioType: 'workload',
            scriptText: message.slice(0, 500),
            status: 'saved',
          });
          fetchSavedScripts();
        } catch (e) {
          // Non-critical - the generated message is still shown and usable
          // for practice even if saving it to history fails.
        }
      }
    } catch (e) {
      setGeneratedResult("### What Happened\nA new request arrived.\n\n### What You Can Do\nYour existing commitments can continue as planned.\n\n### What Needs Negotiating\nThe timing of this new request.\n\n### What Doesn't Need To Be Sent\nAny frustration about the timing - that's useful information for you, not for them.\n\n### Message\nI have received your request. Let me check my capacity and I will outline the trade-offs required to take this on.\n\n### Behavioral Strategy\nThis delays commitment, giving your cognitive load time to level out.");
    } finally {
      setGeneratingScripts(false);
    }
  };

  const conditionalYesPreview = conditionalYesLever ? buildConditionalYesMessage(conditionalYesLever, conditionalYesDetail) : '';

  const startCustomRehearsal = () => {
    const { script, advice } = getParsedCustomScript();
    if (!script) return;
    const customS: Script = {
      id: 'custom-generator',
      title: 'Custom Pushback Rehearsal',
      situation: generatorInput,
      script: script,
      advice: advice
    };
    startPractice(customS);
  };

  const startPractice = (script: Script) => {
    setSelected(script);
    setIsPractising(true);
    setShowBackDownPicker(true);
    setBackDownReason(null);
    setPracticeAttempt(0);
    setShowCritique(false);
    setFinalCritique(null);
    setDetailedFeedback(null);
    onAwardPoints(50, "Boundary Rehearsal");
    onRehearsalComplete();
  };

  const chooseBackDownReason = (reason: BackDownReason | null) => {
    setBackDownReason(reason);
    setShowBackDownPicker(false);
  };

  const pushbackPattern = backDownReason ? recommendPushbackPattern(backDownReason) : null;

  const tryMomentAgain = () => {
    setShowCritique(false);
    setFinalCritique(null);
    setDetailedFeedback(null);
    setPracticeAttempt((n) => n + 1);
  };

  const generateFinalCritique = async () => {
    setCritiqueLoading(true);
    setShowCritique(true);

    if (uid) {
      secureApiFetch('/api/user/mark-activity', {
        method: 'POST',
        data: { activity: 'boundaryRehearsal' },
      }).catch(() => {
        // Non-fatal - only affects the home recommendation engine's freshness.
      });
    }
    logJourney(`Completed a boundary rehearsal practice session`, selected?.title ? `Scenario: "${selected.title}"` : undefined);

    try {
      const response = await secureApiFetch('/api/nova/chat', {
        method: 'POST',
        data: {
          message: "The rehearsal is complete. Give me a brief, direct review of my boundary rehearsal.",
          systemInstruction: `You are Nova. Review the user's boundary-setting rehearsal that just happened in this conversation. This is skill-building, not scoring - never give a numeric score, grade, or percentage of any kind. If, at any point, the user gave up their original ask or trade-off rather than holding or renegotiating it, say so plainly using exactly this phrase: "That was the moment the original trade-off disappeared." - then name what happened around that point. If they held the line throughout, say that plainly instead. Never call the roleplayed other party manipulative, toxic, or any other character label - describe behaviour (e.g. "they leaned on urgency"), never diagnose a personality. Keep it to 2-3 sentences.`
        }
      });
      const data = await response.json();
      setFinalCritique(data.text);
    } catch(e) {
      setFinalCritique("Here's what stood out: you held the shape of your original ask through most of the exchange. Keep an eye on where you start qualifying or over-explaining next time.");
    }
    setCritiqueLoading(false);
  };

  const generateDetailedFeedback = async () => {
    setFeedbackLoading(true);
    try {
      const response = await secureApiFetch('/api/nova/chat', {
        method: 'POST',
        data: {
          message: "Please give me a detailed, in-depth behavioral audit of my boundary rehearsal.",
          systemInstruction: "You are Nova. Provide a detailed markdown list of what went well and what needs improvement regarding the user's boundary setting attempt. Be very analytical."
        }
      });
      const data = await response.json();
      setDetailedFeedback(data.text);
    } catch(e) {
      setDetailedFeedback("- **Strengths:** Strong opening line.\n- **Improvement:** Avoid up-talk at the end of the sentence.");
    }
    setFeedbackLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const currentGroup = scriptGroups.find(g => g.category === activeCategory) || scriptGroups[0];

  return (
    <div className="space-y-12 pb-24 font-sans max-w-[1400px] mx-auto text-text-main">
      
      {/* Boundary rehearsal header */}
      <div className="relative overflow-hidden rounded-xl bg-card border border-border p-6 sm:p-8 md:p-10">
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="flex items-center gap-4 border-b border-border pb-6">
             <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
               <ShieldAlert className="w-6 h-6" />
             </div>
             <div className="flex flex-col md:flex-row md:items-center justify-between w-full">
                <div>
                  <h2 className="text-2xl lg:text-3xl font-display font-medium text-text-main tracking-tight">Boundary Architect</h2>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs font-medium uppercase tracking-widest text-[#9a3412] dark:text-primary flex items-center gap-1.5"><Network className="w-3 h-3" /> Say it clearly.</span>
                  </div>
                </div>
                <div className="mt-4 md:mt-0 flex bg-surface border border-border rounded-lg p-1">
                  <button
                    onClick={() => setMode('generator')}
                    aria-pressed={mode === 'generator'}
                    className={cn("px-5 py-2.5 rounded-md text-xs font-medium uppercase tracking-widest transition-colors", mode === 'generator' ? "bg-card text-text-main" : "text-text-muted hover:text-text-main")}
                  >
                    Build My Boundary
                  </button>
                  <button
                    onClick={() => setMode('library')}
                    aria-pressed={mode === 'library'}
                    className={cn("px-5 py-2.5 rounded-md text-xs font-medium uppercase tracking-widest transition-colors", mode === 'library' ? "bg-card text-text-main" : "text-text-muted hover:text-text-main")}
                  >
                    Script Library
                  </button>
                </div>
             </div>
          </div>
          <p className="text-sm lg:text-base text-text-muted font-serif italic leading-relaxed max-w-2xl border-l-2 border-primary/30 pl-5 py-1">
            "Master the 'Firm No' and the 'Strategic Yes'. Practical scripts for high-stakes moments. Stop apologising for protecting your own time."
          </p>
        </div>
      </div>

      {mode === 'generator' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          <div className="xl:col-span-5 min-w-0 space-y-6">
            <div className="card bg-card border border-border p-8 space-y-6 relative overflow-hidden group">
              <div className="relative z-10 space-y-3 border-b border-border pb-5">
                <h4 className="text-lg font-bold text-text-main flex items-center gap-2 tracking-tight">
                  <Wand2 className="w-5 h-5 text-primary" /> Boundary Compiler
                </h4>
                <p className="text-xs text-text-muted leading-relaxed font-medium">
                  Describe what landed on you, messy and unfiltered if that's how it feels. Nova separates what happened from what actually needs to be said.
                </p>
              </div>

              <div className="relative z-10 space-y-5">
                <div>
                  <label htmlFor="incoming-demand" className="text-[11px] font-medium uppercase tracking-widest text-text-muted ml-1 mb-2 block">What are they asking?</label>
                  <textarea
                    id="incoming-demand"
                    value={generatorInput}
                    onChange={(e) => setGeneratorInput(e.target.value)}
                    placeholder='e.g. "They dropped this on me at 4pm and expect it tomorrow, again."'
                    className="w-full h-32 bg-background border border-border rounded-lg p-4 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 resize-none transition-all font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <input
                    value={compilerWho}
                    onChange={(e) => setCompilerWho(e.target.value)}
                    placeholder="Who is this with? (optional)"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                  <input
                    value={compilerCapacity}
                    onChange={(e) => setCompilerCapacity(e.target.value)}
                    placeholder="What do you actually have capacity for? (optional)"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                  <input
                    value={compilerOutcome}
                    onChange={(e) => setCompilerOutcome(e.target.value)}
                    placeholder="What outcome do you want? (optional)"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1 mb-2 block">How direct should this sound?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['warm', 'clear', 'firm'] as const).map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setSelectedTone(tone)}
                        aria-pressed={selectedTone === tone}
                        className={cn(
                          "py-3 px-2 text-center rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer",
                          selectedTone === tone
                            ? "border-primary bg-primary/10 text-[#9a3412] dark:text-primary shadow-inner"
                            : "border-border bg-background text-text-muted hover:border-muted-foreground hover:text-text-muted"
                        )}
                      >
                        {BUILD_TONE_LABELS[tone]}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-start gap-2.5 text-xs text-text-muted cursor-pointer pt-1">
                  <input type="checkbox" checked={soundsLikeMe} onChange={toggleSoundsLikeMe} className="mt-0.5" />
                  Sounds Like Me - match the directness of my own saved messages
                </label>

                <div className="pt-2">
                  <button
                    onClick={handleCompileBoundary}
                    disabled={!generatorInput.trim() || generatingScripts}
                    className="w-full bg-primary hover:opacity-90 text-primary-foreground py-4 rounded-lg text-xs font-medium uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40 disabled:grayscale"
                  >
                    {generatingScripts ? <><Loader2 className="w-4 h-4 animate-spin" /> Compiling...</> : <><Sparkles className="w-4 h-4" /> Compile My Boundary</>}
                  </button>
                </div>
              </div>
            </div>

            <div className="card bg-card border border-border p-6 space-y-4">
              <h5 className="text-xs font-medium uppercase tracking-widest text-text-muted flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> Or, a Strategic Yes
              </h5>
              <p className="text-xs text-text-muted leading-relaxed">{CONDITIONAL_YES_QUESTION}</p>
              <div className="flex flex-wrap gap-1.5">
                {CONDITIONAL_YES_LEVER_ORDER.map((l) => (
                  <button
                    key={l}
                    onClick={() => setConditionalYesLever(l)}
                    aria-pressed={conditionalYesLever === l}
                    className={cn("px-2.5 py-1.5 rounded-md border text-[11px] font-bold", conditionalYesLever === l ? "border-primary bg-primary/10 text-text-main" : "border-border text-text-muted hover:border-primary/40")}
                  >
                    {CONDITIONAL_YES_LEVER_LABELS[l]}
                  </button>
                ))}
              </div>
              {conditionalYesLever && (
                <>
                  <input
                    value={conditionalYesDetail}
                    onChange={(e) => setConditionalYesDetail(e.target.value)}
                    placeholder="Add a detail (optional)"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-text-main focus:outline-none focus:border-primary"
                  />
                  <div className="p-3 rounded-lg border border-border bg-surface flex items-center justify-between gap-3">
                    <p className="text-xs text-text-main">{conditionalYesPreview}</p>
                    <button onClick={() => copyToClipboard(conditionalYesPreview)} aria-label="Copy strategic yes message" className="shrink-0 text-text-muted hover:text-primary">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {savedScripts.length > 0 && (
              <div className="card bg-card border border-border p-6 space-y-4">
                <h5 className="text-xs font-medium uppercase tracking-widest text-text-muted">Recent Custom Scripts</h5>
                <div className="space-y-2">
                  {savedScripts.map(s => (
                    <div key={s.id} className="p-3 bg-surface rounded-lg border border-border text-xs">
                      <p className="font-bold text-text-main truncate">{s.title}</p>
                      <p className="text-text-muted mt-1 line-clamp-2">{s.scriptText}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="xl:col-span-7 min-w-0 space-y-6">
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" /> How This Was Compiled
            </h4>

            {!generatedResult && !generatingScripts ? (
              <div className="h-[400px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-text-muted p-8 text-center bg-surface">
                <ShieldAlert className="w-8 h-8 mb-4 opacity-20" />
                <p className="text-xs font-medium max-w-sm">The breakdown and message will appear here, so you can see how it was derived - not just the final line.</p>
              </div>
            ) : generatingScripts ? (
              <div role="status" aria-live="polite" className="h-[400px] rounded-xl border border-primary/20 bg-primary/5 flex flex-col items-center justify-center text-[#9a3412] dark:text-primary relative overflow-hidden">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p className="text-xs font-medium uppercase tracking-widest">Nova is compiling your boundary...</p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="prose dark:prose-invert prose-sm max-w-none text-text-muted bg-card p-8 lg:p-10 rounded-xl border border-border relative"
              >
                <div className="relative z-10">
                  <ReactMarkdown
                    components={{
                      h3: ({node, ...props}) => (
                        <h3 className="text-success dark:text-[#4ade80] font-bold text-xs uppercase tracking-widest mt-6 mb-3 border-b border-border pb-2" {...props} />
                      ),
                      p: ({node, ...props}) => (
                        <div className="relative group mb-6">
                          <p className="bg-surface p-5 rounded-lg border border-border text-text-muted pr-12 leading-relaxed" {...props} />
                          <button
                            onClick={(e) => {
                              const text = (e.currentTarget.previousElementSibling as HTMLElement)?.innerText;
                              if (text) copyToClipboard(text);
                            }}
                            aria-label="Copy script to clipboard"
                            className="absolute right-4 top-4 p-2 bg-card rounded-lg border border-border text-text-muted hover:text-success dark:hover:text-[#4ade80] opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-primary transition-all"
                            title="Copy script"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    }}
                  >
                    {generatedResult || ''}
                  </ReactMarkdown>

                  <div className="mt-8 pt-6 border-t border-border flex items-center justify-between gap-4">
                    <button
                      onClick={playScriptAloud}
                      aria-label={isSpeakingScript ? "Stop reading script aloud" : "Play script aloud"}
                      aria-pressed={isSpeakingScript}
                      className={cn(
                        "py-3.5 px-6 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2.5 transition-colors border",
                        isSpeakingScript ? "bg-primary/10 border-primary/30 text-primary" : "bg-surface border-border text-text-muted hover:text-primary hover:border-primary/30"
                      )}
                    >
                      {isSpeakingScript && scriptAudioLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                      {isSpeakingScript ? "Stop" : "Hear It Said"}
                    </button>
                    <button
                      onClick={startCustomRehearsal}
                      className="bg-primary hover:bg-primary text-primary-foreground py-3.5 px-8 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-colors shadow-lg"
                    >
                      <Target className="w-4 h-4" /> Load to Rehearsal
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      ) : !isPractising ? (
        <div className="space-y-8">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 p-1.5 bg-background border border-white/[0.05] rounded-2xl w-fit shadow-inner">
            {scriptGroups.map(group => (
              <button
                key={group.category}
                onClick={() => setActiveCategory(group.category)}
                aria-pressed={activeCategory === group.category}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                  activeCategory === group.category ? "bg-primary text-primary-foreground shadow-md border border-primary" : "text-text-muted hover:text-text-muted hover:bg-white/[0.02]"
                )}
              >
                <group.icon className="w-3.5 h-3.5" />
                {group.category}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {currentGroup.scenarios.map((s) => (
              <div
                key={s.id}
                className="bg-card border border-border p-8 rounded-xl flex flex-col justify-between hover:border-primary/30 transition-all group relative overflow-hidden"
              >
                <div className="relative z-10 space-y-5">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <h4 className="text-xl font-bold text-text-main tracking-tight">{s.title}</h4>
                    <MessageSquare className="w-5 h-5 text-text-muted group-hover:text-primary transition-colors" />
                  </div>
                  <div className="bg-surface p-4 rounded-lg border border-border">
                    <span className="text-[11px] uppercase font-medium tracking-widest text-text-muted mb-1 block">Context</span>
                    <p className="text-sm text-text-muted leading-relaxed">"{s.situation}"</p>
                  </div>
                </div>

                <div className="mt-8 space-y-3 relative z-10">
                  <button
                    onClick={() => startPractice(s)}
                    className="w-full bg-primary hover:opacity-90 text-primary-foreground py-3.5 rounded-lg text-xs uppercase font-medium tracking-widest flex items-center justify-center gap-2 transition-all"
                  >
                     <Zap className="w-3.5 h-3.5" /> Start Practice
                  </button>
                  <button className="w-full py-3.5 rounded-lg text-xs font-medium uppercase tracking-widest text-text-muted hover:text-text-main bg-surface hover:bg-border border border-border transition-colors">
                    Copy Script
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : showBackDownPicker ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto">
          <div className="bg-card border border-border rounded-xl p-8 space-y-6 text-center">
            <h3 className="text-xl font-display font-medium text-text-main tracking-tight">{WHAT_MIGHT_MAKE_YOU_BACK_DOWN_QUESTION}</h3>
            <p className="text-xs text-text-muted leading-relaxed">This isn't about your personality - it just helps Nova practise the right kind of pushback with you.</p>
            <div className="grid grid-cols-1 gap-2">
              {BACK_DOWN_REASON_ORDER.map((reason) => (
                <button
                  key={reason}
                  onClick={() => chooseBackDownReason(reason)}
                  className="text-left text-sm rounded-xl border border-border px-4 py-3 text-text-main hover:border-primary/40 transition-colors"
                >
                  {BACK_DOWN_REASON_LABELS[reason]}
                </button>
              ))}
            </div>
            <button onClick={() => chooseBackDownReason(null)} className="text-xs font-medium uppercase tracking-widest text-text-muted hover:text-text-main">
              Skip this
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-8"
        >
          <div className="lg:col-span-5 space-y-6">
            <button
              onClick={() => setIsPractising(false)}
              className="text-xs font-medium uppercase tracking-widest text-text-muted hover:text-text-main transition-colors flex items-center gap-2 bg-surface px-4 py-2 rounded-lg border border-border"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Exit Practice
            </button>

            <div className="bg-card p-8 rounded-xl space-y-8 border border-border relative overflow-hidden">
              <div className="space-y-4 border-b border-border pb-6 relative z-10">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded bg-primary/10 border border-primary/20 text-[11px] font-medium uppercase tracking-widest text-[#9a3412] dark:text-primary">
                  <Zap className="w-3 h-3" /> Live Blueprint
                </span>
                <h3 className="text-2xl font-display font-medium text-text-main tracking-tight">{selected?.title}</h3>
              </div>

              <div className="p-6 bg-surface text-text-main rounded-xl relative overflow-hidden group border border-border">
                <div className="relative z-10 space-y-6">
                  <p className="text-lg lg:text-xl font-medium leading-relaxed">"{selected?.script}"</p>

                  <div className="flex items-start gap-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="mt-0.5">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                       <span className="text-[11px] font-medium uppercase tracking-widest block text-[#9a3412] dark:text-primary mb-1">Nova's Suggestion</span>
                       <span className="text-xs text-[#9a3412] dark:text-primary font-medium leading-relaxed">{selected?.advice}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 relative z-10">
                <h5 className="text-xs font-medium uppercase tracking-widest text-text-muted">What to keep in mind</h5>
                <div className="space-y-3 bg-surface p-5 rounded-lg border border-border">
                  {[
                    "Watch for 'I'm sorry'—it undercuts what you're about to say.",
                    "Neutral tone. Keep the register low and steady.",
                    "The silent pause is your power transfer. Use it."
                  ].map((tip, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs text-text-muted font-serif italic">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                      {tip}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 flex flex-col min-h-[600px] h-[800px] gap-6 relative">
            {!showCritique ? (
              <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden relative">
                <div className="p-4 border-b border-border bg-surface flex items-center justify-between relative z-10">
                   <div className="flex items-center gap-3">
                     <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                     <span className="text-xs font-medium uppercase tracking-widest text-text-muted">Live Practice</span>
                   </div>
                </div>
                <div className="flex-1 relative z-10 pb-16">
                  <div className="absolute inset-0">
                    <NovaChat
                      key={practiceAttempt}
                      systemInstruction={`You are Nova, an AI recovery coach. Help the user practise setting boundaries for this specific scenario: "${selected?.situation}".
                      The user wants to use this script: "${selected?.script}".
                      ROLEPLAY: You are the manager, client, or family member. Push back - this is skill-building practice, so make it a real test.${pushbackPattern ? ` Lean specifically into this pattern: ${PUSHBACK_PATTERN_LABELS[pushbackPattern]} - ${PUSHBACK_PATTERN_ROLEPLAY_HINT[pushbackPattern]}` : ''}
                      GUARDRAILS: This is a roleplay character, not a real person - never describe this character as manipulative, toxic, or any other character label; just play the pattern. Never grade or score the user numerically.
                      CRITIQUE: After they reply, give them a one-sentence note only if it's genuinely useful - no score, no grade.
                      GOAL: Help them hold or renegotiate their original ask with zero unnecessary apology. Executive tone.`}
                      initialMessage={`"Alright, let's practise. I'll play the other side of this conversation and push back a little — that's the point. Here goes: 'Hey, I know you're at capacity, but I really need this handled by tonight. Can you just make it happen?'"`}
                      profile={profile}
                      onToneChange={onToneChange}
                      onStyleChange={onStyleChange}
                    />
                  </div>
                </div>
                <div className="absolute bottom-4 left-4 right-4 z-20">
                  <button
                    onClick={generateFinalCritique}
                    className="w-full py-4 bg-primary hover:opacity-90 text-primary-foreground rounded-lg font-medium text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3"
                  >
                    <CheckCircle2 className="w-4 h-4" /> End Practice & Get Feedback
                  </button>
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 bg-card border border-border rounded-xl relative overflow-hidden flex flex-col"
              >
                <div className="p-8 lg:p-10 space-y-8 flex-1 overflow-y-auto relative z-10 custom-scrollbar">
                  <div className="flex items-center justify-between border-b border-border pb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-xl font-bold text-text-main tracking-tight">Your Feedback</h4>
                        <span className="text-[11px] uppercase font-medium tracking-widest text-[#9a3412] dark:text-primary">Nova Insight</span>
                      </div>
                    </div>
                  </div>

                  {critiqueLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-6">
                      <Loader2 className="w-10 h-10 animate-spin text-primary" />
                      <p className="text-text-muted text-xs font-medium uppercase tracking-widest">Reviewing your practice session...</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="prose dark:prose-invert max-w-none">
                        <div id="final-critique-text" className="text-text-main text-lg leading-relaxed font-medium">
                          <ReactMarkdown>{finalCritique || ''}</ReactMarkdown>
                        </div>
                      </div>

                      {detailedFeedback && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-8 bg-surface rounded-xl border border-border space-y-6"
                        >
                          <div className="flex items-center gap-3 border-b border-border pb-4">
                             <Zap className="w-5 h-5 text-success dark:text-[#4ade80]" />
                             <span className="text-xs font-medium uppercase tracking-widest text-[#166534] dark:text-[#4ade80]">A closer look</span>
                          </div>
                          <div className="prose dark:prose-invert max-w-none text-text-muted leading-relaxed font-mono text-sm">
                             <ReactMarkdown>{detailedFeedback}</ReactMarkdown>
                          </div>
                        </motion.div>
                      )}
                      
                      {!detailedFeedback && !critiqueLoading && (
                        <button 
                          onClick={generateDetailedFeedback}
                          disabled={feedbackLoading}
                          className="w-full py-4 bg-surface dark:bg-card/[0.02] border border-white/[0.05] text-text-main rounded-xl text-xs items-center justify-center gap-3 font-black uppercase tracking-widest hover:bg-white/[0.05] transition-all flex shadow-sm"
                        >
                          {feedbackLoading ? (
                            <><Loader2 className="w-4 h-4 animate-spin text-primary" /> Deep Diving...</>
                          ) : (
                            <><Target className="w-4 h-4 text-text-muted" /> Request Detailed Feedback</>
                          )}
                        </button>
                      )}
                      
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-border bg-background relative z-10 space-y-2">
                  {PUSHBACK_END_CHOICE_ORDER.map((choice: PushbackEndChoice) => (
                    <button
                      key={choice}
                      onClick={() => {
                        if (choice === 'try_again') tryMomentAgain();
                        else setIsPractising(false);
                      }}
                      className={cn(
                        "w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors",
                        choice === 'try_again'
                          ? "bg-primary hover:opacity-90 text-primary-foreground shadow-lg"
                          : "bg-surface dark:bg-card text-text-main hover:bg-border"
                      )}
                    >
                      {PUSHBACK_END_CHOICE_LABELS[choice]}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};
