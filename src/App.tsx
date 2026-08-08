/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Home,
  LifeBuoy,
  X,
  Plus,
  RefreshCw,
  MapPin,
  BatteryFull,
  MessageSquare,
  Book,
  Library,
  Sparkles,
  Shield,
  Users,
  User,
  Search,
  ArrowRight,
  ArrowLeft,
  CreditCard,
  History,
  AlertCircle,
  Trophy,
  Gift,
  CheckCircle,
  Zap,
  Waves,
  Battery,
  ShieldAlert,
  Moon,
  Sun,
  Volume2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Menu,
  Wind,
  Clock,
  Activity,
  DoorOpen,
  ShieldCheck,
  Flame,
  CheckSquare,
  MinusCircle,
  ChefHat,
  Feather,
  LineChart,
  Settings,
  Compass,
  HelpCircle,
  Apple,
  Brain,
  Lock,
  HeartPulse,
  PencilLine,
  Check,
  Calendar,
  AlertTriangle,
} from "lucide-react";

import {
  BurnoutFingerprint,
  UserStats,
  BADGES,
  SupportContact,
} from "./types.ts";
import { cn } from "./lib/utils.ts";
const DiagnoseView = lazy(() => import("./components/DiagnoseSection.tsx").then(m => ({ default: m.DiagnoseView })));
const ResultView = lazy(() => import("./components/DiagnoseSection.tsx").then(m => ({ default: m.ResultView })));
const EnergyBudgetTool = lazy(() => import("./components/EnergyBudget.tsx").then(m => ({ default: m.EnergyBudgetTool })));
const BoundaryRehearsal = lazy(() => import("./components/BoundaryRehearsal.tsx").then(m => ({ default: m.BoundaryRehearsal })));
const BoundaryAutopilot = lazy(() => import("./components/BoundaryAutopilot.tsx").then(m => ({ default: m.BoundaryAutopilot })));
const ReflectSection = lazy(() => import("./components/ReflectSection.tsx").then(m => ({ default: m.ReflectSection })));
const NovaChat = lazy(() => import("./components/NovaChat.tsx").then(m => ({ default: m.NovaChat })));
import { Walkthrough } from "./components/Walkthrough.tsx";
import { CrisisSupportModal, CrisisSupportButton } from "./components/CrisisSupport.tsx";
const NovaGuardianRelay = lazy(() => import("./components/NovaGuardianRelay.tsx").then(m => ({ default: m.NovaGuardianRelay })));
const OrgDashboard = lazy(() => import("./components/OrgDashboard.tsx").then(m => ({ default: m.OrgDashboard })));
const PrivacyVault = lazy(() => import("./components/PrivacyVault.tsx").then(m => ({ default: m.PrivacyVault })));
import { GamificationDisplay } from "./components/GamificationDisplay.tsx";
import { ArchetypeBlend } from "./components/ArchetypeBlend.tsx";
import { RecoveryExplanation } from "./components/RecoveryExplanation.tsx";
import { LandingPage } from "./components/LandingPage.tsx";
import { SituationalOnboarding } from "./components/SituationalOnboarding.tsx";
import { DailyCheckIn } from "./components/DailyCheckIn.tsx";
import { ConnectedDailyCheckIn } from "./components/ConnectedRecoveryModules.tsx";
const NegotiatorTool = lazy(() => import("./components/NegotiatorTool.tsx").then(m => ({ default: m.NegotiatorTool })));
import { RelapseRadar } from "./components/RelapseRadar.tsx";
import { MOCK_DEBTS } from "./constants.ts";

const ResourceLibrary = lazy(() => import("./components/ResourceLibrary.tsx").then(m => ({ default: m.ResourceLibrary })));
const NervousSystemReset = lazy(() => import("./components/NervousSystemReset.tsx").then(m => ({ default: m.NervousSystemReset })));
const AnxietyResetMode = lazy(() => import("./components/AnxietyResetMode.tsx").then(m => ({ default: m.AnxietyResetMode })));

const MicroRecovery = lazy(() => import("./components/MicroRecovery.tsx").then(m => ({ default: m.MicroRecovery })));
const SleepBuilder = lazy(() => import("./components/SleepBuilder.tsx").then(m => ({ default: m.SleepBuilder })));
const MovementSnacks = lazy(() => import("./components/MovementSnacks.tsx").then(m => ({ default: m.MovementSnacks })));
const DecompressionDoorway = lazy(() => import("./components/DecompressionDoorway.tsx").then(m => ({ default: m.DecompressionDoorway })));
const DigitalBoundaryShield = lazy(() => import("./components/DigitalBoundaryShield.tsx").then(m => ({ default: m.DigitalBoundaryShield })));
const ResentmentTracker = lazy(() => import("./components/ResentmentTracker.tsx").then(m => ({ default: m.ResentmentTracker })));
const WorkloadRealityCheck = lazy(() => import("./components/WorkloadRealityCheck.tsx").then(m => ({ default: m.WorkloadRealityCheck })));
const OneLessThing = lazy(() => import("./components/OneLessThing.tsx").then(m => ({ default: m.OneLessThing })));
const RecoveryRecipes = lazy(() => import("./components/RecoveryRecipes.tsx").then(m => ({ default: m.RecoveryRecipes })));
const RecoveryFuelEngine = lazy(() => import("./components/RecoveryFuelEngine.tsx").then(m => ({ default: m.RecoveryFuelEngine })));
const RecoveryIntelligenceLayer = lazy(() => import("./components/RecoveryIntelligenceLayer.tsx").then(m => ({ default: m.RecoveryIntelligenceLayer })));
const FaithValuesMode = lazy(() => import("./components/FaithValuesMode.tsx").then(m => ({ default: m.FaithValuesMode })));
const OutcomeTracker = lazy(() => import("./components/OutcomeTracker.tsx").then(m => ({ default: m.OutcomeTracker })));
import { OmniNova } from "./components/OmniNova.tsx";
const EnergyBudgetMatrix = lazy(() => import("./components/EnergyBudgetMatrix.tsx").then(m => ({ default: m.EnergyBudgetMatrix })));
const RuminationFurnace = lazy(() => import("./components/RuminationFurnace.tsx").then(m => ({ default: m.RuminationFurnace })));
import { SettingsModal } from "./components/SettingsModal.tsx";
const FutureSelfSimulator = lazy(() => import("./components/FutureSelfSimulator.tsx").then(m => ({ default: m.FutureSelfSimulator })));
const AssuranceCentre = lazy(() => import("./components/AssuranceCentre.tsx").then(m => ({ default: m.AssuranceCentre })));
import { SyncEngine, AuthStatusTracker } from "./lib/sync.tsx";
import { useAuth } from "./lib/auth.tsx";
const IntegrationsDashboard = lazy(() => import("./components/IntegrationsDashboard.tsx").then(m => ({ default: m.IntegrationsDashboard })));
const AdminDashboard = lazy(() => import("./components/AdminDashboard.tsx").then(m => ({ default: m.AdminDashboard })));
import { ActivityLog } from "./components/ActivityLog.tsx";
import { NovaFeedbackModal } from "./components/NovaFeedbackModal.tsx";
import { InAppNudge } from "./components/InAppNudge.tsx";
const EvolutionEngine = lazy(() => import("./components/EvolutionEngine.tsx").then(m => ({ default: m.EvolutionEngine })));
import { DailyGoal } from "./components/DailyGoal.tsx";
import { MicroInterventions } from "./components/MicroInterventions.tsx";
import { NovaOverloadShield } from "./components/NovaOverloadShield.tsx";
import { updateNovaMemoryBySourceAndType, logJourney } from "./lib/nova-brain.ts";
const TrustCentrePage = lazy(() => import("./components/TrustCentrePage.tsx").then(m => ({ default: m.TrustCentrePage })));
import { hasSubscriptionEntitlement } from "./lib/entitlement.ts";
const RecoveryAlly = lazy(() => import("./components/RecoveryAlly.tsx").then(m => ({ default: m.RecoveryAlly })));
import { SomaticResetOverlay } from "./components/SomaticResetOverlay.tsx";
import { SmartCard } from "./components/SmartCard.tsx";
import { SomaticCheckInCard } from "./components/SomaticCheckInCard.tsx";
const RecoveryPlan = lazy(() => import("./components/RecoveryPlan.tsx").then(m => ({ default: m.RecoveryPlan })));
const FocusZone = lazy(() => import("./components/FocusZone.tsx").then(m => ({ default: m.FocusZone })));
import { SubscriptionTier, AuthRole } from "./types.ts";
import { RecoveryVelocityMap } from "./components/RecoveryVelocityMap.tsx";
const ExecutiveBoardReport = lazy(() => import("./components/ExecutiveBoardReport.tsx").then(m => ({ default: m.ExecutiveBoardReport })));
const CalendarDefenseView = lazy(() => import("./components/CalendarDefenseView.tsx").then(m => ({ default: m.CalendarDefenseView })));
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";
import { secureApiFetch } from "./lib/secure-api";
import { syncCalendarSignal } from "./lib/calendar-signals";
import { subscribeToPushNotifications, reportPulseStatus } from "./lib/push-notifications";

type AppFlow = "landing" | "onboarding" | "app" | "trust-centre" | "admin";

type SHIPStage = "Safety" | "Habits" | "Identity" | "Purpose";
type ActiveTab =
  | "home"
  | "diagnose"
  | "recover"
  | "fuel"
  | "reset"
  | "anxiety_reset"
  | "communicate"
  | "reflect"
  | "nova"
  | "ally"
  | "privacy"
  | "org"
  | "evolution"
  | "intelligence"
  | "executive"
  | "admin"
  | "plan";

const NovaVoiceGuidance = ({ stage }: { stage: SHIPStage }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopAudio = () => {
    if (activeSourceRef.current) {
      activeSourceRef.current.stop();
      activeSourceRef.current.disconnect();
      activeSourceRef.current = null;
    }
  };

  const playGuidance = async () => {
    if (isPlaying || isAudioLoading) {
      stopAudio();
      setIsPlaying(false);
      setIsAudioLoading(false);
      return;
    }

    setIsAudioLoading(true);
    try {
      const text = `You are in the ${stage} phase. Remember, fix the leak before you build the dream. Take a deep breath. Your value is not your output today. Focus on one small move.`;
      const response = await secureApiFetch("/api/nova/speech", {
        method: "POST",
        data: { text },
      });
      const data = await response.json();
      setIsAudioLoading(false);

      if (data.error) throw new Error(data.error);

      if (data.audio) {
        setIsPlaying(true);
        if (!audioCtxRef.current) {
          audioCtxRef.current = new window.AudioContext({ sampleRate: 24000 });
        }
        const audioCtx = audioCtxRef.current;
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        stopAudio();

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
          const pcm16 = dataView.getInt16(i * 2, true);
          channelData[i] = pcm16 / 32768;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          setIsPlaying(false);
          activeSourceRef.current = null;
        };
        source.start(0);
        activeSourceRef.current = source;
      } else {
        setIsPlaying(false);
      }
    } catch (e: any) {
      console.error(e);
      alert(
        `Nova Voice Error: ${e.message || "Connection failed. Check API key."}`,
      );
      setIsAudioLoading(false);
      setIsPlaying(false);
    }
  };

  return (
    <button
      onClick={playGuidance}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all shadow-lg",
        isPlaying || isAudioLoading
          ? "bg-primary text-primary-foreground"
          : "bg-surface text-text-main hover:bg-card border border-border",
      )}
    >
      {isAudioLoading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isPlaying ? (
        <div className="flex items-end gap-[1px] h-2">
          <motion.div
            animate={{ height: ["40%", "100%", "40%"] }}
            transition={{ duration: 0.5, repeat: Infinity }}
            className="w-[2px] bg-current rounded-full"
          />
          <motion.div
            animate={{ height: ["20%", "80%", "20%"] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.1 }}
            className="w-[2px] bg-current rounded-full"
          />
          <motion.div
            animate={{ height: ["60%", "30%", "60%"] }}
            transition={{ duration: 0.4, repeat: Infinity, delay: 0.2 }}
            className="w-[2px] bg-current rounded-full"
          />
        </div>
      ) : (
        <Volume2 className="w-3 h-3" />
      )}
      {isAudioLoading
        ? "Loading..."
        : isPlaying
          ? "Nova Speaking..."
          : "Calming Guidance"}
    </button>
  );
};

// Components

export const ALL_TABS: {
  id: ActiveTab;
  icon: React.ElementType;
  label: string;
  roles: string[];
  featureId?: string;
  group?: string;
}[] = [
  {
    id: "home",
    icon: Home,
    label: "Pulse",
    roles: ["individual", "employee", "executive"],
  },
  {
    id: "plan",
    icon: Sparkles,
    label: "Recovery Plan",
    roles: ["individual", "employee", "executive"],
  },
  {
    id: "diagnose",
    icon: MapPin,
    label: "Diagnose",
    roles: ["individual", "employee", "executive"],
    featureId: "burnout_diagnostic",
    group: "recovery_tools",
  },
  {
    id: "recover",
    icon: BatteryFull,
    label: "Recover",
    roles: ["individual", "employee", "executive"],
    featureId: "energy_budget",
    group: "recovery_tools",
  },
  {
    id: "fuel",
    icon: Apple,
    label: "Nutrition",
    roles: ["individual", "employee", "executive"],
    featureId: "nutrition_recovery",
    group: "recovery_tools",
  },
  {
    id: "reset",
    icon: Wind,
    label: "Nervous System",
    roles: ["individual", "employee", "executive"],
    featureId: "nervous_system_reset",
    group: "recovery_tools",
  },
  {
    id: "anxiety_reset",
    icon: HeartPulse,
    label: "Anxiety Reset",
    roles: ["individual", "employee", "executive"],
    group: "recovery_tools",
  },
  {
    id: "communicate",
    icon: MessageSquare,
    label: "Communicate",
    roles: ["individual", "employee", "executive"],
  },
  {
    id: "reflect",
    icon: Book,
    label: "Reflect",
    roles: ["individual", "employee", "executive"],
    featureId: "weekly_review",
  },
  {
    id: "nova",
    icon: Sparkles,
    label: "Nova Coach",
    roles: ["individual", "employee", "executive"],
    featureId: "nova_text_coach",
  },
  {
    id: "privacy",
    icon: Lock,
    label: "Privacy Centre",
    roles: [
      "individual",
      "employee",
      "executive",
      "manager",
      "organisation_admin",
    ],
  },
  {
    id: "ally",
    icon: HeartPulse,
    label: "Recovery Ally",
    roles: ["individual", "employee", "executive", "recovery_ally"],
  },
  {
    id: "org",
    icon: Users,
    label: "Organisation",
    roles: ["manager", "organisation_admin", "platform_admin", "security_admin"],
  },
  {
    id: "evolution",
    icon: Activity,
    label: "Evolution Engine",
    roles: ["platform_admin", "security_admin"],
    featureId: "burnout_diagnostic",
  },
  {
    id: "intelligence",
    icon: Brain,
    label: "Intelligence Layer",
    roles: ["platform_admin", "security_admin"],
    featureId: "burnout_diagnostic",
  },
  {
    id: "executive",
    icon: Zap,
    label: "Executive ROI",
    roles: ["executive", "platform_admin", "security_admin"],
  },
  {
    id: "admin",
    icon: ShieldCheck,
    label: "Live Activity & Access",
    roles: ["platform_admin"],
  },
];

const Sidebar = ({
  activeTab,
  setActiveTab,
  darkMode,
  setDarkMode,
  authRole,
  currentTier,
  isCollapsed,
  setIsCollapsed,
  onOpenCrisisSupport,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
  darkMode: boolean;
  setDarkMode: (d: boolean) => void;
  authRole: string;
  currentTier: SubscriptionTier;
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  onOpenCrisisSupport: () => void;
}) => {
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      } else {
        setIsCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const updateTasksCount = () => {
      try {
        const stored = localStorage.getItem("blaze_workload_tasks");
        if (stored) {
          const tasks = JSON.parse(stored);
          const pending = tasks.filter((t: any) => !t.completed).length;
          setPendingTasksCount(pending);
        }
      } catch (e) {
        console.error(e);
      }
    };

    updateTasksCount();
    window.addEventListener("storage", updateTasksCount);
    window.addEventListener("workload_tasks_changed", updateTasksCount);
    return () => {
      window.removeEventListener("storage", updateTasksCount);
      window.removeEventListener("workload_tasks_changed", updateTasksCount);
    };
  }, []);

  const tabs = ALL_TABS.filter((t) => {
    if (t.id === "privacy") return false; // Reachable via Settings > Consent & Privacy instead
    if (authRole === "platform_admin") return true;
    if (!t.roles.includes(authRole)) return false;
    if (t.featureId && !hasSubscriptionEntitlement(currentTier, t.featureId))
      return false;
    return true;
  });

  const sidebarVariants = {
    expanded: { width: "16rem", padding: "2rem" },
    collapsed: { width: "6rem", padding: "1.5rem", alignItems: "center" },
  };

  return (
    <motion.aside
      layout
      initial={false}
      animate={isCollapsed ? "collapsed" : "expanded"}
      variants={sidebarVariants}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed left-6 top-6 bottom-6 glass rounded-2xl flex flex-col gap-8 hidden md:flex z-40 shadow-2xl shadow-primary/5 transition-colors duration-500"
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-12 w-6 h-6 rounded-full bg-surface text-text-muted flex items-center justify-center hover:bg-border hover:text-text-main transition-colors cursor-pointer z-50 border border-border shadow-sm"
      >
        <ChevronLeft
          className={cn(
            "w-4 h-4 transition-transform duration-300",
            isCollapsed && "rotate-180",
          )}
        />
      </button>

      <div
        className={cn(
          "flex items-center cursor-pointer group shrink-0",
          isCollapsed ? "justify-center" : "gap-4",
        )}
        onClick={() => setActiveTab("home")}
      >
        <div className="w-10 h-10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-all duration-500">
          <img src="/brand/flame-mark-light.png" alt="Blaze Break" className="w-10 h-10 dark:hidden" />
          <img src="/brand/flame-mark-dark.png" alt="Blaze Break" className="w-10 h-10 hidden dark:block" />
        </div>
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col overflow-hidden whitespace-nowrap"
            >
              <h1 className="font-display font-black text-xl tracking-tighter text-text-main leading-none truncate">
                Blaze Break
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mt-1 truncate">
                Recovery Companion
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!isCollapsed ? (
        <CrisisSupportButton onClick={onOpenCrisisSupport} className="shrink-0 px-1" />
      ) : (
        <button
          onClick={onOpenCrisisSupport}
          title="Need support now?"
          className="shrink-0 w-full flex items-center justify-center p-3 rounded-2xl text-info bg-info/10 hover:bg-info/20 border border-info/20 transition-colors"
        >
          <LifeBuoy className="w-5 h-5" />
        </button>
      )}

      <nav
        className={cn(
          "flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar",
          !isCollapsed && "pr-2",
        )}
      >
        {(() => {
          const renderTabButton = (tab: (typeof tabs)[number], indented: boolean) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "nav-item relative group flex items-center w-full transition-all",
                  isActive && "active",
                  isCollapsed
                    ? "justify-center p-3 rounded-2xl"
                    : "justify-between",
                  indented && !isCollapsed && "pl-4",
                )}
                title={isCollapsed ? tab.label : undefined}
              >
                <div className="flex items-center gap-3">
                  <tab.icon
                    className={cn(
                      "w-5 h-5 transition-colors duration-300",
                      isActive
                        ? "text-primary"
                        : "text-text-muted group-hover:text-primary",
                    )}
                  />
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm whitespace-nowrap overflow-hidden"
                      >
                        {tab.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                {tab.id === "recover" && pendingTasksCount > 0 && (
                  <span
                    className={cn(
                      "bg-destructive text-destructive-foreground text-xs font-black flex items-center justify-center rounded-full shrink-0",
                      isCollapsed
                        ? "absolute -top-1 -right-1 w-4 h-4 text-[10px]"
                        : "w-5 h-5",
                    )}
                  >
                    {pendingTasksCount}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="active-indicator"
                    className={cn(
                      "absolute bg-primary rounded-full",
                      isCollapsed
                        ? "left-0 w-1 top-2 bottom-2"
                        : "left-0 w-1 h-6",
                    )}
                  />
                )}
              </button>
            );
          };

          // Collapsed sidebar is icon-only already, so grouping adds no value there —
          // just render every tab flat, same as before.
          if (isCollapsed) {
            return tabs.map((tab) => renderTabButton(tab, false));
          }

          const renderedGroups = new Set<string>();
          return tabs.map((tab) => {
            if (tab.group) {
              if (renderedGroups.has(tab.group)) return null;
              renderedGroups.add(tab.group);
              const groupTabs = tabs.filter((t) => t.group === tab.group);
              const isGroupActive = groupTabs.some((t) => t.id === activeTab);
              const isExpanded = expandedGroups[tab.group] ?? isGroupActive;
              const groupLabel = tab.group === "recovery_tools" ? "Recovery Tools" : tab.group;
              return (
                <div key={tab.group}>
                  <button
                    onClick={() =>
                      setExpandedGroups((prev) => ({ ...prev, [tab.group!]: !isExpanded }))
                    }
                    className={cn(
                      "nav-item relative group flex items-center justify-between w-full transition-all",
                      isGroupActive && !isExpanded && "active",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Compass
                        className={cn(
                          "w-5 h-5 transition-colors duration-300",
                          isGroupActive
                            ? "text-primary"
                            : "text-text-muted group-hover:text-primary",
                        )}
                      />
                      <span className="text-sm whitespace-nowrap overflow-hidden">
                        {groupLabel}
                      </span>
                    </div>
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 text-text-muted transition-transform duration-200 rotate-90",
                        isExpanded && "-rotate-90",
                      )}
                    />
                  </button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden flex flex-col gap-2 pt-2"
                      >
                        {groupTabs.map((t) => renderTabButton(t, true))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }
            return renderTabButton(tab, false);
          });
        })()}
      </nav>

      <div className="pt-6 border-t border-border/50 flex flex-col gap-6 shrink-0 w-full">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className={cn(
            "flex items-center rounded-2xl bg-surface/50 hover:bg-white dark:hover:bg-surface transition-all group",
            isCollapsed ? "justify-center p-3" : "justify-between p-2",
          )}
          title={
            isCollapsed
              ? darkMode
                ? "Switch to Solar"
                : "Switch to Eclipse"
              : undefined
          }
        >
          <div
            className={cn("flex items-center gap-3", !isCollapsed && "ml-2")}
          >
            {darkMode ? (
              <Moon className="w-5 h-5 text-primary shrink-0" />
            ) : (
              <Sun className="w-5 h-5 text-primary shrink-0" />
            )}
            <AnimatePresence>
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-xs font-black uppercase tracking-[0.1em] text-text-muted group-hover:text-text-main transition-colors overflow-hidden whitespace-nowrap"
                >
                  {darkMode ? "Eclipse" : "Solar"}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0, scale: 0.8 }}
                animate={{ opacity: 1, width: "auto", scale: 1 }}
                exit={{ opacity: 0, width: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "w-10 h-6 rounded-full p-1 transition-colors duration-500 shrink-0",
                  darkMode ? "bg-primary" : "bg-border",
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 bg-white rounded-full transition-transform duration-500 shadow-sm",
                    darkMode ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
};

const Header = ({
  title,
  activeTab,
  darkMode,
  setDarkMode,
  onOpenSettings,
  onOpenTour,
  onSomaticReset,
  profile,
  burnoutRisk,
}: {
  title: string;
  activeTab: string;
  darkMode: boolean;
  setDarkMode: (d: boolean) => void;
  onOpenSettings: () => void;
  onOpenTour?: () => void;
  onSomaticReset?: () => void;
  profile?: any;
  burnoutRisk?: string;
}) => {
  const [guardianPingActive, setGuardianPingActive] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleGuardianPing = () => {
    setGuardianPingActive(!guardianPingActive);
    if (!guardianPingActive) {
      setToastMessage("Automated Ping Sent: Support Circle notified of High Stress Flag.");
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  return (
    <header className="flex items-center justify-between mb-12 relative transition-colors duration-500">
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="absolute top-[-40px] left-1/2 z-50 bg-warning/10 border border-warning/20 text-warning px-4 py-2 rounded-full text-xs font-bold tracking-wide flex items-center gap-2 backdrop-blur-md shadow-[0_0_15px_rgba(245,158,11,0.2)] whitespace-nowrap"
          >
            <Shield className="w-4 h-4" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center justify-center relative group">
          <div className={cn("h-3 w-3 rounded-full transition-colors duration-500 shadow-lg", 
            burnoutRisk?.toLowerCase() === 'stable' ? "bg-success shadow-success/50" : 
            burnoutRisk?.toLowerCase() === 'elevated' ? "bg-warning shadow-warning/50" : 
            "bg-destructive shadow-destructive/50 pulse-indicator"
          )} />
          {/* Tooltip for at-a-glance health monitoring */}
          <div className="absolute left-0 top-6 scale-0 group-hover:scale-100 transition-all z-50 bg-card border border-border px-3 py-1.5 rounded-lg shadow-xl shrink-0 whitespace-nowrap">
            <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted">Burnout Risk: <span className={
              burnoutRisk?.toLowerCase() === 'stable' ? 'text-success' : 
              burnoutRisk?.toLowerCase() === 'elevated' ? 'text-warning' : 'text-destructive'
            }>{burnoutRisk || 'Unknown'}</span></p>
          </div>
        </div>
        <div className="h-0.5 w-16 bg-primary/30 rounded-full" />
        <span className="text-[11px] font-black uppercase tracking-[0.4em] text-primary transition-all duration-500">
          {activeTab === "home" && "Neuro-Stability Engine"}
          {activeTab === "diagnose" && "Loop Analysis"}
          {activeTab === "recover" && "Energy Delta Management"}
          {activeTab === "fuel" && "Recovery Fuel"}
          {activeTab === "reset" && "Nervous System Reset Studio"}
          {activeTab === "anxiety_reset" && "Anxiety Reset"}
          {activeTab === "communicate" && "Boundary Architect v2.1"}
          {activeTab === "reflect" && "Behavioral Repatterning"}
          {activeTab === "nova" && "AI Recovery Interface"}
          {activeTab === "privacy" && "Privacy & Trust Centre"}
          {activeTab === "ally" && "Guardian Protection Network"}
          {activeTab === "org" && "Collective Stability Pulse"}
          {activeTab === "evolution" && "Burnout Diagnostic Evolution"}
          {activeTab === "intelligence" && "Recovery Strategy Engine"}
        </span>
      </div>
      <h2 className="text-5xl font-display font-bold text-text-main leading-tight tracking-tight mb-3 capitalize">
        {title}
      </h2>
      <p className="text-text-muted text-base leading-relaxed  font-medium">
        {activeTab === "home" &&
          "Protect your baseline. The current energy delta requires immediate focus."}
        {activeTab === "diagnose" &&
          "Root cause identification of cognitive and emotional energy leaks."}
        {activeTab === "recover" &&
          "Recovery is active repair. Use the credits wisely."}
        {activeTab === "fuel" &&
          "Understand the bidirectional gut-brain highways, diurnal sunlight loops, and caffeine cutoffs."}
        {activeTab === "reset" &&
          "Fast tools when you are overwhelmed, tense, scattered, panicky, angry, flat, or mentally fried."}
        {activeTab === "anxiety_reset" &&
          "A secure somatic handrail to de-escalate nervous system arousal, racing thoughts, and panic loops."}
        {activeTab === "communicate" &&
          "Precision scripting to prevent energy siphoning at the source."}
        {activeTab === "reflect" &&
          "The Chapter-to-Action engine. Turning knowledge into armor."}
        {activeTab === "nova" &&
          "Nova is processing your physiological and behavioral patterns."}
        {activeTab === "privacy" &&
          "Your recovery is private by default. Your employer cannot spy on you."}
        {activeTab === "ally" &&
          "Secure integration with your support system."}
        {activeTab === "org" &&
          "Analyzing systemic resilience across the professional ecosystem."}
        {activeTab === "evolution" &&
          "Administrative access: Systemic pattern analysis and burnout progression tracking."}
        {activeTab === "intelligence" &&
          "Administrative access: Machine learning layer for organizational stress mapping."}
      </p>
    </div>
    <div className="flex items-center gap-4">
      {onOpenTour && (
        <button
          onClick={onOpenTour}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary dark:text-primary border border-primary/20 rounded-full text-xs font-bold uppercase tracking-wider transition-all scale-[1] hover:scale-[1.03] active:scale-95 cursor-pointer shadow-sm"
          title="Interactive System Walkthrough"
        >
          <Compass className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Recovery Tour</span>
        </button>
      )}
      {onSomaticReset && (
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-widest text-destructive font-bold animate-pulse">High Stress Flag</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGuardianPing}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 border rounded-full text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.03] active:scale-95 cursor-pointer shadow-sm",
                guardianPingActive 
                  ? "bg-warning text-text-main border-warning shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse" 
                  : "bg-warning/10 hover:bg-warning/20 text-warning dark:text-warning border-warning/20"
              )}
              title="Ping Support Circle"
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">
                {guardianPingActive ? "Ping Active" : "Guardian Ping"}
              </span>
            </button>
            <button
              onClick={onSomaticReset}
              className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 hover:bg-destructive/20 text-destructive dark:text-destructive border border-destructive/20 rounded-full text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.03] active:scale-95 cursor-pointer shadow-sm"
              title="Somatic Reset (60s)"
            >
              <HeartPulse className="w-4 h-4 animate-pulse" />
              <span className="hidden sm:inline">Somatic Reset</span>
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="p-2.5 rounded-full bg-surface dark:bg-card border border-border hover:border-primary/50 text-text-muted hover:text-primary transition-all md:hidden"
        title="Toggle Theme"
      >
        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      <AuthStatusTracker />
      <button
        onClick={onOpenSettings}
        className="group relative flex items-center gap-3 p-1 pr-4 bg-surface dark:bg-card border border-border rounded-full hover:border-primary/50 transition-all"
      >
        <div className="w-10 h-10 rounded-full bg-border dark:bg-surface overflow-hidden shrink-0 border-2 border-transparent group-hover:border-primary transition-all">
          {profile?.avatarBase64 ? (
            <img
              src={profile.avatarBase64}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          ) : (
            <User className="w-5 h-5 m-2.5 text-text-muted" />
          )}
        </div>
        <div className="flex flex-col items-start hidden sm:flex">
          <span className="text-xs font-bold text-text-main line-clamp-1 max-w-[100px]">
            {profile?.fullName || "Profile Settings"}
          </span>
          <span className="text-[11px] font-black uppercase tracking-widest text-text-muted ">
            {profile?.role || "Update Now"}
          </span>
        </div>
      </button>
    </div>
  </header>
  );
};

const HomeSection = ({
  onChatRequest,
  onEnergyRequest,
  fingerprint,
  stats,
  onClaimDaily,
  hasClaimedDaily,
  shipStage,
  energyLevel,
  burnoutRisk,
  onOpenCheckIn,
  pulseHistory,
  onAwardPoints,
  onUpdateOperationalMetrics,
  onUpdatePulseHistory,
  onLogJourney,
}: {
  onChatRequest: () => void;
  onEnergyRequest: () => void;
  fingerprint: BurnoutFingerprint | null;
  stats: UserStats;
  onClaimDaily: () => void;
  hasClaimedDaily: boolean;
  shipStage: SHIPStage;
  energyLevel: number;
  burnoutRisk: string;
  onOpenCheckIn: () => void;
  pulseHistory: {date: string, score: number}[];
  onAwardPoints: (amount: number, reason: string) => void;
  onUpdateOperationalMetrics: (energy: number, risk: string) => void;
  onUpdatePulseHistory: (date: string, score: number) => void;
  onLogJourney: (action: string, details: string) => void;
}) => {
  // Friendly names for every widget, used by the "Add widget" menu below.
  const WIDGET_LIBRARY: Record<string, string> = {
    hero: "Your Recovery Score",
    stats: "Quick Stats",
    streakCalendar: "Streak Calendar",
    trends: "Recovery Trends",
    anxietyResetCard: "Anxiety Reset Shortcut",
    somaticAccelerator: "Body Check-In",
    velocity: "Recovery Velocity Map",
    hub: "Recovery Hub",
    gamification: "Points & Badges",
    archetypeBlend: "Your Blend",
    daily: "Daily Goal",
    micro: "Micro-Recovery",
    activity: "Activity Log",
    directive: "Nova's Suggestion",
    quests: "Milestones",
    network: "Guardian Network",
    radar: "Relapse Radar",
  };

  // A small, focused set by default: your score, one clear next step, one
  // progress view, and a way to find tools. Everything else is one tap away
  // via "Add widget" instead of all 16 competing for attention at once.
  const DEFAULT_LEFT = ['hero', 'trends', 'hub'];
  const DEFAULT_RIGHT = ['directive'];
  const DEFAULT_HIDDEN = ['stats', 'streakCalendar', 'anxietyResetCard', 'somaticAccelerator', 'velocity', 'gamification', 'daily', 'micro', 'activity', 'quests', 'network', 'radar', 'archetypeBlend'];
  const LAYOUT_STORAGE_KEY = 'blaze_home_dashboard_layout_v2';

  const loadLayout = (): { left: string[]; right: string[]; hidden: string[] } => {
    try {
      const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.left) && Array.isArray(parsed.right) && Array.isArray(parsed.hidden)) {
          return parsed;
        }
      }
    } catch (e) {
      // Corrupted storage - fall back to defaults rather than crashing.
    }
    return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT, hidden: DEFAULT_HIDDEN };
  };

  const initialLayout = loadLayout();
  const [leftOrder, setLeftOrder] = useState<string[]>(initialLayout.left);
  const [rightOrder, setRightOrder] = useState<string[]>(initialLayout.right);
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>(initialLayout.hidden);
  const [showAddWidgetMenu, setShowAddWidgetMenu] = useState(false);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartYRef = useRef<number | null>(null);
  const PULL_TRIGGER_THRESHOLD = 70;
  const PULL_MAX_DISTANCE = 90;

  // Raw touch events rather than Framer Motion's drag prop — this screen
  // already has native HTML5 drag-and-drop for widget reordering, and a
  // pointer-based drag gesture layered on top would fight it. Gating on
  // window.scrollY <= 0 at touch-start is what makes this only trigger at
  // the very top of the page instead of hijacking normal scrolling anywhere
  // else on a screen with 16 possible widgets.
  const handleHomeTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0 && !isPullRefreshing) {
      pullStartYRef.current = e.touches[0].clientY;
    }
  };
  const handleHomeTouchMove = (e: React.TouchEvent) => {
    if (pullStartYRef.current === null) return;
    const delta = e.touches[0].clientY - pullStartYRef.current;
    if (delta > 0 && window.scrollY <= 0) {
      setPullDistance(Math.min(delta * 0.5, PULL_MAX_DISTANCE));
    } else {
      pullStartYRef.current = null;
      setPullDistance(0);
    }
  };
  const handleHomeTouchEnd = () => {
    if (pullDistance >= PULL_TRIGGER_THRESHOLD) {
      setIsPullRefreshing(true);
      setTimeout(() => {
        setHomeRefreshKey((k) => k + 1);
        setIsPullRefreshing(false);
        setPullDistance(0);
      }, 700); // A brief, deliberate delay — an instant refresh reads as broken, not fast.
    } else {
      setPullDistance(0);
    }
    pullStartYRef.current = null;
  };

  // Persist every change so layout and hide/show choices actually stick.
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ left: leftOrder, right: rightOrder, hidden: hiddenWidgets }));
    } catch (e) {
      // Storage full or unavailable - continue silently rather than breaking the UI.
    }
  }, [leftOrder, rightOrder, hiddenWidgets]);

  const handleHideCard = (id: string) => {
    setLeftOrder((prev) => prev.filter((cardId) => cardId !== id));
    setRightOrder((prev) => prev.filter((cardId) => cardId !== id));
    setHiddenWidgets((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleAddWidget = (id: string) => {
    setHiddenWidgets((prev) => prev.filter((cardId) => cardId !== id));
    setLeftOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  useEffect(() => {
    // Merge any brand-new card types introduced by future app updates so they
    // aren't silently lost for existing users - anything not already placed
    // and not already hidden gets added to hidden-by-default, never forced in.
    const known = new Set([...leftOrder, ...rightOrder, ...hiddenWidgets]);
    const newlyIntroduced = Object.keys(WIDGET_LIBRARY).filter((id) => !known.has(id));
    if (newlyIntroduced.length > 0) {
      setHiddenWidgets((prev) => [...prev, ...newlyIntroduced]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [quickTriggerText, setQuickTriggerText] = useState("");
  const [quickSeverity, setQuickSeverity] = useState(7);
  const [quickSuccess, setQuickSuccess] = useState(false);

  const handleSaveQuickTrigger = () => {
    if (!quickTriggerText.trim()) return;
    
    const saved = localStorage.getItem("blaze_intelligence_triggers") || '[]';
    try {
      const parsed = JSON.parse(saved);
      parsed.unshift({
        id: String(Date.now()),
        text: quickTriggerText.trim(),
        date: new Date().toISOString(),
        severity: Number(quickSeverity),
        energyLevel: Number(energyLevel)
      });
      localStorage.setItem("blaze_intelligence_triggers", JSON.stringify(parsed));
    } catch (e) {
      console.warn(e);
    }

    setQuickSuccess(true);
    onAwardPoints(25, "Burnout trigger logged dynamically");
    setTimeout(() => {
      setQuickTriggerText("");
      setQuickSuccess(false);
      setQuickNoteOpen(false);
    }, 1500);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('cardId', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, id: string, targetCol: 'left' | 'right') => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('cardId');
    if (!draggedId || draggedId === id) return;

    let sourceColOrder = leftOrder.includes(draggedId) ? leftOrder : (rightOrder.includes(draggedId) ? rightOrder : null);
    if (!sourceColOrder) return;
    
    const setSourceCol = leftOrder.includes(draggedId) ? setLeftOrder : setRightOrder;
    const setTargetCol = targetCol === 'left' ? setLeftOrder : setRightOrder;
    const targetColOrder = targetCol === 'left' ? leftOrder : rightOrder;

    const draggedIdx = sourceColOrder.indexOf(draggedId);
    
    if (setSourceCol === setTargetCol) {
      // Reordering within the same column
      const targetIdx = targetColOrder.indexOf(id);
      if (draggedIdx !== -1 && targetIdx !== -1) {
        const newOrder = [...targetColOrder];
        const temp = newOrder[draggedIdx];
        newOrder.splice(draggedIdx, 1);
        newOrder.splice(targetIdx, 0, temp);
        setTargetCol(newOrder);
      }
    } else {
      // Moving across columns
      const targetIdx = targetColOrder.indexOf(id);
      const newSourceOrder = [...sourceColOrder];
      const newTargetOrder = [...targetColOrder];
      const temp = newSourceOrder[draggedIdx];
      newSourceOrder.splice(draggedIdx, 1);
      
      if (targetIdx !== -1) {
        newTargetOrder.splice(targetIdx, 0, temp);
      } else {
        newTargetOrder.push(temp); // Drop at end
      }
      
      setSourceCol(newSourceOrder);
      setTargetCol(newTargetOrder);
    }
  };

  const StageIcon =
    {
      Safety: ShieldAlert,
      Habits: Battery,
      Identity: Waves,
      Purpose: Zap,
    }[shipStage] || ShieldAlert;

  const calculateRecoveryScore = () => {
    let score = 50; // Base score
    const factors: { label: string; points: number }[] = [];

    if (energyLevel > 60) { score += 15; factors.push({ label: "Energy level", points: 15 }); }
    else if (energyLevel < 30) { score -= 15; factors.push({ label: "Low energy level", points: -15 }); }

    // Factor in recovery debt
    const debtCount = (stats.debts || []).filter((d) => !d.cleared).length;
    if (debtCount > 0) {
      const debtPenalty = -Math.min(debtCount * 5, 20);
      score += debtPenalty;
      factors.push({ label: "Unresolved recovery debt", points: debtPenalty });
    }

    if (fingerprint?.profile === "High-Functioning Exhausted") {
      score -= 5;
      factors.push({ label: "High-Functioning Exhausted pattern", points: -5 });
    }

    // Factor in daily quests completed
    if (hasClaimedDaily) { score += 10; factors.push({ label: "Daily check-in claimed", points: 10 }); }
    if (stats.rehearsalCount > 0) { score += 5; factors.push({ label: "Boundary rehearsal practice", points: 5 }); }
    if (stats.streak > 3) { score += 5; factors.push({ label: "Streak beyond 3 days", points: 5 }); }

    // Integrated Layer 2 Recovery Intelligence Signals
    try {
      const moodLogsSaved = localStorage.getItem("blaze_intelligence_moods");
      if (moodLogsSaved) {
        const moodLogs = JSON.parse(moodLogsSaved);
        if (moodLogs.length > 0) {
          const positiveWords = [
            "good", "great", "rested", "aligned", "steady", "calm", "vibrant", "stable",
          ];
          const recentMood = moodLogs[0].word.toLowerCase();
          const hasPos = positiveWords.some((w: string) => recentMood.includes(w));
          score += hasPos ? 15 : -10;
          factors.push({ label: "Recent mood check-in", points: hasPos ? 15 : -10 });
        }
      }

      const triggersSaved = localStorage.getItem("blaze_intelligence_triggers");
      if (triggersSaved) {
        const triggers = JSON.parse(triggersSaved);
        if (triggers.length > 0) {
          const triggerPenalty = -Math.min(25, triggers.length * 5);
          score += triggerPenalty;
          factors.push({ label: "Logged triggers", points: triggerPenalty });
        }
      }

      const socialBatterySaved = localStorage.getItem("blaze_intelligence_social_battery");
      if (socialBatterySaved) {
        const socialBattery = parseInt(socialBatterySaved, 10);
        if (socialBattery > 60) { score += 10; factors.push({ label: "Social battery", points: 10 }); }
        if (socialBattery < 30) { score -= 15; factors.push({ label: "Low social battery", points: -15 }); }
      }

      const winsSaved = localStorage.getItem("blaze_intelligence_wins");
      if (winsSaved) {
        const winsList = JSON.parse(winsSaved);
        if (winsList.length > 0) {
          const winsBonus = Math.min(25, winsList.length * 8);
          score += winsBonus;
          factors.push({ label: "Logged wins", points: winsBonus });
        }
      }

      const symptomsSaved = localStorage.getItem("blaze_intelligence_symptoms");
      if (symptomsSaved) {
        const symptomsList = JSON.parse(symptomsSaved);
        if (symptomsList.length > 0) {
          const symptomsPenalty = -Math.min(20, symptomsList.length * 4);
          score += symptomsPenalty;
          factors.push({ label: "Logged symptoms", points: symptomsPenalty });
        }
      }

      const focusSaved = localStorage.getItem("blaze_intelligence_focus_shield");
      if (focusSaved === "true") {
        score += 10;
        factors.push({ label: "Focus Shield active", points: 10 });
      }
    } catch (e) {
      console.warn("Could not read local recovery-intelligence signals.", e);
    }

    return { score: Math.max(10, Math.min(100, score)), factors };
  };

  const { score: recoveryScore, factors: recoveryScoreFactors } = calculateRecoveryScore();
  const dynamicRisk =
    recoveryScore < 40 ? "High" : recoveryScore < 70 ? "Moderate" : "Low";

  // We use the passed pulseHistory for the AreaChart


  const cardsMap: Record<string, React.ReactNode> = {
    daily_1: <DailyGoal shipStage={shipStage} key="daily_1" />,
    hero: (
      <SmartCard 
        id="hero"
        key={`hero-${homeRefreshKey}`}
        title="Your Recovery Score"
        energyDrain="high"
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={(e, id) => handleDrop(e, id, 'left')}
        className="p-6 sm:p-8 md:p-10 min-h-[380px] bg-card rounded-xl border border-border flex flex-col justify-between"
      >
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-widest text-text-muted">
                Nova is here
              </span>
              <NovaVoiceGuidance stage={shipStage} />
              {hasClaimedDaily && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] font-medium uppercase tracking-widest text-primary"
                >
                  Pulse saved
                </motion.span>
              )}
            </div>
            <button
              onClick={onOpenCheckIn}
              className="text-xs font-medium uppercase tracking-widest text-text-muted hover:text-text-main transition-colors"
            >
              Check in
            </button>
          </div>
          <div className="space-y-3 border-b border-border pb-6">
            <span className="text-[11px] font-medium uppercase tracking-[0.3em] text-text-muted">
              Your Recovery Score
            </span>
            <div className="flex items-center gap-4">
              {stats.streak < 3 ? (
                <div className="flex flex-col gap-1">
                  <h1 className="text-4xl font-mono font-medium tracking-tight text-text-muted">
                    Calculating
                  </h1>
                  <p className="text-xs text-text-muted">
                    Nova requires a 3-day baseline pattern to establish your
                    stable Recovery Score.
                  </p>
                </div>
              ) : (
                <div className="group/tooltip relative inline-flex items-baseline">
                  <h1 className="cursor-help text-5xl sm:text-6xl md:text-7xl font-mono font-medium tracking-tight text-text-main">
                    {recoveryScore}
                    <span className="text-xl sm:text-2xl md:text-3xl font-normal text-text-muted ml-2">
                      /100
                    </span>
                  </h1>

                  <div className="absolute left-0 bottom-full mb-4 px-4 py-3 bg-card text-text-main text-xs font-mono rounded-lg border border-border shadow-lg opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all whitespace-nowrap z-50">
                    What's shaping this score
                    <div className="w-full h-px bg-border my-2" />
                    <div className="text-text-muted space-y-1">
                      {recoveryScoreFactors.length === 0 ? (
                        <p>Base score — no check-ins logged yet.</p>
                      ) : (
                        recoveryScoreFactors.map((f, i) => (
                          <p key={i}>{f.label}: {f.points > 0 ? "+" : ""}{f.points}</p>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-text-muted text-lg max-w-lg leading-relaxed font-display">
            {stats.streak < 3
              ? "Your nervous system requires consistent tracking. Complete your daily pulses to unlock predictive recovery forecasting."
              : '"Your nervous system is carrying recovery debt. '}
            {stats.streak >= 3 && (
              <span className="text-text-main font-serif italic">
                Cease the optimization narrative.
              </span>
            )}
            {stats.streak >= 3 && ' Today is about active repair."'}
          </p>
          <RecoveryExplanation
            energyLevel={energyLevel}
            debtCount={(stats.debts || []).filter((d) => !d.cleared).length}
            isHighFunctioningExhausted={fingerprint?.profile === "High-Functioning Exhausted"}
            hasClaimedDaily={hasClaimedDaily}
            rehearsalCount={stats.rehearsalCount || 0}
            streak={stats.streak || 0}
          />
        </div>

        <div className="flex gap-4 mt-10 pt-6 border-t border-border">
          <button
            onClick={onEnergyRequest}
            className="btn-primary flex items-center gap-2 px-6"
          >
            Manage Budget <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          {!hasClaimedDaily && (
            <button
              onClick={onClaimDaily}
              className="px-6 py-3 rounded-xl border border-border text-text-main font-display font-medium hover:bg-surface transition-colors flex items-center gap-2"
            >
              <Trophy className="w-4 h-4 text-text-muted" /> Claim Pulse
            </button>
          )}
        </div>
      </SmartCard>
    ),
    stats: (
      <div key="stats" className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          { label: "Current Phase", value: shipStage, subLabel: "SHIP Journey", color: "text-primary", bg: "bg-primary/10" },
          { label: "Burnout Risk", value: dynamicRisk, subLabel: "How you're trending", color: dynamicRisk === "Low" ? "text-success" : dynamicRisk === "Moderate" ? "text-warning" : "text-destructive", bg: dynamicRisk === "Low" ? "bg-success/10" : dynamicRisk === "Moderate" ? "bg-warning/10" : "bg-destructive/10" },
          { label: "Energy Cap", value: `${energyLevel}%`, subLabel: "Energy available today", color: "text-primary", bg: "bg-primary/10" },
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <SmartCard id={`stat_${i}`} title={item.label} energyDrain={i === 1 ? 'high' : 'low'} onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')}>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-widest text-text-muted">{item.label}</span>
                  <div className={cn("p-2 rounded-xl transition-all duration-500 group-hover:scale-110", item.bg, item.color)}>
                    <StageIcon className="w-4 h-4" />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className={cn("text-3xl font-display font-bold", item.color)}>{item.value}</div>
                  <p className="text-xs font-black uppercase tracking-widest text-text-muted ">{item.subLabel}</p>
                </div>
              </div>
            </SmartCard>
          </motion.div>
        ))}
      </div>
    ),
    trends: (
      <SmartCard id="trends" key="trends" title="Recovery Trends" energyDrain="medium" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} className="p-6 rounded-xl border border-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-medium text-text-main line-clamp-1">30-day recovery history</h3>
              <p className="text-[11px] uppercase font-medium tracking-widest text-text-muted">Long-term pattern</p>
            </div>
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pulseHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ea580c" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#ea580c" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#a8a29e" opacity={0.25} />
              <XAxis dataKey="date" tick={{ fill: '#a8a29e', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
              <YAxis tick={{ fill: '#a8a29e', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #3a3532', borderRadius: '8px' }}
                itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 500 }}
                formatter={(value: number) => [`${value}`, 'Score']}
              />
              <Area type="monotone" dataKey="score" stroke="#ea580c" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SmartCard>
    ),
    anxietyResetCard: (
      <SmartCard 
        id="anxietyResetCard" 
        key="anxietyResetCard"
        title="Nervous Overload Reset"
        energyDrain="high"
        onDragStart={handleDragStart} 
        onDragOver={handleDragOver} 
        onDrop={(e, id) => handleDrop(e, id, 'left')}
        className="p-6 bg-red-950/20 border border-red-500/20 hover:border-red-500/40 rounded-2xl relative overflow-hidden transition-all duration-300"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-[40px] pointer-events-none" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div className="space-y-1 text-left">
            <span className="px-2.5 py-0.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-wider rounded-full">
              Body Reset
            </span>
            <h3 className="text-lg font-bold font-display text-text-main mt-1">Anxiety & Overwhelm Reset</h3>
            <p className="text-xs text-text-muted max-w-md leading-relaxed">
              Facing work dread, racing thoughts, or panic spikes? Deploy a sensory reset immediately to restore baseline executive safety.
            </p>
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate_tab', { detail: 'anxiety_reset' }))}
            className="px-5 py-3 shrink-0 bg-red-600 hover:bg-red-700 text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-md shadow-red-500/10 flex items-center gap-2"
          >
            Start Reset <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </SmartCard>
    ),
    velocity: (
      <SmartCard id="velocity" key="velocity" title="Recovery Velocity Map" energyDrain="low" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} className="p-6">
        <RecoveryVelocityMap />
      </SmartCard>
    ),
    hub: (
      <SmartCard id="hub" key="hub" title="Recovery Hub" energyDrain="medium" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} className="cursor-pointer rounded-xl border border-border p-6">
        <div className="flex items-center gap-6 sm:gap-10" onClick={onEnergyRequest}>
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <StageIcon className="w-8 h-8" />
          </div>
          <div className="space-y-2 flex-1 text-left min-w-0">
            <span className="text-[11px] font-medium uppercase tracking-widest text-primary">Recovery mode enabled</span>
            <h2 className="text-2xl font-display font-medium text-text-main tracking-tight">
              Active repatterning: {shipStage}
            </h2>
            <p className="text-text-muted text-base font-serif italic">
              "Your recovery is not a suggestion. It is a biological prerequisite for the coming cycle."
            </p>
          </div>
          <button className="w-11 h-11 rounded-full border border-border flex items-center justify-center text-text-muted hover:text-primary hover:border-primary transition-colors shrink-0">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </SmartCard>
    ),
    gamification: <GamificationDisplay key="gamification" stats={stats} fingerprint={fingerprint} shipStage={shipStage} pulseHistory={pulseHistory} />,
    archetypeBlend: <ArchetypeBlend key={`archetypeBlend-${homeRefreshKey}`} />,
    somaticAccelerator: (
      <SomaticCheckInCard
        key="somaticAccelerator"
        onAwardPoints={onAwardPoints}
        onUpdateOperationalMetrics={onUpdateOperationalMetrics}
        onUpdatePulseHistory={onUpdatePulseHistory}
        onLogJourney={onLogJourney}
      />
    ),
    daily: <DailyGoal key="daily" shipStage={shipStage} />,
    micro: <MicroInterventions key="micro" shipStage={shipStage} id="micro" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'left')} />,
    directive: (
      <SmartCard id="directive" key="directive" title="Nova's Suggestion" energyDrain="high" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'right')} className="rounded-xl border border-border p-6">
        <div className="relative z-10 space-y-6">
          <div className="flex items-center justify-between pb-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-primary"></div>
              <h3 className="text-[11px] font-medium uppercase tracking-widest text-text-main">Today's focus</h3>
            </div>
            <span className="text-[11px] font-mono text-text-muted">+50</span>
          </div>
          <div>
            <p className="text-lg font-serif italic text-text-main leading-snug">
              "Your single biggest energy leak is unstructured ad-hoc meetings. They account for nearly 45% of your total load this cycle."
            </p>
            <div className="mt-6 p-5 bg-surface rounded-lg border border-border">
              <span className="text-[11px] font-medium text-text-muted uppercase tracking-widest block mb-2">Today's focus</span>
              <p className="text-sm font-medium text-text-main">Rehearse the "I need to push this" script before the 4 PM sync to start patching this energy leak.</p>
            </div>
          </div>
          <button onClick={onChatRequest} className="w-full btn-primary py-3.5 flex items-center justify-center gap-2 group transition-all">
            <MessageSquare className="w-4 h-4" />
            <span>Connect with Nova</span>
            <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </SmartCard>
    ),
    quests: (
      <SmartCard id="quests" key="quests" title="Milestones" energyDrain="medium" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'right')} className="space-y-6 p-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-text-main flex items-center gap-3">
          <Gift className="w-5 h-5 text-primary" /> Milestones
        </h3>
        <div className="space-y-3">
          {[
            { label: "Complete today's check-in", pts: 50, done: hasClaimedDaily },
            { label: "Reach a 3-day streak", pts: 100, done: stats.streak >= 3 },
            { label: "Complete your burnout diagnostic", pts: 75, done: !!fingerprint }
          ].map((q, i) => (
            <div key={i} className={cn("flex items-center justify-between p-4 rounded-2xl border transition-all", q.done ? "bg-surface/50 border-border/50" : "bg-card border-border shadow-sm hover:shadow-md")}>
              <div className="flex items-center gap-3">
                <div className={cn("w-5 h-5 rounded-lg flex items-center justify-center transition-all", q.done ? "bg-accent text-accent-foreground" : "bg-surface dark:bg-surface/50 text-text-muted")}>
                  {q.done ? <CheckCircle className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                </div>
                <span className={cn("text-xs font-bold tracking-tight", q.done ? "text-text-muted" : "text-text-main")}>{q.label}</span>
              </div>
              <span className={cn("text-xs font-black tracking-tighter", q.done ? "text-text-muted" : "text-primary")}>+{q.pts}</span>
            </div>
          ))}
        </div>
      </SmartCard>
    ),
    network: (
      <SmartCard id="network" key="network" title="Guardian Network" energyDrain="low" onDragStart={handleDragStart} onDragOver={handleDragOver} onDrop={(e, id) => handleDrop(e, id, 'right')} className="p-6">
        <h3 className="text-xs font-black text-text-muted uppercase tracking-widest mb-6 px-1">Guardian Network</h3>
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-12 h-12 rounded-2xl border-4 border-surface dark:border-surface bg-border overflow-hidden shadow-xl hover:scale-110 hover:z-20 transition-all duration-300 cursor-pointer">
                <img src={`https://i.pravatar.cc/100?u=${i + 10}`} alt="Guardian" className="w-full h-full object-cover" />
              </div>
            ))}
            <div className="w-12 h-12 rounded-2xl border-4 border-surface dark:border-surface bg-surface dark:bg-card flex items-center justify-center text-text-muted text-xs font-black shadow-xl hover:bg-primary/5 hover:text-primary transition-all cursor-pointer">
              +
            </div>
          </div>
          <div className="flex-1 ml-2">
            <span className="text-xs font-black text-primary uppercase tracking-[0.2em] block">Active Guardians</span>
            <p className="text-xs text-text-muted font-medium">3 Synchronized</p>
          </div>
        </div>
      </SmartCard>
    ),
    radar: <RelapseRadar key="radar" />,
    streakCalendar: (
      <SmartCard 
        id="streakCalendar" 
        key="streakCalendar" 
        title="Recovery Streak Tracker" 
        energyDrain="low" 
        onDragStart={handleDragStart} 
        onDragOver={handleDragOver} 
        onDrop={(e, id) => handleDrop(e, id, 'left')}
        className="p-6 bg-card border border-border rounded-2xl shadow-xl space-y-6"
      >
        {(() => {
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD, real current date
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth(); // 0-indexed
          const currentMonthLabel = today.toLocaleString('default', { month: 'long' });
          const todayDayNum = today.getDate();

          // Initialize streak calendar state or load from localStorage - honest
          // empty state for new users, no fabricated pre-existing streak.
          const [streakDays, setStreakDays] = useState<string[]>(() => {
            try {
              const saved = localStorage.getItem("blaze_recovery_streak_days");
              if (saved) return JSON.parse(saved);
            } catch (e) {}
            return [];
          });

          const [selectedDay, setSelectedDay] = useState<string | null>(null);

          const handleCommitTodayBudget = () => {
            if (streakDays.includes(todayStr)) return;
            const updated = [todayStr, ...streakDays];
            setStreakDays(updated);
            localStorage.setItem("blaze_recovery_streak_days", JSON.stringify(updated));
            onAwardPoints(50, "Energy Budget Maintained Today");
            // Also increase stats streak!
            try {
              const currentStats = JSON.parse(localStorage.getItem("blaze_break_stats") || "{}");
              if (currentStats) {
                currentStats.streak = (currentStats.streak || 0) + 1;
                localStorage.setItem("blaze_break_stats", JSON.stringify(currentStats));
              }
            } catch (e) {}
          };

          const isTodayCommitted = streakDays.includes(todayStr);

          // Monthly grid for the actual current month/year, computed for real
          // rather than hardcoded to a single test date.
          const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
          const startOffset = new Date(currentYear, currentMonth, 1).getDay(); // 0=Sunday
          const totalCells = daysInMonth + startOffset;

          // Consecutive-day streak counting backward from today, not a hardcoded range.
          const currentStreakLength = (() => {
            let count = 0;
            let cursor = new Date(today);
            while (streakDays.includes(cursor.toISOString().split('T')[0])) {
              count++;
              cursor.setDate(cursor.getDate() - 1);
            }
            return count;
          })();

          return (
            <div className="space-y-6 text-left">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/30 flex items-center justify-center text-success">
                    <Flame className="w-5 h-5 fill-success/20" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-main">Recovery Streak</h4>
                    <p className="text-[10px] text-text-muted font-black uppercase tracking-widest mt-0.5">Days you've checked in</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-mono font-black text-success tracking-tight">
                    {currentStreakLength} Days
                  </span>
                  <p className="text-[9px] uppercase font-black text-text-muted tracking-widest mt-0.5">Current Streak</p>
                </div>
              </div>

              {/* Calendar Grid */}
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-black uppercase text-text-main tracking-wider">{currentMonthLabel} {currentYear}</span>
                  <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-success/20 border border-success/40 inline-block" /> Checked in
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-mono mb-2 text-text-muted font-bold">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                    <div key={d} className="py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: totalCells }).map((_, i) => {
                    if (i < startOffset) {
                      return <div key={`empty-${i}`} className="aspect-square" />;
                    }

                    const dayNum = i - startOffset + 1;
                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const isStreak = streakDays.includes(dateStr);
                    const isToday = dayNum === todayDayNum;

                    return (
                      <motion.button
                        key={`day-${dayNum}`}
                        onClick={() => setSelectedDay(dateStr)}
                        initial={{ scale: 0.3, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ 
                          type: "spring", 
                          stiffness: 260, 
                          damping: 20, 
                          delay: (dayNum - 1) * 0.015 
                        }}
                        className={cn(
                          "aspect-square rounded-xl flex flex-col items-center justify-center relative border transition-all text-xs font-bold cursor-pointer",
                          isStreak 
                            ? "bg-success/15 border-success/45 text-success shadow-inner shadow-success/5 hover:bg-success/25" 
                            : isToday
                              ? "border-primary text-primary bg-primary/10 animate-pulse font-extrabold"
                              : "border-border/40 hover:border-border text-text-muted"
                        )}
                      >
                        <span>{dayNum}</span>
                        {isStreak && (
                          <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-success" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Day details or commitment trigger */}
              <AnimatePresence mode="wait">
                {selectedDay ? (
                  <motion.div
                    key="day-detail"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-4 bg-surface dark:bg-card/40 rounded-2xl border border-border text-xs relative text-left"
                  >
                    <button 
                      onClick={() => setSelectedDay(null)}
                      className="absolute top-3 right-3 text-text-muted hover:text-text-main font-bold"
                    >
                      ×
                    </button>
                    <p className="font-bold text-text-main">
                      {new Date(selectedDay + 'T00:00:00').toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' })} Status:
                    </p>
                    <p className="text-text-muted mt-1.5 font-medium leading-relaxed">
                      {streakDays.includes(selectedDay) 
                        ? "✓ Energy Budget fully maintained. Active repairs completed. +20 credits reserved."
                        : "No tracking data saved for this date. Complete your daily pulse or recovery tasks to mark stability achievements."}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="streak-action"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-3"
                  >
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-text-main">Commit Today's Energy Budget</p>
                        <p className="text-[10px] text-text-muted font-medium">Verify you kept your meetings and boundaries under budget for today ({currentMonthLabel} {todayDayNum}).</p>
                      </div>
                    </div>
                    <button
                      disabled={isTodayCommitted}
                      onClick={handleCommitTodayBudget}
                      className={cn(
                        "w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer",
                        isTodayCommitted 
                          ? "bg-success/15 border border-success/30 text-success cursor-default" 
                          : "btn-primary"
                      )}
                    >
                      {isTodayCommitted ? "✓ Today's Budget Locked" : "Lock Budget & Maintain Streak"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}
      </SmartCard>
    ),
    activity: (
      <ActivityLog 
        key="activity" 
        onDragStart={handleDragStart} 
        onDragOver={handleDragOver} 
        onDrop={(e, id) => handleDrop(e, id, 'left')} 
      />
    )
  };

  return (
    <div
      onTouchStart={handleHomeTouchStart}
      onTouchMove={handleHomeTouchMove}
      onTouchEnd={handleHomeTouchEnd}
      className="relative"
    >
      <div
        className="flex justify-center overflow-hidden transition-none"
        style={{ height: pullDistance > 0 || isPullRefreshing ? Math.max(pullDistance, isPullRefreshing ? 50 : 0) : 0 }}
      >
        <div className="flex items-center justify-center text-primary" style={{ opacity: Math.min(pullDistance / PULL_TRIGGER_THRESHOLD, 1) }}>
          <RefreshCw className={cn("w-5 h-5", isPullRefreshing && "animate-spin", !isPullRefreshing && pullDistance >= PULL_TRIGGER_THRESHOLD && "scale-110")} />
        </div>
      </div>
      <div style={{ transform: `translateY(${isPullRefreshing ? 0 : pullDistance}px)`, transition: pullStartYRef.current === null ? "transform 0.2s ease-out" : "none" }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 pb-20">
      <div
        className="lg:col-span-2 flex flex-col gap-10 min-h-[500px]"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={(e) => {
          // Fallback if dropped directly on container
          const targetCard = e.target as HTMLElement;
          if (targetCard.classList.contains('card')) return;
          const draggedId = e.dataTransfer.getData('cardId');
          if (leftOrder.includes(draggedId)) return;
          if (rightOrder.includes(draggedId)) {
            setRightOrder(rightOrder.filter(id => id !== draggedId));
            setLeftOrder([...leftOrder, draggedId]);
          }
        }}
      >
        <AnimatePresence>
          {leftOrder.map(id => (
            <motion.div key={id} layout transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="relative group/widget">
              <button
                onClick={() => handleHideCard(id)}
                title={`Hide ${WIDGET_LIBRARY[id] || 'card'}`}
                className="absolute top-4 right-4 z-30 p-1.5 rounded-full bg-card/90 border border-border text-text-muted hover:text-destructive opacity-0 group-hover/widget:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {cardsMap[id]}
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="relative">
          <button
            onClick={() => setShowAddWidgetMenu((v) => !v)}
            className="w-full py-4 rounded-2xl border border-dashed border-border text-text-muted hover:text-primary hover:border-primary/40 transition-colors text-sm font-bold flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add widget
          </button>
          <AnimatePresence>
            {showAddWidgetMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute z-30 mt-2 w-full max-h-80 overflow-y-auto custom-scrollbar bg-card border border-border rounded-2xl shadow-2xl p-2 space-y-1"
              >
                {hiddenWidgets.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-4">Everything's already on your dashboard.</p>
                ) : (
                  hiddenWidgets.map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        handleAddWidget(id);
                        setShowAddWidgetMenu(false);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm text-text-main hover:bg-surface transition-colors text-left"
                    >
                      <span>{WIDGET_LIBRARY[id] || id}</span>
                      <Plus className="w-4 h-4 text-text-muted shrink-0" />
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div
        className="flex flex-col gap-10 min-h-[500px]"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={(e) => {
          const targetCard = e.target as HTMLElement;
          if (targetCard.classList.contains('card')) return;
          const draggedId = e.dataTransfer.getData('cardId');
          if (rightOrder.includes(draggedId)) return;
          if (leftOrder.includes(draggedId)) {
            setLeftOrder(leftOrder.filter(id => id !== draggedId));
            setRightOrder([...rightOrder, draggedId]);
          }
        }}
      >
        <AnimatePresence>
          {rightOrder.map(id => (
            <motion.div key={id} layout transition={{ type: "spring", stiffness: 350, damping: 25, mass: 0.8 }} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="relative group/widget">
              <button
                onClick={() => handleHideCard(id)}
                title={`Hide ${WIDGET_LIBRARY[id] || 'card'}`}
                className="absolute top-4 right-4 z-30 p-1.5 rounded-full bg-card/90 border border-border text-text-muted hover:text-destructive opacity-0 group-hover/widget:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              {cardsMap[id]}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      </div>
      </div>

      {/* 'Quick Note' Floating Trigger Input Field */}
      <div className="fixed bottom-8 right-8 z-[80] font-sans">
        <AnimatePresence>
          {quickNoteOpen && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              className="absolute bottom-16 right-0 w-80 sm:w-96 bg-card border border-border/80 p-6 rounded-2xl shadow-2xl space-y-4 text-left backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wider text-text-main">Quick Trigger Capture</h5>
                    <p className="text-[9px] uppercase font-bold text-text-muted">Nova Quick Check-In</p>
                  </div>
                </div>
                <button
                  onClick={() => setQuickNoteOpen(false)}
                  className="text-text-muted hover:text-text-main text-sm font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {quickSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-success/10 border border-success/20 rounded-xl text-center space-y-1"
                >
                  <p className="text-xs font-bold text-success">✓ Trigger Captured & Neutralized</p>
                  <p className="text-[10px] text-text-muted font-medium">Logged securely. +25 XP awarded.</p>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[10px] text-text-muted leading-relaxed font-medium">
                    Log an immediate, live burnout trigger (e.g. unsolicited slack notification, unplanned fire-drill). Nova files this in memory to build boundary templates.
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-muted block">Immediate Drain Description</label>
                    <input
                      type="text"
                      value={quickTriggerText}
                      onChange={(e) => setQuickTriggerText(e.target.value)}
                      placeholder="e.g. Back-to-back status sync"
                      className="w-full bg-surface border border-border/70 rounded-xl px-3.5 py-2.5 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary font-sans font-semibold text-left"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-text-muted">
                      <span>Severity Burden</span>
                      <span className="font-mono text-primary font-bold">{quickSeverity}/10</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={quickSeverity}
                      onChange={(e) => setQuickSeverity(Number(e.target.value))}
                      className="w-full accent-primary h-1 bg-border rounded cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={handleSaveQuickTrigger}
                    disabled={!quickTriggerText.trim()}
                    className="w-full py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Log a Trigger (+25 XP)
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setQuickNoteOpen(!quickNoteOpen)}
          className="p-4 bg-primary text-primary-foreground hover:bg-primary/95 rounded-full shadow-[0_8px_30px_rgba(99,102,241,0.5)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer border border-primary/30"
        >
          <PencilLine className="w-5 h-5" />
          <span className="text-xs font-black uppercase tracking-widest pr-1 hidden sm:inline">Log Trigger</span>
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const { user, appRole, loading: authLoading, accessToken } = useAuth();

  // Bulletproof global super admin check
  const isSuperAdminUser = user?.email === 'teampublication@gmail.com' || (user as any)?.isAdmin === true;
  const effectiveRole = isSuperAdminUser ? 'platform_admin' : appRole;

  // Opportunistically build the real-signal data behind the Explainable
  // Recovery Score / archetype-evolution work. Calendar computes locally from
  // the user's own Google token and posts just the aggregate. Slack advances
  // one conversation per "tick" (the backend enforces its own 60s minimum
  // interval to respect Slack's rate limits), so calling this periodically
  // while the app is open lets a full 7-day scan complete over real usage
  // instead of needing a single, rate-limit-breaking bulk fetch.
  useEffect(() => {
    if (!user) return;

    if (accessToken) {
      syncCalendarSignal(accessToken);
    }

    const tickSlack = () => {
      secureApiFetch('/api/signals/slack/tick', { method: 'POST' }).catch(() => {
        // Not connected, rate-limited, or a transient error — all safe to skip silently.
      });
    };
    tickSlack();
    const slackTickInterval = setInterval(tickSlack, 65 * 1000);
    return () => clearInterval(slackTickInterval);
  }, [user, accessToken]);

  const [flow, setFlow] = useState<AppFlow>("landing");
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [fingerprint, setFingerprint] = useState<BurnoutFingerprint | null>(
    null,
  );
  const [isFocusActive, setIsFocusActive] = useState(false);

  // Global Sync State
  const [isGlobalSyncing, setIsGlobalSyncing] = useState(false);

  const handleTriggerGlobalSync = async () => {
    setIsGlobalSyncing(true);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    setIsGlobalSyncing(false);
    awardPoints(15, "Recovery data saved locally (+15 pts)");
  };

  // Dark Mode State
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("blaze_dark_mode");
      return (
        saved === "true" ||
        (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)
      );
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("blaze_dark_mode", String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  useEffect(() => {
    const handleNav = (e: Event) => {
      const tab = (e as CustomEvent).detail;
      if (tab) {
        setActiveTab(tab as ActiveTab);
      }
    };
    window.addEventListener('navigate_tab', handleNav);
    return () => window.removeEventListener('navigate_tab', handleNav);
  }, []);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showCrisisSupport, setShowCrisisSupport] = useState(false);
  const [isMobileNavCollapsed, setIsMobileNavCollapsed] = useState(false);
  const [showMobileToolsSheet, setShowMobileToolsSheet] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Daily Pulse State
  const [shipStage, setShipStage] = useState<SHIPStage>("Safety");
  const [energyLevel, setEnergyLevel] = useState(42);
  const [burnoutRisk, setBurnoutRisk] = useState("Elevated");
  const [showCheckIn, setShowCheckIn] = useState(false);

  // 30-Day Recovery Pulse History
  const [pulseHistory, setPulseHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("blaze_break_pulse_history");
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    
    return Array.from({length: 30}).map((_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const dt = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const score = 40 + Math.sin(i * 0.3) * 20 + Math.random() * 10;
      return {
        date: dt,
        score: Math.floor(score),
      };
    });
  });

  useEffect(() => {
    const lastCheckIn = localStorage.getItem("blaze_break_last_checkin");
    const today = new Date().toDateString();
    if (lastCheckIn !== today) {
      setShowCheckIn(true);
    }
  }, []);

  // Gamification State
  const [showSomaticReset, setShowSomaticReset] = useState(false);
  const [hasClaimedDaily, setHasClaimedDaily] = useState(false);
  const [showRewardNotification, setShowRewardNotification] = useState<{
    points: number;
    reason: string;
  } | null>(null);
  const [stats, setStats] = useState<UserStats>({
    points: 450,
    streak: 3,
    rehearsalCount: 0,
    lastEngagementDate: new Date().toISOString().split("T")[0],
    unlockedBadges: ["first_step"],
    supportCircle: [],
    committedActionIds: [],
    debts: MOCK_DEBTS.map((d, i) => ({ ...d, id: String(i), cleared: false })),
    recoveryScore: 29, // force test value
  });

  // Pulse Alert System
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          // Real push subscription — this is what lets a notification reach
          // this person even after they've stopped opening the app, unlike
          // the foreground-only notification below which only fires while
          // this tab is already open and looking at it.
          subscribeToPushNotifications();
        }
      });
    }
  }, []);

  useEffect(() => {
    // The server-side scheduled check (low score sustained, or check-in gone
    // stale) has nothing to look at without this — report on every score
    // computation so that check reflects reality, not stale data.
    if (user) {
      reportPulseStatus(stats.recoveryScore);
    }
  }, [stats.recoveryScore, user]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") {
      const history = JSON.parse(localStorage.getItem("blaze_break_pulse_history") || "[]");
      const isConsecutiveLow = history.length >= 2 && 
                               history[history.length - 1].score < 30 && 
                               history[history.length - 2].score < 30;
                               
      if (stats.recoveryScore < 30 || isConsecutiveLow) {
        const lastAlert = localStorage.getItem("lastPulseAlert");
        const today = new Date().toISOString().split("T")[0];
        
        if (lastAlert !== today) {
          const notification = new Notification("Nova: Critical Pulse Alert", {
            body: "Your Recovery Score has dropped below 30 for two consecutive days. A 60-second Somatic Reset is highly recommended."
          });
          
          notification.onclick = () => {
             setShowSomaticReset(true);
             window.focus();
             notification.close();
          };
          
          localStorage.setItem("lastPulseAlert", today);
        }
      }
    }
  }, [stats.recoveryScore]);

  // Track previous flow / auth changes to detect transitions
  const prevUserRef = useRef<any>(null);

  // Route Protection
  useEffect(() => {
    logJourney('Navigation Context', `User entering module: ${activeTab}`);
    
    // Check route protection as well
    const adminTabs = ["org", "evolution", "intelligence", "admin", "executive"];
    const isProtected = adminTabs.includes(activeTab);
    
    if (isProtected) {
      if (activeTab === "org" && effectiveRole !== "platform_admin" && !["manager", "organisation_admin", "individual"].includes(effectiveRole)) {
        setActiveTab("home");
      }
      else if (["evolution", "intelligence", "executive", "admin"].includes(activeTab) && !["platform_admin", "security_admin", "executive"].includes(effectiveRole)) {
        setActiveTab("home");
      }
    }
  }, [activeTab, effectiveRole]);

  useEffect(() => {
    if (authLoading) return;

    const email = user?.email || null;
    (window as any).__ACTIVE_USER_EMAIL__ = email;

    const savedStats = localStorage.getItem("blaze_break_stats");
    const savedFingerprint = localStorage.getItem("blaze_fingerprint");

    const defaults: UserStats = email
      ? {
          points: 0,
          streak: 0,
          rehearsalCount: 0,
          lastEngagementDate: new Date().toISOString().split("T")[0],
          unlockedBadges: [],
          supportCircle: [],
          committedActionIds: [],
          debts: [
            {
              id: "0",
              label: "Sleep Debt",
              value: 0,
              unit: "h",
              max: 15,
              color: "text-primary",
              impact: "Reduced emotional regulation.",
              novaNote: "Prefrontal fatigue detected. Unplug now.",
            },
            {
              id: "1",
              label: "Neural Fatigue",
              value: 0,
              unit: "cr",
              max: 20,
              color: "text-warning",
              impact: "Cognitive tunnel vision.",
              novaNote: "Neural de-escalation is needed. Pause planning.",
            },
            {
              id: "2",
              label: "Social Overlap",
              value: 0,
              unit: "h",
              max: 10,
              color: "text-text-main",
              impact: "Identity erosion from fawning.",
              novaNote: "Return to your baseline frame.",
            },
          ],
          profile: {
            fullName: user?.displayName || "",
            role: "",
            organization: "",
            managerEmail: "",
            authRole: "individual",
          },
        }
      : {
          points: 450,
          streak: 3,
          rehearsalCount: 0,
          lastEngagementDate: new Date().toISOString().split("T")[0],
          unlockedBadges: ["first_step"],
          supportCircle: [],
          committedActionIds: [],
          debts: MOCK_DEBTS.map((d, i) => ({
            ...d,
            id: String(i),
            cleared: false,
          })),
          profile: {
            fullName: "Test User",
            role: "",
            organization: "",
            managerEmail: "",
            authRole: "individual",
          },
        };

    if (savedStats) {
      try {
        setStats({ ...defaults, ...JSON.parse(savedStats) });
      } catch (e) {
        setStats(defaults);
      }
    } else {
      setStats(defaults);
    }

    if (savedFingerprint) {
      try {
        setFingerprint(JSON.parse(savedFingerprint));
      } catch (e) {
        setFingerprint(null);
      }
    } else {
      setFingerprint(null);
    }

    if (user) {
      if (flow === "landing") {
        const parsedStats = savedStats ? JSON.parse(savedStats) : null;
        if (parsedStats?.profile?.fullName) {
          setFlow("app");
        } else {
          setFlow("onboarding");
        }
      }
    } else {
      // Return back to landing only if they signed out intentionally
      if (prevUserRef.current !== null) {
        setFlow("landing");
      }
    }

    prevUserRef.current = user;
  }, [user, authLoading]);

  const checkBadges = (currentStats: UserStats): string[] => {
    const newBadges = [...currentStats.unlockedBadges];

    if (currentStats.points >= 1000 && !newBadges.includes("point_1000"))
      newBadges.push("point_1000");
    if (currentStats.points >= 2500 && !newBadges.includes("master_healer"))
      newBadges.push("master_healer");
    if (currentStats.streak >= 3 && !newBadges.includes("consistency_3"))
      newBadges.push("consistency_3");
    if (currentStats.streak >= 7 && !newBadges.includes("consistency_7"))
      newBadges.push("consistency_7");
    if (currentStats.rehearsalCount >= 5 && !newBadges.includes("boundary_set"))
      newBadges.push("boundary_set");
    if (currentStats.rehearsalCount >= 10 && !newBadges.includes("boundary_boss"))
      newBadges.push("boundary_boss");
    
    // Check new badges
    const sleepDebt = currentStats.debts?.find(d => d.label === 'Sleep Debt')?.value ?? 8;
    if (sleepDebt <= 4 && !newBadges.includes("consistent_sleep"))
      newBadges.push("consistent_sleep");
    if (currentStats.rehearsalCount >= 15 && !newBadges.includes("master_boundaries"))
      newBadges.push("master_boundaries");

    return newBadges;
  };

  useEffect(() => {
    if (authLoading) return;
    localStorage.setItem("blaze_break_stats", JSON.stringify(stats));
  }, [stats, authLoading, user]);

  const handleCheckInComplete = (data: {
    energy: number;
    risk: string;
    stage: SHIPStage;
    blameStage?: string;
  }) => {
    logJourney('Daily Check-In Completed', `Energy: ${data.energy}/100, Risk: ${data.risk}, Stage: ${data.stage}. ${data.blameStage ? `Identified Issue: ${data.blameStage}` : ''}`);
    setEnergyLevel(data.energy);
    setBurnoutRisk(data.risk);
    if (data.stage) setShipStage(data.stage);
    setShowCheckIn(false);
    
    if (data.blameStage) {
      console.log("Recorded BLAME stage:", data.blameStage);
    }
    
    // Update Pulse History
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    setPulseHistory((prev: any[]) => {
      const newHistory = [...prev];
      if (newHistory.length > 0 && newHistory[newHistory.length - 1].date === todayStr) {
        newHistory[newHistory.length - 1] = { ...newHistory[newHistory.length - 1], score: data.energy };
      } else {
        newHistory.push({ date: todayStr, score: data.energy });
        if (newHistory.length > 30) newHistory.shift();
      }
      localStorage.setItem("blaze_break_pulse_history", JSON.stringify(newHistory));
      return newHistory;
    });

    localStorage.setItem("blaze_break_last_checkin", new Date().toDateString());

    // Auto-unlock first_step if completing first check-in
    unlockBadge("first_step");

    // Guardian SMS automation has been disabled pending secure release mapping.
  };

  const unlockBadge = (id: string) => {
    setStats((prev) => {
      if (prev.unlockedBadges.includes(id)) return prev;
      return {
        ...prev,
        unlockedBadges: [...prev.unlockedBadges, id],
      };
    });
  };

  const awardPoints = (amount: number, reason: string) => {
    logJourney('Engagement Module', `${reason} (+${amount} points)`);
    setStats((prev) => {
      const updated = {
        ...prev,
        points: prev.points + amount,
      };
      return {
        ...updated,
        unlockedBadges: checkBadges(updated),
      };
    });

    setShowRewardNotification({ points: amount, reason });
    setTimeout(() => setShowRewardNotification(null), 4000);
  };

  const incrementRehearsal = () => {
    setStats((prev) => {
      const updated = {
        ...prev,
        rehearsalCount: prev.rehearsalCount + 1,
      };
      return {
        ...updated,
        unlockedBadges: checkBadges(updated),
      };
    });
  };

  const handleUpdateOperationalMetrics = (energy: number, risk: string) => {
    setEnergyLevel(energy);
    setBurnoutRisk(risk);
  };

  const handleUpdatePulseHistory = (date: string, score: number) => {
    setPulseHistory((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex((h) => h.date === date);
      if (idx !== -1) {
        copy[idx] = { date, score };
      } else {
        copy.push({ date, score });
        if (copy.length > 30) {
          copy.shift();
        }
      }
      localStorage.setItem("blaze_break_pulse_history", JSON.stringify(copy));
      return copy;
    });
  };

  const handleClaimDaily = () => {
    if (!hasClaimedDaily) {
      setHasClaimedDaily(true);

      // Update points and streak
      const today = new Date().toISOString().split("T")[0];
      setStats((prev) => {
        const isNewDay = prev.lastEngagementDate !== today;
        const updated = {
          ...prev,
          points: prev.points + 100,
          streak: isNewDay ? prev.streak + 1 : prev.streak,
          lastEngagementDate: today,
        };

        return {
          ...updated,
          unlockedBadges: checkBadges(updated),
        };
      });

      setShowRewardNotification({ points: 100, reason: "Daily Pulse Reward" });
      setTimeout(() => setShowRewardNotification(null), 4000);
    }
  };

  const handleAddContact = (contact: Omit<SupportContact, "id">) => {
    setStats((prev) => {
      const newContact: SupportContact = {
        ...contact,
        id: Math.random().toString(36).substr(2, 9),
      };
      return {
        ...prev,
        supportCircle: [...prev.supportCircle, newContact],
      };
    });
    awardPoints(25, "New Support Partner");
  };

  const handleRemoveContact = (id: string) => {
    setStats((prev) => ({
      ...prev,
      supportCircle: prev.supportCircle.filter((c) => c.id !== id),
    }));
  };

  const handleCommitAction = (actionId: string) => {
    setStats((prev) => {
      if (prev.committedActionIds.includes(actionId)) return prev;
      const updated = {
        ...prev,
        committedActionIds: [...prev.committedActionIds, actionId],
        points: prev.points + 50,
      };
      return {
        ...updated,
        unlockedBadges: checkBadges(updated),
      };
    });
    setShowRewardNotification({ points: 50, reason: "Direct Application" });
    setTimeout(() => setShowRewardNotification(null), 4000);
  };

  const titles: Record<string, string> = {
    plan: "Personalized Recovery Plan",
    micro: "Micro-Recovery",
    home: "Daily Pulse",
    diagnose: "Burnout Fingerprint",
    recover: "Recovery Hub",
    communicate: "Communication Lab",
    reflect: "The Action Engine",
    library: "Resource Library",
    nova: "Ask Nova",
    safety: "Safety & Support",
    org: "Organization Insights",
    integrations: "Integrations",
    engine: "Evolution Engine",
    reset: "Reset Studio",
    fuel: "Recovery Fuel Engine",
    signals: "Recovery Signals",
    sleep: "Sleep Builder",
    movement: "Movement Snacks",
    doorway: "Decompression Doorway",
    shield: "Digital Shield",
    resentment: "Resentment Tracker",
    workload: "Workload Reality Check",
    oneless: "One Less Thing",
    recipes: "Recovery Recipes",
    faith: "Grounding",
    privacy: "Privacy Centre",
  };

  useEffect(() => {
    // Sync Profile
    if (stats.profile) {
      updateNovaMemoryBySourceAndType("User Setup", "profile", {
        content: `User Profile: ${stats.profile.fullName}, Role: ${stats.profile.role}, Org: ${stats.profile.organization}.`,
        confidence: "verified",
        canEdit: true,
      });
    }

    // Sync State
    updateNovaMemoryBySourceAndType("Daily Check-in", "state", {
      content: `Current SHIP Stage: ${shipStage}, Energy Level: ${energyLevel}%, Burnout Risk: ${burnoutRisk}, Debt Count: ${(stats.debts || []).filter((d) => !d.cleared).length}. Active Recovery Plan Goals: ${fingerprint?.priorities.join(" | ") || "None set"}.`,
      confidence: "high",
      canEdit: false,
    });

    // Sync Fingerprint
    if (fingerprint) {
      updateNovaMemoryBySourceAndType("Diagnostic Engine", "profile", {
        content: `User exhibits burnout fingerprint: ${fingerprint.profile}. Priorities: ${fingerprint.priorities.join(", ")}.`,
        confidence: "high",
        canEdit: false,
      });

      let triggers = "";
      let tone = "";
      if (fingerprint.profile === "Founder on Fire") {
        triggers =
          "Existential threats, idle time, taking client feedback personally.";
        tone = "Aggressive reality-checks, analytical, firm prioritization.";
      } else if (fingerprint.profile === "Over-Giver") {
        triggers =
          "Guilt from resting, disappointing others, absorbing structural gaps.";
        tone =
          'Direct but supportive, challenging the "helpful" fawning behaviors.';
      } else if (fingerprint.profile === "Silent Resenter") {
        triggers =
          "Unnecessary obligations, performative compliance, buffering bad processes.";
        tone = "Validating resentment as data, encouraging radical candor.";
      } else if (fingerprint.profile === "Manager in the Middle") {
        triggers =
          "Squeeze play between leadership and reports, continuous emotional labor.";
        tone =
          "Structural, systemic, pushing back on timelines, mandating deep work blocks.";
      } else {
        triggers =
          "Cortisol spikes, structural anxiety, aiming for 120% when 85% is fine.";
        tone =
          "Direct, focusing on stability over optimization, anti-perfectionism.";
      }

      updateNovaMemoryBySourceAndType("Burnout Analysis", "trigger", {
        content: `Common triggers for this profile include: ${triggers}`,
        confidence: "high",
        canEdit: true,
      });

      updateNovaMemoryBySourceAndType("Coaching Alignment", "rule", {
        content: `Nova tone should be: ${tone}`,
        confidence: "verified",
        canEdit: false,
      });
    }

    // Sync Preferences
    try {
      const savedPrefs = localStorage.getItem("blaze_notification_preferences");
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);
        updateNovaMemoryBySourceAndType("Settings", "preference", {
          content: `Notification preferences: Emails ${prefs.email ? "Enabled" : "Disabled"}, Internal Warnings ${prefs.internalWarnings ? "Enabled" : "Disabled"}. Focus schedule: ${prefs.focusSchedule.start} to ${prefs.focusSchedule.end}.`,
          confidence: "verified",
          canEdit: true,
        });
      }
    } catch (e) {}

    // Sync Guardian Protocol
    const flags = localStorage.getItem("blaze_feature_flags");
    let guardianEnabled = false;
    if (flags) {
      try {
        guardianEnabled = JSON.parse(flags).enable_guardian_protocol;
      } catch (e) {}
    }
    const trustedContactsCount =
      stats.supportCircle?.filter((c: any) => c.isGuardian).length || 0;

    updateNovaMemoryBySourceAndType("Safety Engine", "rule", {
      content: `Guardian Alerts are ${guardianEnabled ? "ENABLED" : "DISABLED"} with ${trustedContactsCount} active trusted contacts. Nova ${guardianEnabled ? "may" : "may not"} escalate to trusted contacts during severe overload.`,
      confidence: "verified",
      canEdit: false,
    });
  }, [stats.profile, shipStage, energyLevel, burnoutRisk, fingerprint]);

  if (flow === "landing") {
    return (
      <>
        <LandingPage
          onStart={() => setFlow("onboarding")}
          onOpenTrustCentre={() => setFlow("trust-centre")}
        />
        <button
          onClick={() => setShowCrisisSupport(true)}
          className="fixed left-6 bg-info/10 text-info hover:bg-info/20 border border-info/20 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl transition-colors z-50 text-xs font-bold" style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          <LifeBuoy className="w-4 h-4 shrink-0" />
          <span>Need support now?</span>
        </button>
        <CrisisSupportModal isOpen={showCrisisSupport} onClose={() => setShowCrisisSupport(false)} />
      </>
    );
  }

  if (flow === "trust-centre") {
    return (
      <>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        }>
          <TrustCentrePage onBack={() => setFlow("landing")} />
        </Suspense>
        <button
          onClick={() => setShowCrisisSupport(true)}
          className="fixed left-6 bg-info/10 text-info hover:bg-info/20 border border-info/20 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl transition-colors z-50 text-xs font-bold" style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          <LifeBuoy className="w-4 h-4 shrink-0" />
          <span>Need support now?</span>
        </button>
        <CrisisSupportModal isOpen={showCrisisSupport} onClose={() => setShowCrisisSupport(false)} />
      </>
    );
  }

  if (flow === "onboarding") {
    return (
      <>
        <SituationalOnboarding
          onComplete={(profile) => {
            setStats((prev) => ({ ...prev, profile }));
            localStorage.setItem("blaze_profile", JSON.stringify(profile));
            setFlow("app");
            setActiveTab("home");

            updateNovaMemoryBySourceAndType("Onboarding Telemetry", "profile", {
              content: `Onboarding complete. Goal: ${profile.purpose || "N/A"}. Main drain: ${profile.primaryDrain || "N/A"}. Preferred tone: ${profile.novaTone || "N/A"}.`,
              confidence: "verified",
              canEdit: true,
            });
          }}
        />
        <button
          onClick={() => setShowCrisisSupport(true)}
          className="fixed left-6 bg-info/10 text-info hover:bg-info/20 border border-info/20 flex items-center gap-2 px-4 py-3 rounded-full shadow-2xl transition-colors z-50 text-xs font-bold" style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
          <LifeBuoy className="w-4 h-4 shrink-0" />
          <span>Need support now?</span>
        </button>
        <CrisisSupportModal isOpen={showCrisisSupport} onClose={() => setShowCrisisSupport(false)} />
      </>
    );
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-surface transition-colors duration-500",
        darkMode ? "dark" : "",
      )}
    >
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab as any}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        authRole={effectiveRole}
        currentTier={stats.profile?.subscription || "recovery"}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        onOpenCrisisSupport={() => setShowCrisisSupport(true)}
      />

      <motion.main
        layout
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "relative transition-colors duration-500",
          "p-8 md:p-12 lg:p-16 max-w-7xl mx-auto",
          isSidebarCollapsed ? "md:ml-32" : "md:ml-72",
        )}
      >
        {/* Reward Notification */}
        <AnimatePresence>
          {showRewardNotification && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-card text-text-main px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-border overflow-visible relative"
            >
              {/* Floating Sparkle Particles Burst */}
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                  animate={{
                    scale: [0, 1.3, 0],
                    x: [
                      0,
                      Math.sin((i * 2 * Math.PI) / 10) *
                        (50 + Math.random() * 60),
                    ],
                    y: [
                      0,
                      Math.cos((i * 2 * Math.PI) / 10) *
                        (50 + Math.random() * 60),
                    ],
                    opacity: [1, 1, 0],
                  }}
                  transition={{
                    duration: 1.2,
                    ease: "easeOut",
                    repeat: Infinity,
                    repeatDelay: 0.6,
                  }}
                  className="absolute w-2 h-2 rounded-full bg-warning pointer-events-none"
                  style={{ left: "50%", top: "50%", filter: "blur(0.5px)" }}
                />
              ))}
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary relative z-10 shrink-0">
                <Trophy className="w-6 h-6 animate-bounce" />
              </div>
              <div className="relative z-10">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
                  Recovery Progress Logged
                </p>
                <p className="text-sm font-bold">
                  +{showRewardNotification.points} for{" "}
                  {showRewardNotification.reason}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Header
          title={titles[activeTab] || "Dashboard Module"}
          activeTab={activeTab}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          onOpenSettings={() => setShowSettings(true)}
          onOpenTour={() => setShowWalkthrough(true)}
          onSomaticReset={() => setShowSomaticReset(true)}
          profile={stats.profile}
          burnoutRisk={burnoutRisk}
        />

        <SomaticResetOverlay isOpen={showSomaticReset} onClose={() => setShowSomaticReset(false)} onAwardPoints={awardPoints} />

        <SyncEngine
          stats={stats}
          setStats={setStats}
          fingerprint={fingerprint}
          setFingerprint={setFingerprint}
        />

        {user && (
          <div className="max-w-7xl mx-auto px-4 mt-8">
            <div className="bg-primary-dark/40 border border-primary/30 text-purple-200 px-4 py-3 rounded-xl text-sm font-medium flex flex-col sm:flex-row items-center justify-center gap-2 mb-4 text-center">
              <span className="font-bold flex items-center gap-1"><Shield className="w-4 h-4"/> Secure Account Test Mode</span>
              <span className="opacity-80">Personal recovery tracking, Nova memory, notifications, payments, and organisation features are not yet active. Do not enter sensitive info.</span>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            layout
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <Suspense fallback={
              <div className="flex items-center justify-center py-32">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            }>
            <>
            {activeTab === "home" && (
              <HomeSection
                onChatRequest={() => setActiveTab("nova")}
                onEnergyRequest={() => setActiveTab("recover")}
                fingerprint={fingerprint}
                stats={stats}
                onClaimDaily={handleClaimDaily}
                hasClaimedDaily={hasClaimedDaily}
                shipStage={shipStage}
                energyLevel={energyLevel}
                burnoutRisk={burnoutRisk}
                onOpenCheckIn={() => setShowCheckIn(true)}
                pulseHistory={pulseHistory}
                onAwardPoints={awardPoints}
                onUpdateOperationalMetrics={handleUpdateOperationalMetrics}
                onUpdatePulseHistory={handleUpdatePulseHistory}
                onLogJourney={logJourney}
              />
            )}

            {activeTab === "plan" && (
              <RecoveryPlan
                stats={stats}
                fingerprint={fingerprint}
                onAwardPoints={awardPoints}
                onNavigateTab={(tab) => setActiveTab(tab)}
                onRehearsalComplete={incrementRehearsal}
              />
            )}

            {activeTab === "diagnose" &&
              (!fingerprint ? (
                <DiagnoseView
                  onComplete={(f) => {
                    setFingerprint(f);
                    awardPoints(250, "Diagnostic Completion");
                    unlockBadge("first_step");
                  }}
                />
              ) : (
                <div className="space-y-32">
                  <ResultView
                    result={fingerprint}
                    onRestart={() => setFingerprint(null)}
                    onPlanStart={() => setActiveTab("recover")}
                    onAwardPoints={awardPoints}
                  />
                  <FutureSelfSimulator
                    fingerprint={fingerprint}
                  />
                </div>
              ))}

            {activeTab === "recover" && (
              <div className="space-y-32">
                <EnergyBudgetMatrix onPointsEarned={awardPoints} />
                <FocusZone
                  onAwardPoints={awardPoints}
                  isFocusActive={isFocusActive}
                  setIsFocusActive={setIsFocusActive}
                  currentShipStage={shipStage}
                />
                <EnergyBudgetTool
                  onAwardPoints={awardPoints}
                  currentStage={shipStage}
                  debts={stats.debts || []}
                />
                <MicroRecovery
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
                <OneLessThing
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
                <WorkloadRealityCheck
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
              </div>
            )}

            {activeTab === "communicate" && (
              <div className="space-y-32">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                  <div className="lg:col-span-2 space-y-12">
                    <BoundaryRehearsal
                      onAwardPoints={awardPoints}
                      onRehearsalComplete={incrementRehearsal}
                    />
                    <BoundaryAutopilot />
                  </div>
                  <div className="space-y-8">
                    <NegotiatorTool />
                    <div className="card bg-card text-text-main border-border space-y-6 transition-colors duration-500">
                      <h4 className="text-xs font-black uppercase tracking-widest text-primary">
                        Hard Talk Prep
                      </h4>
                      <div className="space-y-4">
                        <p className="text-xs text-text-muted leading-relaxed italic">
                          "Before a difficult talk, write down the one objective
                          fact that supports your boundary. No feelings, just
                          data."
                        </p>
                        <ul className="space-y-3">
                          <li className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-text-main">
                              01
                            </div>
                            <span className="text-xs uppercase font-black tracking-widest text-text-muted">
                              Identify the 'Trade-off'
                            </span>
                          </li>
                          <li className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-text-main">
                              02
                            </div>
                            <span className="text-xs uppercase font-black tracking-widest text-text-muted">
                              Anticipate 'Guilt Triggers'
                            </span>
                          </li>
                          <li className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded bg-black/5 dark:bg-white/10 flex items-center justify-center shrink-0 text-xs font-bold text-text-main">
                              03
                            </div>
                            <span className="text-xs uppercase font-black tracking-widest text-text-muted">
                              Script the Opening Line
                            </span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
                <DigitalBoundaryShield
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
                <NovaOverloadShield
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                  onNavigate={setActiveTab as any}
                />
              </div>
            )}

            {activeTab === "reflect" && (
              <div className="space-y-32">
                <ReflectSection
                  onAwardPoints={awardPoints}
                  committedActionIds={stats.committedActionIds}
                  onCommitAction={handleCommitAction}
                />
                <ResentmentTracker
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                  onNavigate={setActiveTab as any}
                />
              </div>
            )}

            {activeTab === "nova" && (
              <div className="space-y-32">
                <NovaChat
                  fingerprint={fingerprint}
                  systemInstruction={`You are Nova, the recovery coach. 
                  User's current stats: Points: ${stats.points}.
                  Recovery Debt Profile: ${JSON.stringify(stats.debts || [])}.
                  Use this data to provide surgical advice. If Sleep Debt is high, recommend rest. If Neural Fatigue is high, recommend deep work blocks or blackout.
                  Be direct and analytical. Use the user's Burnout Fingerprint archetypes if available.`}
                  initialMessage={
                    fingerprint
                      ? `Hey! As a "${fingerprint.profile}", today's recovery is critical. How can I help you set boundaries?`
                      : "I'm Nova. I help high achievers recover without losing their ambition. What's draining you today?"
                  }
                  onAwardPoints={awardPoints}
                  onNavigate={setActiveTab as any}
                />
              </div>
            )}

            {activeTab === "anxiety_reset" && (
              <div className="space-y-32">
                <AnxietyResetMode
                  onAwardPoints={awardPoints}
                  onNavigate={setActiveTab as any}
                />
              </div>
            )}

            {activeTab === "reset" && (
              <div className="space-y-32">
                <RuminationFurnace
                  onCleared={() => awardPoints(20, "Rumination Cleared")}
                />
                <NervousSystemReset fingerprint={fingerprint} />
                <SleepBuilder
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
                <MovementSnacks
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
                <DecompressionDoorway
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
                <RecoveryRecipes
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
                <FaithValuesMode
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
                <ResourceLibrary fingerprint={fingerprint} />
                <MicroInterventions shipStage={shipStage} />
              </div>
            )}

            {activeTab === "fuel" && (
              <div className="space-y-32">
                <RecoveryFuelEngine
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                  currentStage={shipStage}
                />
              </div>
            )}

            {activeTab === "ally" && (
              <div className="space-y-32">
                <RecoveryAlly />
                <NovaGuardianRelay
                  contacts={stats.supportCircle || []}
                  onAdd={handleAddContact}
                  onRemove={handleRemoveContact}
                />
              </div>
            )}

            {activeTab === "privacy" && (
              <div className="space-y-32">
                <PrivacyVault
                  profile={
                    stats.profile || {
                      fullName: "",
                      role: "",
                      organization: "",
                    }
                  }
                  onProfileUpdate={(p) =>
                    setStats((prev) => ({ ...prev, profile: p }))
                  }
                  isGlobalSyncing={isGlobalSyncing}
                  onTriggerSync={handleTriggerGlobalSync}
                  onAwardPoints={awardPoints}
                />
                <TrustCentrePage onBack={() => {}} />
                <AssuranceCentre />
                <IntegrationsDashboard />
              </div>
            )}

            {activeTab === "org" && (
              <div className="space-y-32">
                <OrgDashboard />
                <OutcomeTracker fingerprint={fingerprint} />
              </div>
            )}

            {activeTab === "evolution" && (
              <div className="space-y-32">
                <EvolutionEngine />
              </div>
            )}

            {activeTab === "executive" && (
              <div className="space-y-32 max-w-7xl mx-auto">
                <ExecutiveBoardReport
                  stats={stats}
                  isGlobalSyncing={isGlobalSyncing}
                  onTriggerSync={handleTriggerGlobalSync}
                  onAwardPoints={awardPoints}
                />
                <CalendarDefenseView />
                <IntegrationsDashboard />
              </div>
            )}

            {activeTab === "intelligence" && (
              <div className="space-y-32">
                <RecoveryIntelligenceLayer
                  fingerprint={fingerprint}
                  onAwardPoints={awardPoints}
                />
              </div>
            )}

            {activeTab === "admin" && (
              <div className="space-y-32">
                <AdminDashboard />
              </div>
            )}
            </>
            </Suspense>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {!user && showCheckIn && (
            <DailyCheckIn
              onComplete={handleCheckInComplete}
              onClose={() => setShowCheckIn(false)}
            />
          )}
          {user && showCheckIn && (
            <ConnectedDailyCheckIn
              onClose={() => setShowCheckIn(false)}
              onReviewWithNova={() => {
                setShowCheckIn(false);
                setActiveTab("nova");
              }}
            />
          )}
        </AnimatePresence>

        {flow === "app" && !user && (
          <>
            <OmniNova
              activeTab={activeTab}
              fingerprint={fingerprint}
              stats={stats}
            />
            <NovaFeedbackModal />
          </>
        )}
      </motion.main>

      {/* Mobile Nav */}
      <div className="md:hidden z-50">
        <button
          onClick={() => setShowCrisisSupport(true)}
          title="Need support now?"
          className="fixed top-1/2 -translate-y-1/2 w-12 h-12 rounded-full text-info bg-info/10 hover:bg-info/20 border border-info/20 flex items-center justify-center shadow-2xl transition-colors z-50" style={{ left: "calc(1rem + env(safe-area-inset-left))" }}
        >
          <LifeBuoy className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIsMobileNavCollapsed(!isMobileNavCollapsed)}
          className={cn(
            "fixed w-12 h-12 rounded-full glass border border-border text-text-main flex items-center justify-center shadow-2xl transition-all duration-300 z-50",
            isMobileNavCollapsed
              ? "shadow-primary/20 bg-text-main text-surface"
              : "",
          )}
          style={{
            right: "calc(1.5rem + env(safe-area-inset-right))",
            bottom: isMobileNavCollapsed
              ? "calc(1.5rem + env(safe-area-inset-bottom))"
              : "calc(6rem + env(safe-area-inset-bottom))",
          }}
        >
          {isMobileNavCollapsed ? (
            <Menu className="w-6 h-6" />
          ) : (
            <ChevronRight className="w-6 h-6 rotate-90" />
          )}
        </button>
        <motion.div
          initial={false}
          animate={{ y: isMobileNavCollapsed ? "100%" : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 w-full bg-card/80 backdrop-blur-xl border-t border-border pt-2 px-2 z-40 transition-colors duration-500"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          <AnimatePresence>
            {showMobileToolsSheet && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-2 right-2 mb-2 p-3 rounded-2xl bg-card border border-border shadow-2xl grid grid-cols-3 gap-2"
              >
                {ALL_TABS.filter((t) => t.group === "recovery_tools").map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as ActiveTab);
                      setShowMobileToolsSheet(false);
                    }}
                    className={`p-2 rounded-xl transition-all flex flex-col items-center gap-1 ${activeTab === tab.id ? "text-primary bg-primary/10" : "text-text-muted hover:text-text-main"}`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="text-[10px] font-bold tracking-wide text-center leading-tight">
                      {tab.label}
                    </span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex justify-around items-center h-14 overflow-x-auto custom-scrollbar px-2 gap-2">
            {(() => {
              const visibleTabs = ALL_TABS.filter(
                (t) =>
                  t.id !== "privacy" && // Reachable via Settings > Consent & Privacy instead
                  (effectiveRole === "platform_admin" ||
                  (t.roles.includes(effectiveRole || "individual") &&
                  (!t.featureId ||
                    hasSubscriptionEntitlement(
                      stats.profile?.subscription || "recovery",
                      t.featureId,
                    )))),
              );
              const renderedGroups = new Set<string>();
              return visibleTabs.map((tab) => {
                if (tab.group) {
                  if (renderedGroups.has(tab.group)) return null;
                  renderedGroups.add(tab.group);
                  const isGroupActive = visibleTabs.some(
                    (t) => t.group === tab.group && t.id === activeTab,
                  );
                  return (
                    <button
                      key={tab.group}
                      onClick={() => setShowMobileToolsSheet((v) => !v)}
                      className={`p-2 rounded-lg transition-all flex flex-col items-center gap-1 shrink-0 min-w-[56px] ${isGroupActive || showMobileToolsSheet ? "text-primary" : "text-text-muted hover:text-text-main"}`}
                    >
                      <div
                        className={`p-1.5 rounded-full transition-all ${isGroupActive || showMobileToolsSheet ? "bg-primary/10" : ""}`}
                      >
                        <Compass className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold tracking-wide">Tools</span>
                    </button>
                  );
                }
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as ActiveTab)}
                    className={`p-2 rounded-lg transition-all flex flex-col items-center gap-1 shrink-0 min-w-[56px] ${activeTab === tab.id ? "text-primary" : "text-text-muted hover:text-text-main"}`}
                  >
                    <div
                      className={`p-1.5 rounded-full transition-all ${activeTab === tab.id ? "bg-primary/10" : ""}`}
                    >
                      <tab.icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-bold tracking-wide">
                      {tab.label}
                    </span>
                  </button>
                );
              });
            })()}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <SettingsModal
            profile={stats.profile}
            onClose={() => setShowSettings(false)}
            onSave={(profile) => setStats((prev) => ({ ...prev, profile }))}
            onOpenPrivacyCentre={() => {
              setShowSettings(false);
              setActiveTab("privacy");
            }}
          />
        )}
        <Walkthrough
          isOpen={showWalkthrough}
          onClose={() => setShowWalkthrough(false)}
          onAwardPoints={awardPoints}
        />
      </AnimatePresence>

      <CrisisSupportModal isOpen={showCrisisSupport} onClose={() => setShowCrisisSupport(false)} />
      <InAppNudge />
    </div>
  );
}
