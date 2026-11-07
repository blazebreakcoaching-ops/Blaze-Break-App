import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  User,
  Sparkles,
  Loader2,
  Volume2,
  Mic,
  VolumeX,
  Target,
  History as HistoryIcon,
  ThumbsUp,
  ThumbsDown,
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "../lib/utils";
import type { UserProfileData } from "../types";
import { addNovaMemory } from "../lib/nova-brain";
import { secureApiFetch } from "../lib/secure-api";
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from "firebase/auth";
import { novaStorageKey, canPersistNovaChatState } from "../lib/nova-chat-storage";
import { readAccountProfile, patchAccountProfile } from "../lib/account-profile-storage";
import { NovaVoiceCall } from "./NovaVoiceCall";
import { NovaToneControl } from "./NovaToneControl";
import { NovaStyleControl, QUESTIONING_STYLE_OPTIONS, NovaQuestioningStyle } from "./NovaStyleControl";
import { ConfirmDialog } from "./ConfirmDialog";
import { getFeatureFlags } from "../lib/feature-flags";
import { GuardianSupportInvitation } from "./GuardianSupportInvitation";
import { NovaPracticalAssistanceOffer } from "./NovaPracticalAssistanceOffer";
import { useGuardianSupportInvitationEnabled } from "../lib/useGuardianSupportInvitationEnabled";
import { logGuardianSupportEvent } from "../lib/guardian-support-analytics";
import type { NovaTemporaryBeforeWordsContext } from "../../nova-before-words-temporary-context";

// The server's ChatRequestSchema (server.ts) caps history at 50 entries
// and systemInstruction at 3000 characters, and rejects the whole request
// if either is exceeded. The localStorage-persisted chat history grows
// unbounded over real, long-term use, so this component stays well under
// those caps rather than relying on the server's hard ceiling - see
// handleSend below. Automatic persisted context is assembled server-side
// behind account-specific consent checks, not in this browser -
// the server's own getNovaContextAndMetadata is the single place that
// happens now, so it can't be duplicated or bypass the consent gate.
const NOVA_CHAT_HISTORY_LIMIT = 20;
const NOVA_SYSTEM_INSTRUCTION_LIMIT = 2800;

// Read fresh on each render rather than held in component state - this is
// only needed the rare time a Guardian Support Invitation is actually
// shown, so it's not worth a dedicated state slot kept in sync with
// localStorage for the entire component's lifetime, matching the existing
// ad-hoc "read blaze_profile directly" pattern already used elsewhere in
// this file (readStyle, the initial-greeting effect).
function readStoredFullName(): string | undefined {
  return readAccountProfile(auth.currentUser?.uid).fullName;
}

interface Message {
  role: "user" | "model";
  parts: [{ text: string }];
  privacyMetadata?: {
    contextTriggered: boolean;
    modulesUsed: string[];
    rationale: string;
  };
  featureSuggestion?: {
    featureId: string;
    label: string;
    reason: string;
  };
}

export const NovaChat = ({
  systemInstruction,
  initialMessage,
  fingerprint,
  profile,
  onAwardPoints,
  onNavigate,
  onToneChange,
  onStyleChange,
  autoOpenVoice,
  onVoiceAutoOpened,
  temporaryBeforeWordsContext,
  onTemporaryBeforeWordsContextConsumed,
  onRequestPracticalAssistance,
  onShowMeHow,
}: {
  systemInstruction?: string;
  initialMessage?: string;
  fingerprint?: any;
  // The canonical, Firestore-loaded profile (App.tsx's stats.profile) -
  // used only to seed/resync novaTone and questioningStyle below on a
  // browser or device where localStorage's blaze_profile was never
  // written (a fresh device, a cleared cache, or a preference set from
  // elsewhere before this device ever opened Settings). Without this,
  // NovaChat had no way to learn about a preference that genuinely was
  // saved - it would just look reset because the only place it read from
  // was this device's own localStorage.
  profile?: UserProfileData;
  onAwardPoints?: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
  onToneChange?: (tone: string) => void;
  onStyleChange?: (style: NovaQuestioningStyle | undefined) => void;
  // Set by a caller that already promised voice specifically (e.g. the
  // Nova check-in nudge's "Talk with Nova"), so the live call opens
  // immediately instead of requiring a second click on the mic button
  // below. onVoiceAutoOpened lets the caller clear its own flag once
  // consumed, so returning to this tab later doesn't reopen the call
  // unprompted.
  autoOpenVoice?: boolean;
  onVoiceAutoOpened?: () => void;
  // Phase 5E (directive §5), corrected by Phase 5F (directive §4): a
  // session-only Before Words handoff for this ONE outgoing turn only,
  // never persisted by this component. Sent as its own `beforeWordsContext`
  // field in the request body (see handleSend) - the server quarantines
  // and places it in the model's ordinary message channel, never in
  // `systemInstruction`/the elevated-trust channel Phase 5E's version used.
  // The caller (not this component) owns the context's lifetime; `onTemporaryBeforeWordsContextConsumed`
  // fires once it has actually been sent so the caller can clear its own
  // state - "allow skipping and withdrawing temporary context" means the
  // caller can simply never set this prop, or clear it before the next
  // send, rather than this component offering its own separate controls
  // for something that isn't its own data.
  temporaryBeforeWordsContext?: NovaTemporaryBeforeWordsContext | null;
  onTemporaryBeforeWordsContextConsumed?: () => void;
  // Phase 5K: lets a host screen (App.tsx's NovaAgenticJourney mount) open
  // Nova's existing practical-assistance workflow (Invisible Load ->
  // Calendar Protection / Task Deferral) when the user accepts the
  // offer_practical_assistance card below. Optional - when absent (e.g. the
  // dev-preview or other embeddings that don't mount the full journey), the
  // card simply never renders at all, same as onNavigate being absent for
  // suggest_feature.
  onRequestPracticalAssistance?: () => void;
  // Fixed, user-invoked UI help; never sends a message to the model.
  onShowMeHow?: () => void;
}) => {
  // Tone is stored per signed-in account, not in the old browser-wide
  // profile key. The canonical Firestore profile remains authoritative;
  // the passed-in profile covers device cache misses.
  const readTone = (): string =>
    readAccountProfile(auth.currentUser?.uid).novaTone || "";
  const [novaTone, setNovaTone] = useState<string>(() => profile?.novaTone || readTone());
  const handleToneChange = (tone: string) => {
    setNovaTone(tone);
    patchAccountProfile(auth.currentUser?.uid, { novaTone: tone });
    onToneChange?.(tone);
  };
  // If the canonical profile only becomes available (or changes to a real
  // value) after this component already mounted with an empty localStorage
  // read - e.g. Firestore's load resolving, or App.tsx's stats being
  // populated on a device this preference was never saved to locally -
  // adopt it once. Never overwrites a tone the person has already chosen
  // on THIS device in THIS session (that would fight their own most recent
  // action), only fills a genuine local gap.
  useEffect(() => {
    if (profile?.novaTone && !novaTone) {
      setNovaTone(profile.novaTone);
      patchAccountProfile(auth.currentUser?.uid, { novaTone: profile.novaTone });
    }
  }, [profile?.novaTone]);
  // How Nova questions the user - a separate, opt-in axis from tone above.
  // Purely a server-side concern (the chosen style is read fresh from
  // Firestore by both /api/nova/chat and the Nova Live voice route), so
  // unlike Nova's preferred tone, questioningStyle is read by the server
  // and should only be persisted and reflected in the local control.
  const readStyle = (): NovaQuestioningStyle | undefined => {
    const style = readAccountProfile(auth.currentUser?.uid).questioningStyle;
    return QUESTIONING_STYLE_OPTIONS.some((s) => s.value === style)
      ? style as NovaQuestioningStyle : undefined;
  };
  const [questioningStyle, setQuestioningStyle] = useState<NovaQuestioningStyle | undefined>(
    () => (QUESTIONING_STYLE_OPTIONS.some((s) => s.value === profile?.questioningStyle)
      ? (profile?.questioningStyle as NovaQuestioningStyle)
      : readStyle()),
  );
  const handleStyleChange = (style: NovaQuestioningStyle | undefined) => {
    setQuestioningStyle(style);
    patchAccountProfile(auth.currentUser?.uid, { questioningStyle: style });
    onStyleChange?.(style);
  };
  // Same resync reasoning as novaTone above, for the same class of gap.
  useEffect(() => {
    if (
      !questioningStyle &&
      QUESTIONING_STYLE_OPTIONS.some((s) => s.value === profile?.questioningStyle)
    ) {
      const style = profile!.questioningStyle as NovaQuestioningStyle;
      setQuestioningStyle(style);
      patchAccountProfile(auth.currentUser?.uid, { questioningStyle: style });
    }
  }, [profile?.questioningStyle]);
  const loadMessages = (identityOverride?: string): Message[] => {
    try {
      const saved = localStorage.getItem(novaStorageKey("nova_chat_history", identityOverride));
      if (!saved) return [];
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is Message =>
        !!item && (item.role === 'user' || item.role === 'model') &&
        Array.isArray(item.parts) && typeof item.parts[0]?.text === 'string');
    } catch {
      // Corrupt or blocked browser storage is not a chat or signup failure.
      return [];
    }
  };
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [messagesOwnerUid, setMessagesOwnerUid] = useState(() => auth.currentUser?.uid ?? '__pending__');
  // Reads from the single shared source of truth (feature-flags.ts)
  // rather than a hand-duplicated default that had drifted out of sync
  // with it - this local default said enable_nova_voice: false, and
  // loadFlags() only ever overwrote it if localStorage already had a
  // saved value, so a brand-new user (no saved flags yet at all) stayed
  // stuck on the stale false default forever, regardless of what the
  // real, current default elsewhere said.
  const [flags, setFlags] = useState<{ [key: string]: boolean }>(getFeatureFlags());

  useEffect(() => {
    const loadFlags = () => setFlags(getFeatureFlags());
    window.addEventListener("storage", loadFlags);
    window.addEventListener("feature-flags-updated", loadFlags);
    return () => {
      window.removeEventListener("storage", loadFlags);
      window.removeEventListener("feature-flags-updated", loadFlags);
    };
  }, []);

  const voiceFeatureEnabled = flags.enable_nova_voice;

  const loadRatings = (identityOverride?: string): { [key: number]: "up" | "down" | null } => {
    try {
      const saved = localStorage.getItem(novaStorageKey("nova_chat_ratings", identityOverride));
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };
  const [ratings, setRatings] = useState<{
    [key: number]: "up" | "down" | null;
  }>(loadRatings);
  const [activeFeedbackForm, setActiveFeedbackForm] = useState<number | null>(
    null,
  );
  const loadFeedbackNotes = (identityOverride?: string): { [key: number]: string } => {
    try {
      const saved = localStorage.getItem(novaStorageKey("nova_chat_feedback_notes", identityOverride));
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };
  const [feedbackNotes, setFeedbackNotes] = useState<{ [key: number]: string }>(
    loadFeedbackNotes,
  );
  const loadFeedbackTag = (identityOverride?: string): { [key: number]: string } => {
    try {
      const saved = localStorage.getItem(novaStorageKey("nova_chat_feedback_tags", identityOverride));
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };
  const [feedbackTag, setFeedbackTag] = useState<{ [key: number]: string }>(
    loadFeedbackTag,
  );
  const loadIsFeedbackSubmitted = (identityOverride?: string): { [key: number]: boolean } => {
    try {
      const saved = localStorage.getItem(novaStorageKey("nova_chat_feedback_submitted", identityOverride));
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState<{
    [key: number]: boolean;
  }>(loadIsFeedbackSubmitted);

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
      novaStorageKey("nova_chat_feedback_submitted", currentUid),
      JSON.stringify(newSubmitted),
    );

    // Persist all other states
    localStorage.setItem(novaStorageKey("nova_chat_ratings", currentUid), JSON.stringify(ratings));
    localStorage.setItem(
      novaStorageKey("nova_chat_feedback_notes", currentUid),
      JSON.stringify({ ...feedbackNotes, [index]: notes }),
    );
    localStorage.setItem(
      novaStorageKey("nova_chat_feedback_tags", currentUid),
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
  const loadIsVoiceEnabled = (identityOverride?: string): boolean => {
    try {
      const saved = localStorage.getItem(novaStorageKey("nova_voice_enabled", identityOverride));
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  };
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(loadIsVoiceEnabled);
  const [voiceOwnerUid, setVoiceOwnerUid] = useState(() => auth.currentUser?.uid ?? '__pending__');

  // Phase 5N (directive §1/§2) - App.tsx never remounts NovaChat across a
  // sign-out/sign-in transition (only AuthProvider's context value
  // changes, which re-renders the SAME component instance), so even
  // though every key above is now scoped by novaStorageKey() to the
  // identity that was active when this component first mounted, the
  // in-memory state above would otherwise keep showing that FIRST
  // identity's messages/ratings/feedback/voice-preference after a real
  // sign-out and a different sign-in on the same tab - the exact
  // cross-account leak this phase's audit set out to close, just moved
  // from storage into memory. This effect re-reads every one of those
  // pieces of state the moment the signed-in Firebase uid actually
  // changes, so a new identity always sees its OWN data (or a correct
  // empty state, if it has none yet) and never a stale previous one.
  // didMountRef skips the very first run: the lazy useState initializers
  // above already loaded the correct data for whichever identity was
  // active at first paint, and re-running immediately would be redundant
  // (not wrong, just wasted work) and race with their own render.
  const [currentUid, setCurrentUid] = useState(() => auth.currentUser?.uid ?? '__pending__');
  const observedUidRef = useRef(currentUid);
  const identityEpochRef = useRef(0);
  const didMountRef = useRef(false);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const nextUid = user?.uid ?? '__pending__';
      if (observedUidRef.current !== nextUid) {
        observedUidRef.current = nextUid;
        identityEpochRef.current += 1;
        // An old request must not leave the new account stuck on "thinking".
        setLoading(false);
        setInput('');
        stopAudio();
        setShowVoiceCall(false);
        setSpeakingIndex(null);
        setAudioLoading(false);
      }
      setCurrentUid(nextUid);
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    // Pass the uid this effect actually fired for explicitly, rather than
    // letting loadX() re-read the live auth.currentUser - a real,
    // demonstrated race otherwise: linkWithCredential (anonymous -> real
    // account, same uid) can still deliver more than one onAuthStateChanged
    // notification before settling, and the plain [messages]-dependent
    // autosave effect below re-reads the live uid too, so a load triggered
    // by an intermediate notification could be followed by a save that
    // targets whatever identity is live *by then* - not the one this
    // reload actually read from - overwriting that identity's real saved
    // history with the stale/empty state this reload produced.
    const restored = loadMessages(currentUid);
    if (restored.length > 0) {
      setMessages(restored);
    } else {
      const savedProfile = readAccountProfile(currentUid);
      const firstName = savedProfile.useNameInGreetings && typeof savedProfile.fullName === 'string'
        ? savedProfile.fullName.trim().split(/\s+/)[0] : '';
      setMessages([{
        role: 'model',
        parts: [{ text: initialMessage || `I'm Nova. ${firstName ? `Welcome, ${firstName}. ` : ''}What's on your mind today?` }],
      }]);
    }
    setMessagesOwnerUid(currentUid);
    setRatings(loadRatings(currentUid));
    setFeedbackNotes(loadFeedbackNotes(currentUid));
    setFeedbackTag(loadFeedbackTag(currentUid));
    setIsFeedbackSubmitted(loadIsFeedbackSubmitted(currentUid));
    setIsVoiceEnabled(loadIsVoiceEnabled(currentUid));
    setVoiceOwnerUid(currentUid);
    setActiveToolSuggestion(null);
    setActiveGuardianOffer(null);
    setActivePracticalAssistanceOffer(null);
  }, [currentUid]);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [activeToolSuggestion, setActiveToolSuggestion] = useState<{
    name: string;
    tab?: string;
    description: string;
  } | null>(null);
  // Phase 5L (directive §6) - "prevent repetitive prompting after
  // dismissal": once the user has explicitly closed a suggestion for a
  // specific feature (Start or Ignore - either way they've addressed it),
  // that exact featureId is never auto-offered again this session. Mirrors
  // the guardian/practical-assistance "shown once" refs below, just keyed
  // per-feature since suggest_feature can legitimately suggest several
  // different features across one conversation.
  const dismissedFeatureIdsRef = useRef<Set<string>>(new Set());
  const dismissActiveToolSuggestion = () => {
    if (activeToolSuggestion?.tab) dismissedFeatureIdsRef.current.add(activeToolSuggestion.tab);
    setActiveToolSuggestion(null);
  };
  // Guardian Support Invitation: whether Nova has offered it in THIS
  // session already - never re-offered more than once in a conversation
  // unless the user raises it again themselves (matches
  // docs/GUARDIAN_SUPPORT_SPEC.md §C.2's own rule for its own guardian
  // offer). Session-scoped in-memory state is enough here; this doesn't
  // need to survive a reload.
  const [activeGuardianOffer, setActiveGuardianOffer] = useState<{ reason: string } | null>(null);
  const guardianOfferShownRef = useRef(false);
  const guardianInvitationEnabled = useGuardianSupportInvitationEnabled();
  // Phase 5K: same "offered once per session unless raised again" rule as
  // the Guardian Support Invitation above, for offer_practical_assistance.
  const [activePracticalAssistanceOffer, setActivePracticalAssistanceOffer] = useState<{ reason: string } | null>(null);
  const practicalAssistanceOfferShownRef = useRef(false);
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
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const dictationRecognitionRef = useRef<any>(null);

  const startDictation = () => {
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setDictationError(
          "Voice input isn't supported in this browser.",
        );
        setTimeout(() => setDictationError(null), 4000);
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
      } catch (e) {
        // Non-fatal - stop() throws if recognition has already ended;
        // the UI state below still needs to update either way.
      }
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

  // Read fresh at send-time, not cached in state computed once at mount -
  // this used to be a useEffect(..., []) that ran exactly once, so a tone
  // or style change made mid-session (via the controls below, or from
  // Settings in another tab) never reached the next text message until the
  // whole component remounted. novaTone/questioningStyle state above is
  // kept live by handleToneChange/handleStyleChange, so reading them
  // directly here (rather than re-parsing localStorage) always reflects
  // the person's current choice, matching NovaToneControl's own promise
  // that "Nova switches straightaway."

  useEffect(() => {
    // currentUid (the identity this component currently believes is
    // active, updated by the onAuthStateChanged listener above), not a
    // fresh live read - see novaStorageKey's own comment on why a plain
    // live read here can race the identity-reload effect above and
    // overwrite a different identity's saved history.
    if (!canPersistNovaChatState(messagesOwnerUid, currentUid, auth.currentUser?.uid ?? null)) return;
    try {
      localStorage.setItem(novaStorageKey("nova_chat_history", currentUid), JSON.stringify(messages));
    } catch {
      // Private mode can restrict storage. Messages remain in this session.
    }
  }, [messages, messagesOwnerUid, currentUid]);

  useEffect(() => {
    if (!canPersistNovaChatState(voiceOwnerUid, currentUid, auth.currentUser?.uid ?? null)) return;
    try {
      localStorage.setItem(novaStorageKey("nova_voice_enabled", currentUid), String(isVoiceEnabled));
    } catch {
      // A browser preference is optional; never break Nova's chat.
    }
  }, [isVoiceEnabled, voiceOwnerUid, currentUid]);

  useEffect(() => {
    if (messages.length === 0) {
      let greeting =
        initialMessage ||
        "I'm Nova. What's on your mind today?";
      const profileData = readAccountProfile(auth.currentUser?.uid);

      if (!initialMessage && (fingerprint || Object.keys(profileData).length > 0)) {
        // Use a name only when the person has explicitly allowed greetings.
        // Do not infer a job title, identity or needs from their profile.
        const firstName = profileData?.useNameInGreetings && typeof profileData?.fullName === "string"
          ? profileData.fullName.trim().split(/\s+/)[0]
          : "";
        greeting = `I'm Nova. ${firstName ? `Welcome, ${firstName}. ` : ""}What would help you most today?`;
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

  // Live voice is now a dedicated full-screen call (NovaVoiceCall) driven by
  // the shared useNovaLiveVoice hook: AudioWorklet capture, streamed playback,
  // barge-in, a live transcript, mute, and calm in-UI errors (no more browser
  // alert()). Opening the call is just a flag; all the real-time logic lives
  // in one place instead of being duplicated here. This builds the context
  // the call is primed with, unchanged from what the old inline path sent.
  // Saved-memory content used to be duplicated in here directly from
  // getNovaBrain() - unfiltered, with no consent check. It's removed: the
  // server's own liveSystemInstruction (built from getNovaContextAndMetadata,
  // server.ts) is now the only carrier of memory content into a voice call.
  const buildVoiceContext = () => {
    return `Recent chat history: ${messages
      .slice(-5)
      .map((m) => m.role + ": " + m.parts[0].text)
      .join("\n")}.
${novaTone ? `\nThe user's preferred tone for Nova is: ${novaTone}. Match it.\n` : ""}
We are now in real-time voice mode. Be concise and conversational, you don't need to use markdown.`;
  };

  const openVoiceCall = () => setShowVoiceCall(true);

  // Only auto-opens once the voice feature flag is confirmed on, matching
  // the same gate the manual mic button (below) is rendered behind - if
  // voice isn't available, this just leaves the person in text chat
  // rather than opening a call surface that doesn't apply to them.
  useEffect(() => {
    if (!autoOpenVoice) return;
    if (voiceFeatureEnabled) openVoiceCall();
    onVoiceAutoOpened?.();
  }, [autoOpenVoice, voiceFeatureEnabled, onVoiceAutoOpened]);

  useEffect(() => {
    return () => {
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

  const playPcmAudio = async (base64Audio: string, shouldPlay: () => boolean = () => true) => {
    if (!shouldPlay()) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new window.AudioContext({ sampleRate: 24000 });
    }
    const audioCtx = audioCtxRef.current;
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    if (!shouldPlay()) return;

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
    if (!shouldPlay()) {
      source.disconnect();
      return;
    }
    source.start(0);
    activeSourceRef.current = source;
  };

  const speakText = async (text: string, index: number) => {
    const requestUid = currentUid;
    const requestEpoch = identityEpochRef.current;
    const stillCurrentPlayback = () =>
      auth.currentUser?.uid === requestUid &&
      observedUidRef.current === requestUid &&
      identityEpochRef.current === requestEpoch;
    if (!stillCurrentPlayback()) return;
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
      if (!stillCurrentPlayback()) return;
      setAudioLoading(false);

      if (data.error) throw new Error(data.error);

      if (data.audio) {
        await playPcmAudio(data.audio, stillCurrentPlayback);
      } else {
        setSpeakingIndex(null);
      }
    } catch (error: any) {
      if (!stillCurrentPlayback()) return;
      console.warn("Nova voice playback unavailable", { status: typeof error?.status === 'number' ? error.status : undefined });
      setAudioLoading(false);
      setSpeakingIndex(null);
      // Let the user know the TTS failed for visibility
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          parts: [
            {
              text: '*Voice is unavailable just now. You can continue by typing.*',
            },
          ],
        },
      ]);
    }
  };


  const handleSend = async (overrideInput?: string) => {
    const messageText = overrideInput || input;
    const requestUid = currentUid;
    const requestEpoch = identityEpochRef.current;
    const stillCurrentRequest = () =>
      auth.currentUser?.uid === requestUid &&
      observedUidRef.current === requestUid &&
      identityEpochRef.current === requestEpoch;
    if (!messageText.trim() || loading ||
        !canPersistNovaChatState(messagesOwnerUid, currentUid, auth.currentUser?.uid ?? null)) return;

    const userMsg: Message = { role: "user", parts: [{ text: messageText }] };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      if (!stillCurrentRequest()) return;
      // The server's consent-gated context builder is the ONLY source of
      // persisted fingerprint, workload, recovery and onboarding details.
      // The client sends the current message/history plus host instructions,
      // not silent reads of private Firestore documents.
      const fullSystemInstruction = `
            ${systemInstruction || ""}
            Use recent messages in this conversation when relevant, without assuming unshared background details.
            ${novaTone ? `User-selected Nova tone: ${novaTone}.` : ""}
          `;
      // Phase 5F (directive §4): Before Words content travels as its own
      // field now, never folded into `fullSystemInstruction` above. Phase
      // 5E's version concatenated the person's own words into the exact
      // string sent as `systemInstruction` - the model's elevated-trust
      // channel, the same one Blaze Break's own safety rules occupy - with
      // no framing marking it as untrusted and nothing stopping it from
      // forging a fake instruction boundary. The server now quarantines
      // this field itself (nonce-delimited, explicitly framed as "not an
      // instruction") and sends it in the ordinary message channel instead -
      // see server.ts's `/api/nova/chat` handler and
      // quarantineTemporaryBeforeWordsContextForPrompt. Included for THIS
      // turn only - never stored in `messages`/localStorage history
      // (`userMsg` above is built from the raw `messageText`, untouched by
      // this), never re-sent on a later turn unless the caller explicitly
      // keeps setting the prop.
      if (temporaryBeforeWordsContext) onTemporaryBeforeWordsContextConsumed?.();

      const response = await secureApiFetch("/api/nova/chat", {
        method: "POST",
        data: {
          message: messageText,
          // The server rejects the whole request if history has more than
          // 50 entries, and nova_chat_history in localStorage is never
          // pruned client-side - only the recent turns matter for a live
          // reply anyway.
          history: messages.slice(-NOVA_CHAT_HISTORY_LIMIT),
          // A hard ceiling as a last line of defence: even with the brain
          // context capped above, a long fingerprint or workload-check-in
          // answer could still push this over the server's 3000-character
          // cap and silently break the whole chat with a "forbidden fields"
          // validation error.
          // Context is untrusted; the server places it only in the
          // user-turn message, never its privileged system prompt.
          conversationContext: fullSystemInstruction.length > NOVA_SYSTEM_INSTRUCTION_LIMIT
            ? fullSystemInstruction.slice(0, NOVA_SYSTEM_INSTRUCTION_LIMIT)
            : fullSystemInstruction,
          ...(temporaryBeforeWordsContext ? { beforeWordsContext: temporaryBeforeWordsContext } : {}),
        },
      });

      const data = await response.json();
      if (!stillCurrentRequest()) return;

      if (data.error) throw new Error(data.error);

      // Phase 5L (directive §6) - never re-offer a specific feature the
      // user already explicitly closed this session (see
      // dismissedFeatureIdsRef's own comment above).
      const suggestFeatureCall = (data.planTrace || []).find((t: any) => t.tool === 'suggest_feature' && t.result?.suggested && !dismissedFeatureIdsRef.current.has(t.result.featureId));
      const botMessage: Message = {
        role: "model",
        parts: [{ text: data.text }],
        privacyMetadata: data.privacyMetadata,
        featureSuggestion: suggestFeatureCall
          ? { featureId: suggestFeatureCall.result.featureId, label: suggestFeatureCall.result.label, reason: suggestFeatureCall.result.reason }
          : undefined,
      };

      if (suggestFeatureCall) {
        setActiveToolSuggestion({
          name: suggestFeatureCall.result.label,
          tab: suggestFeatureCall.result.featureId,
          description: suggestFeatureCall.result.reason,
        });
      } else {
        setActiveToolSuggestion(null);
      }

      // Guardian Support Invitation: same planTrace pattern as
      // suggest_feature above, but only ever shown once per session unless
      // the user raises it again - offer_guardian_support already
      // self-gates on the server flag (executeOfferGuardianSupport in
      // server.ts), so `offered` only comes back true when the feature is
      // actually on.
      const guardianOfferCall = (data.planTrace || []).find((t: any) => t.tool === 'offer_guardian_support' && t.result?.offered);
      if (guardianOfferCall && guardianInvitationEnabled && !guardianOfferShownRef.current) {
        guardianOfferShownRef.current = true;
        setActiveGuardianOffer({ reason: guardianOfferCall.result.reason });
        logGuardianSupportEvent('invitation_shown');
      }

      // Phase 5K - same planTrace pattern again, for the new
      // offer_practical_assistance coordinator tool. Only renders when
      // onRequestPracticalAssistance is actually provided, so this card
      // never appears for a host that hasn't wired a destination for it.
      const practicalAssistanceOfferCall = (data.planTrace || []).find((t: any) => t.tool === 'offer_practical_assistance' && t.result?.offered);
      if (practicalAssistanceOfferCall && onRequestPracticalAssistance && !practicalAssistanceOfferShownRef.current) {
        practicalAssistanceOfferShownRef.current = true;
        setActivePracticalAssistanceOffer({ reason: practicalAssistanceOfferCall.result.reason });
      }

      const newMessages = [...messages, userMsg, botMessage];
      setMessages(newMessages);

      if (voiceFeatureEnabled && isVoiceEnabled) {
        speakText(data.text, newMessages.length - 1);
      }
    } catch (error: any) {
      if (!stillCurrentRequest()) return;
      // Do not render backend errors, server stack details or model output
      // marked as an error verbatim into the user's private conversation.
      console.warn("Nova chat request unsuccessful", {
        status: typeof error?.status === 'number' ? error.status : undefined,
      });
      const errorMessage: Message = {
        role: "model",
        parts: [
          {
            text: "Nova couldn't respond just now. You can try sending your message again.",
          },
        ],
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      if (stillCurrentRequest()) setLoading(false);
    }
  };

  // Hiding stale React state on identity changes is important even though
  // storage keys are UID-specific. The previous chat must never flash on
  // screen while new-user effects restore the correct conversation.
  if (!canPersistNovaChatState(messagesOwnerUid, currentUid, auth.currentUser?.uid ?? null) ||
      voiceOwnerUid !== currentUid) {
    return (
      <div role="status" aria-live="polite" className="h-full min-h-48 flex items-center justify-center rounded-2xl bg-card border border-border p-5 text-sm text-text-muted">
        Loading your conversation…
      </div>
    );
  }

  return (
    <div className="ember-midnight ember-nova-room flex flex-col h-full bg-card rounded-2xl border border-border overflow-hidden relative transition-all duration-500">
      <div className="px-4 py-4 sm:p-5 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="ember-nova-mark w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary relative overflow-hidden group">
            <Sparkles className="w-4 h-4 relative z-10" />
          </div>
          <div>
            <h3 className="text-sm font-display font-medium text-text-main tracking-tight">
              Nova Blaze
            </h3>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[11px] uppercase tracking-widest font-medium text-text-muted">
                Ready
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
          {onShowMeHow && (
            <button
              type="button"
              data-nova-guide-target="nova-show-how"
              onClick={onShowMeHow}
              className="min-h-10 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
            >
              Show me how
            </button>
          )}
          <details className="text-sm text-text-muted">
            <summary className="cursor-pointer px-2 py-2 rounded-lg hover:text-text-main focus-visible:outline-2 focus-visible:outline-primary">
              Preferences
            </summary>
            <div className="flex flex-wrap gap-2 items-center py-2">
              <NovaToneControl value={novaTone} onChange={handleToneChange} />
              <NovaStyleControl value={questioningStyle} onChange={handleStyleChange} />
            </div>
          </details>
          {voiceFeatureEnabled && (
            <button
              onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
              aria-pressed={isVoiceEnabled}
              aria-label={isVoiceEnabled ? "Turn off voice replies" : "Turn on voice replies"}
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
            onClick={() => setConfirmingClear(true)}
            aria-label="Clear conversation"
            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-text-muted hover:text-destructive transition-colors"
          >
            <HistoryIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {(
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-relevant="additions"
          className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8 no-scrollbar"
        >
          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-8">
              <div className="space-y-4">
                <div className="ember-nova-mark w-20 h-20 rounded-full bg-primary/10 mx-auto flex items-center justify-center text-primary">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h4 className="text-2xl font-serif font-semibold text-text-main tracking-tight">
                  Nova Blaze is ready
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
                    className="p-4 text-sm font-medium text-text-muted border border-border hover:border-primary/40 hover:text-[#9a3412] dark:hover:text-primary transition-colors rounded-lg"
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
                        aria-label={speakingIndex === i ? "Stop reading message aloud" : "Read message aloud"}
                        aria-pressed={speakingIndex === i}
                        className={cn(
                          "absolute -right-12 top-0 w-10 h-10 bg-card border border-border rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-primary",
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
                          <span>Permissioned context used: Uses {msg.privacyMetadata.modulesUsed?.length > 0 ? "compact " + msg.privacyMetadata.modulesUsed.map((m: string) => m.replace(/_|-/g, ' ')).join(', ') + " summary" : "no personalised context"}. No raw notes shared (completely hidden).</span>
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
                                  novaStorageKey("nova_chat_ratings", currentUid),
                                  JSON.stringify(newR),
                                );
                                setActiveFeedbackForm(
                                  activeFeedbackForm === i ? null : i,
                                );
                              }}
                              className={cn(
                                "p-1.5 rounded-lg transition-all border cursor-pointer",
                                ratings[i] === "up"
                                  ? "bg-success/10 text-success dark:text-[#4ade80] border-success/20"
                                  : "bg-surface/30 text-text-muted hover:text-success dark:hover:text-[#4ade80] border-transparent",
                              )}
                              aria-pressed={ratings[i] === "up"}
                              aria-label="Helpful advice"
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
                                  novaStorageKey("nova_chat_ratings", currentUid),
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
                              aria-pressed={ratings[i] === "down"}
                              aria-label="Unhelpful advice"
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
                                    aria-pressed={feedbackTag[i] === tag}
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
                                aria-label="Refine Nova's context brain (optional)"
                                placeholder="Refine Nova's context brain (optional)..."
                                className="w-full bg-white dark:bg-surface border border-border/40 rounded-xl px-3 py-2 text-[11px] font-medium text-text-main placeholder: focus:outline-none focus:border-primary"
                              />
                              <button
                                onClick={() => submitFeedbackMemory(i)}
                                className="w-full py-2 bg-card text-text-main border border-border/10 rounded-xl text-[11px] uppercase font-black tracking-widest hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
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
                              className="text-[11px] text-success dark:text-[#4ade80] font-extrabold uppercase tracking-widest flex items-center gap-1 animate-pulse"
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

                  {/* Phase 5L (directive §6) - "prevent duplicate offers
                      from competing tools": these three cards all attach
                      to this same last model message, but only ever render
                      one at a time, in a fixed priority - a safety-related
                      Guardian offer outranks the organisational Practical
                      Assistance offer, which outranks a generic feature
                      suggestion - rather than stacking whichever happened
                      to fire. */}
                  {activeToolSuggestion &&
                    !activeGuardianOffer &&
                    !activePracticalAssistanceOffer &&
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
                            <span className="text-[11px] font-medium uppercase tracking-widest text-[#9a3412] dark:text-primary flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-[#9a3412] dark:text-primary" />{" "}
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
                                dismissActiveToolSuggestion();
                              }}
                              className="px-4 py-2 bg-primary/10 hover:bg-primary hover:text-primary-foreground font-medium text-[11px] uppercase tracking-wider rounded-lg transition-colors text-[#9a3412] dark:text-primary border border-primary/25 cursor-pointer"
                            >
                              Open Tool
                            </button>
                          )}
                          <button
                            onClick={() => {
                              handleSend(
                                `Start ${activeToolSuggestion.name}.`,
                              );
                              dismissActiveToolSuggestion();
                            }}
                            className="px-4 py-2 bg-primary hover:opacity-90 text-primary-foreground font-medium text-[11px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                          >
                            Start
                          </button>
                          <button
                            onClick={dismissActiveToolSuggestion}
                            className="px-3 py-2 border border-border text-text-muted hover:text-text-main font-medium text-[11px] uppercase tracking-wider rounded-lg hover:bg-surface transition-colors cursor-pointer"
                          >
                            Ignore
                          </button>
                        </div>
                      </motion.div>
                    )}

                  {activeGuardianOffer &&
                    i === messages.length - 1 &&
                    msg.role === "model" && (
                      <div className="relative z-10 pt-1">
                        <GuardianSupportInvitation
                          userName={readStoredFullName()}
                          onDismiss={() => setActiveGuardianOffer(null)}
                        />
                      </div>
                    )}

                  {activePracticalAssistanceOffer &&
                    !activeGuardianOffer &&
                    i === messages.length - 1 &&
                    msg.role === "model" && (
                      <div className="relative z-10 pt-1">
                        <NovaPracticalAssistanceOffer
                          reason={activePracticalAssistanceOffer.reason}
                          onOpen={() => {
                            setActivePracticalAssistanceOffer(null);
                            onRequestPracticalAssistance?.();
                          }}
                          onDismiss={() => setActivePracticalAssistanceOffer(null)}
                        />
                      </div>
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
                  <Sparkles className="w-4 h-4 text-primary-foreground relative z-10" />
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
                    <span className="text-xs font-black uppercase tracking-[0.25em] text-[#9a3412] dark:text-primary animate-pulse">
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
      {(
        <div className="p-6 border-t border-border font-sans">
          <div className="flex items-center gap-3">
            {voiceFeatureEnabled && (
              <button
                onClick={openVoiceCall}
                aria-label="Start a live voice call with Nova"
                title="Talk with Nova"
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
                aria-label="Message Nova"
                data-nova-guide-target="nova-message-input"
                placeholder={
                  dictationError
                    ? dictationError
                    : isDictating
                    ? "Listening... Speak naturally"
                    : "Type or speak to Nova..."
                }
                className={cn(
                  "w-full bg-surface text-text-main border rounded-xl py-4 px-12 pr-16 text-base font-display focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-muted",
                  dictationError
                    ? "border-destructive/60 placeholder:text-destructive"
                    : isDictating
                    ? "border-destructive ring-2 ring-destructive/15 bg-destructive/[0.04] text-text-main animate-pulse"
                    : "border-border focus:border-primary",
                )}
              />

              {/* Dictation Speaking Microphone Button left aligned inside input container */}
              <button
                type="button"
                onClick={isDictating ? stopDictation : startDictation}
                aria-pressed={isDictating}
                aria-label={isDictating ? "Stop voice dictation" : "Start voice dictation"}
                className={cn(
                  "absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer",
                  isDictating
                    ? "bg-destructive text-destructive-foreground animate-pulse scale-110"
                    : "text-text-muted hover:text-destructive hover:bg-surface/50 hover:scale-105",
                )}
              >
                <Mic
                  className={cn("w-4.5 h-4.5", isDictating && "animate-bounce")}
                />
              </button>

              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="ember-nova-send absolute right-2 top-2 w-11 h-11 bg-primary text-primary-foreground rounded-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 cursor-pointer"
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <NovaVoiceCall
        isOpen={showVoiceCall}
        onClose={() => setShowVoiceCall(false)}
        buildInitialPrompt={buildVoiceContext}
        onNavigate={onNavigate}
        onAwardPoints={onAwardPoints}
        onRequestPracticalAssistance={onRequestPracticalAssistance}
      />

      <ConfirmDialog
        open={confirmingClear}
        title="Clear this conversation?"
        message="This can't be undone."
        confirmLabel="Clear"
        onConfirm={() => {
          setMessages([]);
          localStorage.removeItem(novaStorageKey("nova_chat_history", currentUid));
          setConfirmingClear(false);
        }}
        onCancel={() => setConfirmingClear(false)}
      />
    </div>
  );
};
