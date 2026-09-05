/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import {
  Home,
  LifeBuoy,
  MapPin,
  BatteryFull,
  MessageSquare,
  Book,
  Sparkles,
  Shield,
  Users,
  User,
  Trophy,
  Award,
  Zap,
  Moon,
  Sun,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Menu,
  Wind,
  Activity,
  ShieldCheck,
  Compass,
  Apple,
  Brain,
  Lock,
  HeartPulse,
} from "lucide-react";

import {
  BurnoutFingerprint,
  UserStats,
  SupportContact,
  Badge,
  BADGES,
  UserProfileData,
} from "./types.ts";
import { cn } from "./lib/utils.ts";
import { useFocusTrap } from "./lib/useFocusTrap";
import { auth, db } from "./lib/firebase.ts";
import { doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
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
const AllyNudgeScheduler = lazy(() => import("./components/AllyNudgeScheduler.tsx").then(m => ({ default: m.AllyNudgeScheduler })));
const OrgDashboard = lazy(() => import("./components/OrgDashboard.tsx").then(m => ({ default: m.OrgDashboard })));
const PrivacyVault = lazy(() => import("./components/PrivacyVault.tsx").then(m => ({ default: m.PrivacyVault })));
import { LandingPage } from "./components/LandingPage.tsx";
import { SituationalOnboarding } from "./components/SituationalOnboarding.tsx";
import { ConnectedDailyCheckIn } from "./components/ConnectedRecoveryModules.tsx";
const NegotiatorTool = lazy(() => import("./components/NegotiatorTool.tsx").then(m => ({ default: m.NegotiatorTool })));

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
import { AuthStatusTracker } from "./lib/sync.tsx";
import { initNovaBrain, clearNovaBrainCache } from "./lib/nova-brain";
import { useAuth } from "./lib/auth.tsx";
const IntegrationsDashboard = lazy(() => import("./components/IntegrationsDashboard.tsx").then(m => ({ default: m.IntegrationsDashboard })));
const AdminDashboard = lazy(() => import("./components/AdminDashboard.tsx").then(m => ({ default: m.AdminDashboard })));
import { NovaFeedbackModal } from "./components/NovaFeedbackModal.tsx";
import { InAppNudge } from "./components/InAppNudge.tsx";
const EvolutionEngine = lazy(() => import("./components/EvolutionEngine.tsx").then(m => ({ default: m.EvolutionEngine })));
import { MicroInterventions } from "./components/MicroInterventions.tsx";
import { NovaOverloadShield } from "./components/NovaOverloadShield.tsx";
import { updateNovaMemoryBySourceAndType, logJourney } from "./lib/nova-brain.ts";
const TrustCentrePage = lazy(() => import("./components/TrustCentrePage.tsx").then(m => ({ default: m.TrustCentrePage })));
import { hasSubscriptionEntitlement } from "./lib/entitlement.ts";
const RecoveryAlly = lazy(() => import("./components/RecoveryAlly.tsx").then(m => ({ default: m.RecoveryAlly })));
import { SomaticResetOverlay } from "./components/SomaticResetOverlay.tsx";
const RecoveryPlan = lazy(() => import("./components/RecoveryPlan.tsx").then(m => ({ default: m.RecoveryPlan })));
const FocusZone = lazy(() => import("./components/FocusZone.tsx").then(m => ({ default: m.FocusZone })));
import { SubscriptionTier } from "./types.ts";
const ExecutiveBoardReport = lazy(() => import("./components/ExecutiveBoardReport.tsx").then(m => ({ default: m.ExecutiveBoardReport })));
const CalendarDefenseView = lazy(() => import("./components/CalendarDefenseView.tsx").then(m => ({ default: m.CalendarDefenseView })));
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

// Components
const HomeSection = lazy(() => import("./components/HomeSection.tsx").then(m => ({ default: m.HomeSection })));

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
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(
      doc(db, "users", auth.currentUser.uid, "workload_reality_check", "state"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const tasksList = Array.isArray(data.tasks) ? data.tasks : [];
          const pending = tasksList.filter((t: any) => !t.completed).length;
          setPendingTasksCount(pending);
        }
      },
      (err) => {
        console.error(err);
      }
    );
    return () => unsubscribe();
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
                aria-label={tab.id === "recover" && pendingTasksCount > 0 ? `${tab.label}, ${pendingTasksCount} pending recovery task${pendingTasksCount === 1 ? '' : 's'}` : tab.label}
                aria-current={isActive ? 'page' : undefined}
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
                    aria-hidden="true"
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
  supportCircle,
  userName,
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
  supportCircle?: any[];
  userName?: string;
}) => {
  const [guardianPingActive, setGuardianPingActive] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleGuardianPing = async () => {
    if (guardianPingActive) return;
    const primary = (supportCircle || []).find((c: any) => c.role === 'primary_guardian') || (supportCircle || [])[0];
    if (!primary) {
      setToastMessage("No guardian is set up yet - add one in Guardian Protection Network first.");
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(primary.contactMethod)) {
      setToastMessage("Couldn't send - your guardian's number isn't in a valid format.");
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    setGuardianPingActive(true);
    const senderName = userName?.trim() || 'A Blaze Break user';
    try {
      const res = await secureApiFetch('/api/twilio/send', {
        method: 'POST',
        data: {
          to: primary.contactMethod,
          message: `Nova Alert: ${senderName} flagged high stress right now and asked for extra support. This message was sent because they manually requested it.`,
          useWhatsapp: primary.notificationPreference === 'whatsapp',
        },
      });
      const body = await res.json();
      setToastMessage(res.ok && body.success ? `Ping sent to ${primary.name}.` : (body.error || "Couldn't send that ping right now."));
    } catch (e) {
      setToastMessage("Couldn't reach the messaging service right now.");
    }
    setTimeout(() => { setToastMessage(null); setGuardianPingActive(false); }, 4000);
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
          (burnoutRisk === "Elevated"
            ? "Your recent check-ins point to elevated strain. A protected reset today would help."
            : burnoutRisk === "Moderate"
            ? "Things look manageable, but worth keeping an eye on your energy today."
            : burnoutRisk === "Stable"
            ? "Your baseline looks steady. Keep doing what's working."
            : "Log a check-in to get a real read on your baseline today.")}
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

export default function App() {
  const { user, appRole, loading: authLoading, accessToken } = useAuth();

  // Bulletproof global super admin check
  const isSuperAdminUser = user?.email === 'teampublication@gmail.com' || (user as any)?.isAdmin === true;
  const effectiveRole = isSuperAdminUser ? 'platform_admin' : appRole;

  // Computed once rather than inline in the animate prop - regenerating these
  // on every render would make the sparkle burst's trajectories visibly jump
  // mid-animation if anything causes a re-render while it's looping.
  const sparkleOffsets = useMemo(() => [...Array(10)].map(() => 50 + Math.random() * 60), []);

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
  const [postOnboardingProfile, setPostOnboardingProfile] = useState<UserProfileData | null>(null);
  const welcomeModalRef = useFocusTrap(!!postOnboardingProfile);
  useEffect(() => {
    if (!postOnboardingProfile) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setPostOnboardingProfile(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [postOnboardingProfile]);
  const [isMobileNavCollapsed, setIsMobileNavCollapsed] = useState(false);
  const [showMobileToolsSheet, setShowMobileToolsSheet] = useState(false);

  useEffect(() => {
    if (!showMobileToolsSheet) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMobileToolsSheet(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showMobileToolsSheet]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Daily Pulse State
  const [shipStage, setShipStage] = useState<SHIPStage>("Safety");
  const [energyLevel, setEnergyLevel] = useState(42);
  const [burnoutRisk, setBurnoutRisk] = useState("Not yet assessed");
  const [showCheckIn, setShowCheckIn] = useState(false);

  // 30-Day Recovery Pulse History
  const [pulseHistory, setPulseHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("blaze_break_pulse_history");
      if (saved) return JSON.parse(saved);
    } catch(e) {
      // Non-fatal - falls through to generating the default 30-day
      // history below.
    }
    
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
  const [showRewardNotification, setShowRewardNotification] = useState<{
    points: number;
    reason: string;
  } | null>(null);
  const [showBadgeUnlocked, setShowBadgeUnlocked] = useState<Badge | null>(null);
  const prevUnlockedBadgesRef = useRef<string[]>([]);
  const hasSetInitialBadgesRef = useRef(false);
  const [stats, setStats] = useState<UserStats>({
    points: 0,
    streak: 0,
    rehearsalCount: 0,
    lastEngagementDate: '',
    unlockedBadges: [],
    supportCircle: [],
    committedActionIds: [],
    debts: [],
  });

  // Derived from the real, persisted lastEngagementDate rather than a
  // separate resettable boolean - a plain useState(false) here would reset
  // to false on every page refresh regardless of whether the person had
  // actually already claimed today, showing the wrong state on reload and
  // letting the same-day double-claim guard get bypassed by a refresh.
  const todayStr = new Date().toISOString().split("T")[0];
  const hasClaimedDaily = stats.lastEngagementDate === todayStr;

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
  const flowRef = useRef(flow);
  const statsLoadedRef = useRef(false);
  const fingerprintLoadedRef = useRef(false);
  flowRef.current = flow;

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

    const loadStats = async () => {
      const savedFingerprint = localStorage.getItem("blaze_fingerprint");

      if (user) {
        initNovaBrain(user.uid); // Fire-and-forget - populates the cache; callers just see an empty brain until it resolves.
      } else {
        clearNovaBrainCache();
      }

      // A single, honest default for everyone - previously anonymous users
      // (the vast majority, since anonymous auth signs everyone in
      // automatically) saw fabricated demo data (450 points, "Test User",
      // invented debt values) presented as their own real progress, with no
      // path back to honest data unless they specifically linked an email.
      const defaults: UserStats = {
        points: 0,
        streak: 0,
        rehearsalCount: 0,
        lastEngagementDate: '',
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
      };

      let loadedStats = defaults;
      let loadedFingerprint: BurnoutFingerprint | null = null;
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid, "user_stats", "core"));
          if (snap.exists()) {
            const data = snap.data();
            loadedStats = { ...defaults, ...data } as UserStats;
            if (data.fingerprint) {
              loadedFingerprint = data.fingerprint as BurnoutFingerprint;
            }
          }
        } catch (e) {
          // Leaves the honest defaults in place rather than pretending progress loaded.
        }
      }
      setStats(loadedStats);
      statsLoadedRef.current = true;

      // Firestore is the real source of truth now. localStorage is only
      // consulted as a one-time migration path for anyone who took the
      // assessment before this was persisted server-side - their result
      // gets picked up here and will save to Firestore on the next
      // natural save cycle below, rather than being silently lost.
      if (loadedFingerprint) {
        setFingerprint(loadedFingerprint);
      } else if (savedFingerprint) {
        try {
          setFingerprint(JSON.parse(savedFingerprint));
        } catch (e) {
          setFingerprint(null);
        }
      } else {
        setFingerprint(null);
      }
      fingerprintLoadedRef.current = true;

      if (user) {
        if (flowRef.current === "landing") {
          if (loadedStats?.profile?.fullName) {
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
    };

    loadStats();
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
    if (authLoading || !user || !statsLoadedRef.current) return;
    if (!hasSetInitialBadgesRef.current) {
      // First run after the real, loaded stats are in - this establishes
      // the baseline to compare against, not a celebration moment. Badges
      // already unlocked in a previous session should never trigger this.
      prevUnlockedBadgesRef.current = stats.unlockedBadges;
      hasSetInitialBadgesRef.current = true;
      return;
    }
    const newlyUnlocked = stats.unlockedBadges.filter(id => !prevUnlockedBadgesRef.current.includes(id));
    prevUnlockedBadgesRef.current = stats.unlockedBadges;
    if (newlyUnlocked.length > 0) {
      const badge = BADGES.find(b => b.id === newlyUnlocked[0]);
      if (badge) {
        setShowBadgeUnlocked(badge);
        confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
        setTimeout(() => setShowBadgeUnlocked(null), 5000);
      }
    }
  }, [stats.unlockedBadges, authLoading, user]);

  useEffect(() => {
    if (authLoading || !user || !statsLoadedRef.current) return;
    const t = setTimeout(() => {
      setDoc(doc(db, "users", user.uid, "user_stats", "core"), {
        ...stats,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {
        // Non-fatal - the UI still reflects the change locally even if this save fails.
      });
    }, 800);
    return () => clearTimeout(t);
  }, [stats, authLoading, user]);

  useEffect(() => {
    if (authLoading || !user || !fingerprintLoadedRef.current) return;
    const t = setTimeout(() => {
      setDoc(doc(db, "users", user.uid, "user_stats", "core"), {
        fingerprint: fingerprint || null,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(() => {
        // Non-fatal - the UI still reflects the change locally even if this save fails.
      });
    }, 800);
    return () => clearTimeout(t);
  }, [fingerprint, authLoading, user]);

  const handleCheckInComplete = (data: {
    energyLevel: number;
    focusLevel: number;
    detachmentLevel: number;
    stressLoad: number;
  }) => {
    logJourney('Daily Check-In Completed', `Energy: ${data.energyLevel}/10, Focus: ${data.focusLevel}/10, Detachment: ${data.detachmentLevel}/10, Stress: ${data.stressLoad}/10.`);
    if (auth.currentUser) {
      secureApiFetch('/api/user/mark-activity', {
        method: 'POST',
        data: { activity: 'checkIn' },
      }).catch(() => {
        // Non-fatal - only affects the home recommendation engine's freshness.
      });
    }
    setEnergyLevel(Math.round(data.energyLevel * 10));
    const risk = (data.stressLoad >= 7 || data.detachmentLevel >= 7) ? 'Elevated'
      : (data.stressLoad >= 4 || data.detachmentLevel >= 4) ? 'Moderate'
      : 'Stable';
    setBurnoutRisk(risk);
    setShowCheckIn(false);

    // Update Pulse History
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    setPulseHistory((prev: any[]) => {
      const newHistory = [...prev];
      const score = Math.round(data.energyLevel * 10);
      if (newHistory.length > 0 && newHistory[newHistory.length - 1].date === todayStr) {
        newHistory[newHistory.length - 1] = { ...newHistory[newHistory.length - 1], score };
      } else {
        newHistory.push({ date: todayStr, score });
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
      confetti({ particleCount: 100, spread: 65, origin: { y: 0.6 } });
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

      let triggers: string;
      let tone: string;
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
    } catch (e) {
      // Non-fatal - one memory-sync block among several here; a failure
      // doesn't need to block the Guardian Protocol sync right below it.
    }

    // Sync Guardian Protocol
    const flags = localStorage.getItem("blaze_feature_flags");
    let guardianEnabled = false;
    if (flags) {
      try {
        guardianEnabled = JSON.parse(flags).enable_guardian_protocol;
      } catch (e) {
        // Non-fatal - guardianEnabled just stays false if this is
        // missing or corrupted.
      }
    }
    const trustedContactsCount =
      stats.supportCircle?.filter((c: any) => c.isGuardian).length || 0;

    updateNovaMemoryBySourceAndType("Safety Engine", "rule", {
      content: `Guardian Check-In Suggestions are ${guardianEnabled ? "ENABLED" : "DISABLED"} with ${trustedContactsCount} active trusted contacts. Nova ${guardianEnabled ? "may suggest" : "should not suggest"} reaching out to a trusted contact during severe overload - Nova has no ability to contact anyone directly; the user must send any alert themselves from Guardian Relay.`,
      confidence: "verified",
      canEdit: false,
    });
  }, [stats.profile, shipStage, energyLevel, burnoutRisk, fingerprint, stats.debts, stats.supportCircle]);

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
            setPostOnboardingProfile(profile);

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
              role="status"
              aria-live="polite"
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
                        sparkleOffsets[i],
                    ],
                    y: [
                      0,
                      Math.cos((i * 2 * Math.PI) / 10) *
                        sparkleOffsets[i],
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

          {showBadgeUnlocked && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-card text-text-main px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-primary/30"
              role="status"
              aria-live="polite"
            >
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary shrink-0">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
                  Badge Unlocked
                </p>
                <p className="text-sm font-bold">{showBadgeUnlocked.name}</p>
                <p className="text-xs text-text-muted">{showBadgeUnlocked.description}</p>
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
          supportCircle={stats.supportCircle}
          userName={stats.profile?.fullName}
        />

        <SomaticResetOverlay isOpen={showSomaticReset} onClose={() => setShowSomaticReset(false)} onAwardPoints={awardPoints} />

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
                onIncrementStreak={() => setStats((prev) => ({ ...prev, streak: (prev.streak || 0) + 1 }))}
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
                <NervousSystemReset fingerprint={fingerprint} onAwardPoints={awardPoints} />
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
                  userName={stats.profile?.fullName}
                />
                <AllyNudgeScheduler contacts={stats.supportCircle || []} />
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
          {user && showCheckIn && (
            <ConnectedDailyCheckIn
              onClose={() => setShowCheckIn(false)}
              onComplete={handleCheckInComplete}
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
                    aria-current={activeTab === tab.id ? 'page' : undefined}
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
                      aria-expanded={showMobileToolsSheet}
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
                    aria-current={activeTab === tab.id ? 'page' : undefined}
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

      <AnimatePresence>
        {postOnboardingProfile && (() => {
          // Maps the real, actual options from the onboarding questionnaire
          // (SituationalOnboarding.tsx's "What's draining you the most
          // right now?" question) to one genuinely relevant feature - one
          // recommendation, not a tour through all 17, matching the same
          // "one clear next step" philosophy the home screen's default
          // widget set already uses.
          const drainToFeature: Record<string, { tab: ActiveTab; label: string }> = {
            "Workload and deadlines": { tab: "recover", label: "Recover" },
            "People and expectations": { tab: "communicate", label: "Communicate" },
            "Constant notifications and interruptions": { tab: "reset", label: "Nervous System" },
            "The pressure of leading others": { tab: "plan", label: "Recovery Plan" },
          };
          const rec = postOnboardingProfile.primaryDrain ? drainToFeature[postOnboardingProfile.primaryDrain] : null;
          const dismiss = () => setPostOnboardingProfile(null);
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-background/95 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                ref={welcomeModalRef as any}
                role="dialog"
                aria-modal="true"
                aria-labelledby="welcome-modal-heading"
                tabIndex={-1}
                className="card max-w-md w-full space-y-6 text-center"
              >
                <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div className="space-y-2">
                  <h2 id="welcome-modal-heading" className="text-xl font-display font-bold text-text-main">
                    {postOnboardingProfile.fullName ? `Welcome, ${postOnboardingProfile.fullName.split(" ")[0]}.` : "Welcome."}
                  </h2>
                  <p className="text-sm text-text-muted leading-relaxed">
                    You'll earn points and unlock badges as you go - check your progress anytime from the home screen. Not sure where to start? Just ask Nova; it can point you to the right tool.
                  </p>
                </div>
                {rec && (
                  <div className="p-4 bg-surface dark:bg-card/40 border border-border rounded-xl text-left">
                    <p className="text-[11px] uppercase font-bold tracking-widest text-primary mb-1">Based on what you told us</p>
                    <p className="text-sm text-text-main">
                      <span className="font-bold">{rec.label}</span> is a good place to start.
                    </p>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {rec && (
                    <button
                      onClick={() => { setActiveTab(rec.tab); dismiss(); }}
                      className="w-full py-3 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:opacity-90 transition-opacity"
                    >
                      Take me there
                    </button>
                  )}
                  <button
                    onClick={dismiss}
                    className="w-full py-3 text-text-muted hover:text-text-main font-medium text-sm transition-colors"
                  >
                    I'll explore on my own
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
