import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Battery, Waves, Zap, CheckCircle2, Circle, ArrowUpRight, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { SHIPStage } from '../types';

interface ShipQuest {
  // Stable, semantic ids - never index-based, so reordering or adding a
  // quest later can never silently "uncomplete" something someone already
  // did (their completion lives in stats.committedActionIds, keyed by
  // this exact string).
  id: string;
  title: string;
  // One honest sentence on why this specific quest matters for this
  // phase - not filler copy, drawn from the same SHIP framework language
  // Nova herself reasons from (server-knowledge.ts's THE SHIP FRAMEWORK
  // section), so the app and the coach never disagree about what SHIP is.
  why: string;
  // Deep-links to the real tool that does this - one of App.tsx's actual
  // ActiveTab values. Every quest here goes somewhere real; none of them
  // are decorative.
  tab: string;
  ctaLabel: string;
}

// Renamed from the old, colliding local `SHIPStage` (this component used
// to shadow the real, exported `SHIPStage` type from ../types with its own
// unrelated shape - confusing next to every other component that imports
// the real one). This is quest/copy configuration, not the stage enum.
interface ShipStageConfig {
  id: SHIPStage;
  label: string;
  icon: any;
  color: 'amber' | 'rose' | 'sky' | 'teal';
  // The authentic, already-established SHIP framework line for this
  // phase (matches server-knowledge.ts's NOVA_KNOWLEDGE_BASE verbatim in
  // spirit), not new invented copy.
  themeLine: string;
  quests: ShipQuest[];
}

export const SHIP_STAGES: ShipStageConfig[] = [
  {
    id: 'Safety',
    label: 'Safety',
    icon: ShieldAlert,
    color: 'amber',
    themeLine: 'Control access. Stop the daily energy hemorrhage. Boundaries are behaviours, not wishes.',
    quests: [
      {
        id: 'ship_safety_boundary_script',
        title: 'Rehearse one real boundary script',
        why: "A boundary only holds if you've said it out loud before you need it for real.",
        tab: 'communicate',
        ctaLabel: 'Open Boundary Rehearsal',
      },
      {
        id: 'ship_safety_blame_reset',
        title: 'Run a BLAME reset the next time you feel triggered',
        why: 'BLAME regains control today - SHIP is what stops you needing it quite so often.',
        tab: 'reset',
        ctaLabel: 'Open BLAME Reset',
      },
      {
        id: 'ship_safety_digital_blackout',
        title: 'Set an evening digital blackout boundary',
        why: 'Access you never close is access that never stops costing you.',
        tab: 'communicate',
        ctaLabel: 'Open Digital Boundary Shield',
      },
    ],
  },
  {
    id: 'Habits',
    label: 'Habits',
    icon: Battery,
    color: 'rose',
    themeLine: 'Floor versions count. Build an anchor in sleep, food, movement and light - shift from intensity to steady rhythm.',
    quests: [
      {
        id: 'ship_habits_sleep_debt',
        title: 'Reconcile your sleep debt',
        why: 'Sleep is the anchor every other habit depends on.',
        tab: 'reset',
        ctaLabel: 'Open Sleep Builder',
      },
      {
        id: 'ship_habits_movement_snack',
        title: 'Log one movement snack today',
        why: "Floor versions count - a two-minute stretch still counts as the anchor.",
        tab: 'reset',
        ctaLabel: 'Open Movement Snacks',
      },
      {
        id: 'ship_habits_checkin_streak',
        title: 'Keep your daily check-in streak alive',
        why: 'Consistency, not intensity, is what actually rebuilds rhythm.',
        tab: 'home',
        ctaLabel: 'Open Daily Check-In',
      },
    ],
  },
  {
    id: 'Identity',
    label: 'Identity',
    icon: Waves,
    color: 'sky',
    themeLine: 'Identity votes. Detach your worth from your output - shift from proving to being.',
    quests: [
      {
        id: 'ship_identity_reflect_action',
        title: "Turn one chapter's insight into a committed action",
        why: 'Understanding only becomes identity once you actually act on it.',
        tab: 'reflect',
        ctaLabel: 'Open Reflect',
      },
      {
        id: 'ship_identity_fingerprint_recheck',
        title: 'Re-run your burnout fingerprint',
        why: "See how far your patterns have actually shifted, not just how you feel about them.",
        tab: 'diagnose',
        ctaLabel: 'Open Diagnose',
      },
      {
        id: 'ship_identity_resentment_log',
        title: "Log what you're resenting right now",
        why: "Resentment is data about a boundary that hasn't been said yet.",
        tab: 'reflect',
        ctaLabel: 'Open Resentment Tracker',
      },
    ],
  },
  {
    id: 'Purpose',
    label: 'Purpose',
    icon: Zap,
    color: 'teal',
    themeLine: "Cut the noise disguised as urgency - protect what's actually urgent.",
    quests: [
      {
        id: 'ship_purpose_reality_check',
        title: 'Run a Workload Reality Check',
        why: 'Ambition without a filter for false urgency is just busyness with a better story.',
        tab: 'recover',
        ctaLabel: 'Open Workload Reality Check',
      },
      {
        id: 'ship_purpose_weekly_goal',
        title: 'Set one value-aligned weekly goal',
        why: "Growth that isn't chosen on purpose is just more load.",
        tab: 'recover',
        ctaLabel: 'Open Weekly Goal Tracker',
      },
      {
        id: 'ship_purpose_support_circle',
        title: 'Invite one ally into your Support Circle',
        why: 'Purpose held alone is fragile. Purpose held with people is durable.',
        tab: 'ally',
        ctaLabel: 'Open Support Circle',
      },
    ],
  },
];

// Re-exported from the shared, framework-free ship-stages.ts (not derived
// from SHIP_STAGES above) so App.tsx's badge logic AND server.ts's resume-
// prompt route both work from the exact same quest ids - one real source
// of truth, never two lists that can silently drift apart. See
// ship-stages.ts's own header comment for why the ids live there instead
// of being computed here as before.
export { SHIP_QUEST_IDS_BY_STAGE } from '../../ship-stages';

const COLOR_BG: Record<ShipStageConfig['color'], string> = {
  amber: 'bg-warning',
  rose: 'bg-destructive',
  sky: 'bg-info',
  teal: 'bg-teal-700',
};

const COLOR_TEXT: Record<ShipStageConfig['color'], string> = {
  amber: 'text-warning',
  rose: 'text-destructive',
  sky: 'text-info',
  teal: 'text-teal-700',
};

// A small ring, not a chart - shows real, verified completion (how many
// of this phase's quests are actually done), replacing the old stepper's
// purely positional "is this before my current index" logic with
// something honest: a phase can be fully complete without being the
// server's current recommended focus, and vice versa.
const CompletionRing = ({ completed, total, colorClass }: { completed: number; total: number; colorClass: string }) => {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const pct = total > 0 ? completed / total : 0;
  return (
    <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90" aria-hidden="true">
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-border" />
      <motion.circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        stroke="currentColor"
        className={colorClass}
        strokeDasharray={circumference}
        initial={false}
        animate={{ strokeDashoffset: circumference * (1 - pct) }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </svg>
  );
};

interface ShipJourneyProps {
  // Real, server-computed recovery phase (server.ts's deriveShipStage) -
  // this component only ever reads it, never re-derives or overrides it.
  // Per that route's own documented design intent, this is guidance, not
  // a gate: every phase's quests stay completable regardless of which one
  // is "current."
  currentStage: SHIPStage;
  committedActionIds: string[];
  onCommitAction: (actionId: string) => void;
  onNavigate?: (tab: string) => void;
}

export const ShipJourney = ({ currentStage, committedActionIds, onCommitAction, onNavigate }: ShipJourneyProps) => {
  // What the person is currently LOOKING at, independent of what Nova is
  // currently RECOMMENDING - the old component only ever displayed
  // STAGES[currentIndex], with no way to browse the other three phases at
  // all. Defaults to (and re-syncs with) the recommended stage whenever
  // it changes server-side, but browsing away from it is a local, harmless
  // view choice, never a write.
  const [viewedStageId, setViewedStageId] = useState<SHIPStage>(currentStage);
  useEffect(() => {
    setViewedStageId(currentStage);
  }, [currentStage]);

  const viewedIndex = SHIP_STAGES.findIndex((s) => s.id === viewedStageId);
  const viewedStage = SHIP_STAGES[viewedIndex] ?? SHIP_STAGES[0];

  const completedCountFor = (stage: ShipStageConfig) =>
    stage.quests.filter((q) => committedActionIds.includes(q.id)).length;

  const totalCompleted = SHIP_STAGES.reduce((sum, s) => sum + completedCountFor(s), 0);
  const totalQuests = SHIP_STAGES.reduce((sum, s) => sum + s.quests.length, 0);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start gap-4">
        {SHIP_STAGES.map((s) => {
          const isRecommended = s.id === currentStage;
          const isViewed = s.id === viewedStageId;
          const completed = completedCountFor(s);
          const isFullyComplete = completed === s.quests.length;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setViewedStageId(s.id)}
              aria-pressed={isViewed}
              aria-label={`View ${s.label} phase - ${completed} of ${s.quests.length} quests complete${isRecommended ? ', Nova\'s current recommended focus' : ''}`}
              className="flex-1 flex flex-col items-center gap-3 group cursor-pointer"
            >
              <div className="relative w-12 h-12">
                <CompletionRing completed={completed} total={s.quests.length} colorClass={COLOR_TEXT[s.color]} />
                <div
                  className={cn(
                    'absolute inset-[6px] rounded-full flex items-center justify-center transition-all duration-300',
                    isViewed ? `${COLOR_BG[s.color]} text-white shadow-lg` : 'bg-surface text-text-muted group-hover:text-text-main',
                  )}
                >
                  {isFullyComplete ? <CheckCircle2 className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                </div>
                {isRecommended && (
                  <span
                    className={cn('absolute -top-1 -right-1 w-3 h-3 rounded-full ring-2 ring-card', COLOR_BG[s.color])}
                    title="Nova's current recommended focus"
                  />
                )}
              </div>
              <div className="text-center">
                <span
                  className={cn(
                    'text-xs uppercase tracking-widest font-black block',
                    isViewed ? 'text-text-main' : 'text-text-muted',
                  )}
                >
                  {s.label}
                </span>
                <span className="text-[10px] text-text-muted font-medium">
                  {completed}/{s.quests.length}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={viewedStage.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="card border-primary/10 bg-gradient-to-br from-white to-slate-50/50 dark:from-card dark:to-card"
        >
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg', COLOR_BG[viewedStage.color])}>
                <viewedStage.icon className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-2xl font-light text-text-main">Phase: {viewedStage.label}</h3>
                <p className="text-sm text-text-muted italic mt-1">{viewedStage.themeLine}</p>
              </div>
            </div>
          </div>

          {viewedStageId !== currentStage && (
            <button
              type="button"
              onClick={() => setViewedStageId(currentStage)}
              className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary hover:opacity-80 transition-opacity"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Nova's current focus is {currentStage} - jump back
            </button>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase tracking-widest font-black text-text-muted">Recovery Quests</h4>
              <span className="text-xs text-text-muted font-medium">
                {completedCountFor(viewedStage)}/{viewedStage.quests.length} in this phase
              </span>
            </div>
            {viewedStage.quests.map((quest) => {
              const isDone = committedActionIds.includes(quest.id);
              return (
                <div
                  key={quest.id}
                  className={cn(
                    'flex items-start gap-4 p-4 bg-card border rounded-xl transition-colors',
                    isDone ? 'border-success/30 bg-success/5' : 'border-border',
                  )}
                >
                  <div
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={isDone ? `${quest.title} - completed` : `Mark "${quest.title}" as done`}
                    tabIndex={isDone ? -1 : 0}
                    onClick={() => { if (!isDone) onCommitAction(quest.id); }}
                    onKeyDown={(e) => {
                      if (isDone) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onCommitAction(quest.id);
                      }
                    }}
                    className={cn(
                      'w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                      isDone
                        ? 'border-success bg-success text-white cursor-default'
                        : 'border-border text-transparent cursor-pointer hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40',
                    )}
                  >
                    {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-3 h-3 opacity-0" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className={cn(
                        'text-sm font-medium block',
                        isDone ? 'text-text-muted line-through decoration-success/50' : 'text-text-main',
                      )}
                    >
                      {quest.title}
                    </span>
                    <span className="text-xs text-text-muted mt-0.5 block">{quest.why}</span>
                  </div>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate(quest.tab)}
                      className="shrink-0 flex items-center gap-1 text-xs font-bold text-primary hover:opacity-80 transition-opacity whitespace-nowrap mt-0.5"
                    >
                      {quest.ctaLabel}
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t border-border/60 flex items-center justify-between">
            <span className="text-xs text-text-muted font-medium">
              {totalCompleted} of {totalQuests} SHIP quests complete across your whole journey
            </span>
            <div className="w-32 h-1.5 rounded-full bg-border overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={false}
                animate={{ width: `${totalQuests > 0 ? (totalCompleted / totalQuests) * 100 : 0}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
