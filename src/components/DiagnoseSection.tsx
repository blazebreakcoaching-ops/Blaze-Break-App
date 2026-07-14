import { auth } from '../lib/firebase';
import { ConnectedBurnoutFingerprint } from './ConnectedRecoveryModules.tsx';
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCcw,
  Sparkles,
  AlertTriangle,
  Activity,
  Compass,
  Moon,
  TrendingUp,
  User,
  Heart,
  ShieldCheck,
  Copy,
  Check,
  BookOpen,
} from "lucide-react";
import { BurnoutFingerprint } from "../types";
import { secureApiFetch } from "../lib/secure-api";

const questions = [
  {
    id: "workload",
    text: "How often do you feel like your daily workload is physically and mentally impossible to complete?",
    options: [
      { text: "Rarely — it sits around a comfortable baseline", value: 1 },
      { text: "Sometimes — but I catch up on weekends", value: 2 },
      { text: "Most days — I am perpetually behind and sinking", value: 3 },
      { text: "Every waking hour — it is an endless tidal wave", value: 4 },
    ],
  },
  {
    id: "boundaries",
    text: 'When someone requests a "quick favor" that encroaches on your focused recovery time, you:',
    options: [
      {
        text: "Hold my line. I politely but firmly decline if I am occupied.",
        value: 1,
      },
      {
        text: "Flinch but accept. I say yes and just absorb the extra stress.",
        value: 2,
      },
      {
        text: "Accept grudgingly. I say yes but quietly simmer with irritation.",
        value: 3,
      },
      {
        text: "Panic and prioritize. I drop my own health to solve their problem.",
        value: 4,
      },
    ],
  },
  {
    id: "peoplePleasing",
    text: 'How much of your daily energy is spent "fawning," proving your worth, or managing other people\'s emotional temperatures?',
    options: [
      {
        text: "Very little. I operate from my standards, not approval.",
        value: 1,
      },
      { text: "A moderate amount. I prefer keeping the peace.", value: 2 },
      {
        text: "Significant amount. I feel responsible for everyone's mood.",
        value: 3,
      },
      {
        text: "All of it. My self-worth is entirely fused with being helpful and perfect.",
        value: 4,
      },
    ],
  },
  {
    id: "guilt",
    text: "What happens in your nervous system when you attempt to sit still, rest, or do absolutely nothing for an hour?",
    options: [
      {
        text: "Baseline stability. I feel peaceful and physically relaxed.",
        value: 1,
      },
      {
        text: "Mild restlessness. My mind reels off a few pending tasks.",
        value: 2,
      },
      {
        text: "Intense guilt. I feel lazy, useless, and feel forced to check my phone.",
        value: 3,
      },
      {
        text: "Full panic/activation. Red alert. I feel physically unsafe doing nothing.",
        value: 4,
      },
    ],
  },
  {
    id: "sleep",
    text: 'Rate the state of your sleep and ability to turn off the "performance narrative" at night:',
    options: [
      {
        text: "Acoustic and deep. I sleep soundly and wake restored.",
        value: 1,
      },
      {
        text: "Wired but tired. I fall asleep exhausted but wake at 3 AM with active chatter.",
        value: 2,
      },
      {
        text: "Severe neural fatigue. I stare at screens, then lie awake drafting emails.",
        value: 3,
      },
      {
        text: "Digital paralysis. I sleep 4 hours maximum: my brain never shuts down.",
        value: 4,
      },
    ],
  },
  {
    id: "emotionalOverload",
    text: 'How frequently do you find yourself feeling emotionally cynical, irritable, or completely "flat" (no joy, no spark)?',
    options: [
      { text: "Rarely. I feel reactive but highly resilient.", value: 1 },
      {
        text: "Occasionally. I get cynical under intense deadlines.",
        value: 2,
      },
      {
        text: "Constantly. I view colleagues with annoyance and feel completely empty.",
        value: 3,
      },
      {
        text: "I have checked out. I feel like a cold machine going through motions.",
        value: 4,
      },
    ],
  },
  {
    id: "meaning",
    text: 'How connected do you feel to your sense of purpose, versus feeling like you are in "pure survival mode"?',
    options: [
      {
        text: "Strongly aligned. I know exactly why I am doing this.",
        value: 1,
      },
      {
        text: "Fading alignment. The vision is getting buried under administrative tax.",
        value: 2,
      },
      {
        text: "Completely disconnected. It is entirely a survival run for the paycheck or exit.",
        value: 3,
      },
      {
        text: "Crisis block. I do not remember what a meaningful activity feels like.",
        value: 4,
      },
    ],
  },
];

export const DiagnoseView = ({
  onComplete,
}: {
  onComplete: (f: BurnoutFingerprint) => void;
}) => {
  if (auth.currentUser) return <ConnectedBurnoutFingerprint />;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnswer = (val: number) => {
    const nextAnswers = { ...answers, [questions[step].id]: val };
    setAnswers(nextAnswers);
    if (step < questions.length - 1) {
      setStep(step + 1);
    } else {
      submitAssessment(nextAnswers);
    }
  };

  const submitAssessment = async (finalAnswers: Record<string, number>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await secureApiFetch("/api/nova/diagnose", {
        method: "POST",
        data: { answers: finalAnswers },
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onComplete(data);
    } catch (err: any) {
      setError(err.message || "Failed to analyze assessment");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        >
          <RefreshCcw className="w-12 h-12 text-primary opacity-40" />
        </motion.div>
        <p className="text-xl text-text-muted text-center italic">
          Nova is analyzing your burnout fingerprint...
          <br />
          <span className="text-sm font-bold uppercase tracking-widest  not-italic">
            Connecting dots in your energy patterns
          </span>
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card border-destructive/20 bg-destructive/10 flex flex-col items-center text-center p-12 gap-6">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h3 className="font-display text-2xl font-bold">
          Something went wrong
        </h3>
        <p className="font-serif text-lg opacity-60">{error}</p>
        <button onClick={() => setStep(0)} className="btn-primary bg-destructive">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="mb-12">
        <div className="flex justify-between items-end mb-4 text-xs uppercase tracking-widest font-black text-text-muted">
          <span>
            Question {step + 1} of {questions.length}
          </span>
          <span>{Math.round(((step + 1) / questions.length) * 100)}%</span>
        </div>
        <div className="h-1 bg-surface dark:bg-card rounded-full">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${((step + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-8"
        >
          <span className="text-xs uppercase tracking-widest text-primary font-bold">
            Leak Category: {questions[step].id.toUpperCase()}
          </span>
          <h3 className="text-3xl font-light text-text-main leading-tight">
            {questions[step].text}
          </h3>

          <div className="grid grid-cols-1 gap-4">
            {questions[step].options.map((option, idx) => (
              <button
                key={`${option.text}-${idx}`}
                onClick={() => handleAnswer(option.value)}
                className="group flex items-center justify-between p-6 bg-white border border-border rounded-xl text-left hover:border-primary hover:shadow-md transition-all cursor-pointer"
              >
                <span className="text-lg text-text-muted font-medium">
                  {option.text}
                </span>
                <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all">
                  <ArrowRight className="w-4 h-4 text-text-main opacity-0 group-hover:opacity-100" />
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {step > 0 && (
        <button
          onClick={() => setStep(step - 1)}
          className="mt-8 flex items-center gap-2 text-text-muted text-xs font-bold uppercase tracking-widest hover:text-text-muted transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      )}
    </div>
  );
};

interface FingerprintScores {
  workload: number;
  boundaries: number;
  peoplePleasing: number;
  guilt: number;
  sleep: number;
  emotionalOverload: number;
  meaning: number;
}

const leakKeys: { key: keyof FingerprintScores; label: string; icon: any }[] = [
  { key: "workload", label: "Workload Pressure", icon: TrendingUp },
  { key: "boundaries", label: "Boundary Performance", icon: ShieldCheck },
  { key: "peoplePleasing", label: "People-Pleasing & Fawning", icon: Heart },
  { key: "guilt", label: "Resting Guilt", icon: AlertTriangle },
  { key: "sleep", label: "Wired Night Chatter", icon: Moon },
  {
    key: "emotionalOverload",
    label: "Emotional & Somatic Fatigue",
    icon: Activity,
  },
  { key: "meaning", label: "Sense of Meaning / Alignment", icon: Compass },
];

const getLeakDetails = (key: string, score: number) => {
  const details: Record<
    string,
    Record<
      number,
      {
        title: string;
        desc: string;
        color: string;
        bg: string;
        text: string;
        width: string;
      }
    >
  > = {
    workload: {
      1: {
        title: "Optimal",
        desc: "Working within sustainable physiological bounds.",
        color: "bg-success",
        bg: "bg-success/10",
        text: "text-success-foreground",
        width: "25%",
      },
      2: {
        title: "Moderate",
        desc: "Working hard; needing consistent pacing to recover.",
        color: "bg-warning",
        bg: "bg-warning/10",
        text: "text-warning-foreground",
        width: "50%",
      },
      3: {
        title: "Severe",
        desc: "Sustained cognitive load exhausting somatic reserves.",
        color: "bg-primary",
        bg: "bg-primary-light",
        text: "text-primary-dark",
        width: "75%",
      },
      4: {
        title: "Red Alert",
        desc: "Critical depletion. Unviable work parameters.",
        color: "bg-destructive",
        bg: "bg-destructive/10",
        text: "text-destructive-foreground",
        width: "100%",
      },
    },
    boundaries: {
      1: {
        title: "Sovereign",
        desc: "Politely and firmly protecting schedules with absolute clarity.",
        color: "bg-success",
        bg: "bg-success/10",
        text: "text-success-foreground",
        width: "25%",
      },
      2: {
        title: "Vulnerable",
        desc: "Protecting some space, but saying yes under sudden social strain.",
        color: "bg-warning",
        bg: "bg-warning/10",
        text: "text-warning-foreground",
        width: "50%",
      },
      3: {
        title: "Compromised",
        desc: "Saying yes grudgingly. Quiet irritation accumulating internally.",
        color: "bg-primary",
        bg: "bg-primary-light",
        text: "text-primary-dark",
        width: "75%",
      },
      4: {
        title: "Broken Lines",
        desc: "Zero sovereignty. Operating as a shock absorber for other people's urgency.",
        color: "bg-destructive",
        bg: "bg-destructive/10",
        text: "text-destructive-foreground",
        width: "100%",
      },
    },
    peoplePleasing: {
      1: {
        title: "Autonomous",
        desc: "Motivated by standards, standards-anchored decisions.",
        color: "bg-success",
        bg: "bg-success/10",
        text: "text-success-foreground",
        width: "25%",
      },
      2: {
        title: "Keeping Peace",
        desc: "Accommodating non-essential favors to suppress relational friction.",
        color: "bg-warning",
        bg: "bg-warning/10",
        text: "text-warning-foreground",
        width: "50%",
      },
      3: {
        title: "Heavy Fawning",
        desc: "Trading energy and values for immediate feedback of approval.",
        color: "bg-primary",
        bg: "bg-primary-light",
        text: "text-primary-dark",
        width: "75%",
      },
      4: {
        title: "Identity Fused",
        desc: "Nervous system relies completely on being helpful to feel safe.",
        color: "bg-destructive",
        bg: "bg-destructive/10",
        text: "text-destructive-foreground",
        width: "100%",
      },
    },
    guilt: {
      1: {
        title: "Stillness Ease",
        desc: "Embracing absolute recovery as essential biological maintenance.",
        color: "bg-success",
        bg: "bg-success/10",
        text: "text-success-foreground",
        width: "25%",
      },
      2: {
        title: "Restless",
        desc: "Mild mental calculations of pending tasks contaminating rest.",
        color: "bg-warning",
        bg: "bg-warning/10",
        text: "text-warning-foreground",
        width: "50%",
      },
      3: {
        title: "Severe Guilt",
        desc: "Rest feels like laziness or failure; feeling a constant compulsion to act.",
        color: "bg-primary",
        bg: "bg-primary-light",
        text: "text-primary-dark",
        width: "75%",
      },
      4: {
        title: "Crisis Alarm",
        desc: "Sitting still triggers direct, visceral threats to your neural baseline.",
        color: "bg-destructive",
        bg: "bg-destructive/10",
        text: "text-destructive-foreground",
        width: "100%",
      },
    },
    sleep: {
      1: {
        title: "Restorative",
        desc: "Deep acoustic sleep. Waking with stable morning baseline.",
        color: "bg-success",
        bg: "bg-success/10",
        text: "text-success-foreground",
        width: "25%",
      },
      2: {
        title: "Lacking Guard",
        desc: "Falling asleep tired but waking early with active work calculations.",
        color: "bg-warning",
        bg: "bg-warning/10",
        text: "text-warning-foreground",
        width: "50%",
      },
      3: {
        title: "Highly Wired",
        desc: "Drifting off requires sleep aids or heavy decompression efforts.",
        color: "bg-primary",
        bg: "bg-primary-light",
        text: "text-primary-dark",
        width: "75%",
      },
      4: {
        title: "Insomnia Loop",
        desc: "Permanent state of neural hyperarousal. Exhausted but alert.",
        color: "bg-destructive",
        bg: "bg-destructive/10",
        text: "text-destructive-foreground",
        width: "100%",
      },
    },
    emotionalOverload: {
      1: {
        title: "Regulated",
        desc: "High visceral awareness and capacity to cycle through emotions.",
        color: "bg-success",
        bg: "bg-success/10",
        text: "text-success-foreground",
        width: "25%",
      },
      2: {
        title: "Simmering",
        desc: "Transient feelings of intense frustration and mild cynicism.",
        color: "bg-warning",
        bg: "bg-warning/10",
        text: "text-warning-foreground",
        width: "50%",
      },
      3: {
        title: "Severe Cynicism",
        desc: "Substantial irritability, holding an aggressive defensive guard.",
        color: "bg-primary",
        bg: "bg-primary-light",
        text: "text-primary-dark",
        width: "75%",
      },
      4: {
        title: "Mechanised Flat",
        desc: "Checked out. Living as a cold, disconnected, task-completing machine.",
        color: "bg-destructive",
        bg: "bg-destructive/10",
        text: "text-destructive-foreground",
        width: "100%",
      },
    },
    meaning: {
      1: {
        title: "Anchored",
        desc: "Deep alignment between day-to-day work and core internal values.",
        color: "bg-success",
        bg: "bg-success/10",
        text: "text-success-foreground",
        width: "25%",
      },
      2: {
        title: "Clouded",
        desc: 'Administrative overhead and noise is burying your authentic "why".',
        color: "bg-warning",
        bg: "bg-warning/10",
        text: "text-warning-foreground",
        width: "50%",
      },
      3: {
        title: "Pure Disconnect",
        desc: "Work represents survival and obligations only. Vision is gone.",
        color: "bg-primary",
        bg: "bg-primary-light",
        text: "text-primary-dark",
        width: "75%",
      },
      4: {
        title: "Crisis Void",
        desc: "Total existential vacuum. Unable to identify any meaningful activity.",
        color: "bg-destructive",
        bg: "bg-destructive/10",
        text: "text-destructive-foreground",
        width: "100%",
      },
    },
  };

  const defaultConf = {
    title: "Analyzing",
    desc: "Extracting patterns...",
    color: "bg-surface",
    bg: "bg-surface",
    text: "text-text-muted",
    width: "0%",
  };
  return details[key]?.[score] || defaultConf;
};

const FINGERPRINT_ENHANCEMENTS: Record<
  string,
  {
    insights: string[];
    recoveryStrategies: string[];
    boundaryStrategies: string[];
  }
> = {
  "Founder on Fire": {
    insights: [
      "Total integration of self-worth and business outcomes.",
      "Neural hyperarousal sustained by constant problem-solving.",
      "Inability to distinguish between a minor setback and an existential threat.",
    ],
    recoveryStrategies: [
      "Schedule forced 24-hour digital blackouts weekly.",
      "Engage in non-productive hobbies (e.g., walking without audio).",
      "Prioritise parasympathetic nervous system resets daily.",
    ],
    boundaryStrategies: [
      "Delegate operational noise immediately to trusted lieutenants.",
      "Implement a 'No weekend Slack' rule.",
      "Cease taking client or user feedback as a personal attack.",
    ],
  },
  "Over-Giver": {
    insights: [
      "Nervous system regulated by being 'helpful' to external parties.",
      "Chronic suppression of own needs to maintain peace.",
      "Accumulating heavy resentment disguised as exhaustion.",
    ],
    recoveryStrategies: [
      "Re-learn to sit with the discomfort of disappointing others.",
      "Schedule non-negotiable isolated recovery time.",
      "Practice self-soothing when guilt arises during rest.",
    ],
    boundaryStrategies: [
      "Script: 'Let me check my capacity' before ANY new commitment.",
      "Define 'Inaccessible Hours' and communicate them.",
      "Cease volunteering for structural gaps in other people's plans.",
    ],
  },
  "Silent Resenter": {
    insights: [
      "Lost connection to the 'why'. Operating entirely on obligation.",
      "Cynicism is acting as a biological shield against further demands.",
      "Screaming inside while smiling and complying on the outside.",
    ],
    recoveryStrategies: [
      "Drastic load shedding of non-essential commitments.",
      "Acknowledge the resentment as valid data, not a character flaw.",
      "Reconnect with values outside the current professional environment.",
    ],
    boundaryStrategies: [
      "Practice radical candour over quiet compliance.",
      "Stop buffering bad processes with your own free time.",
      "Define exactly what is 'not your job' and leave it undone.",
    ],
  },
  "Manager in the Middle": {
    insights: [
      "Caught in a permanent squeeze play between leadership and direct reports.",
      "Energy completely vaporized by mediation and emotional labor.",
      "Zero space to breathe or execute your own strategic work.",
    ],
    recoveryStrategies: [
      "Daily micro-recovery somatic pauses between back-to-back syncs.",
      "Stop absorbing the team's anxiety; let them fail safely.",
      "Refuse to be the perpetual shock-absorber for senior leadership targets.",
    ],
    boundaryStrategies: [
      "Rehearse boundary negotiation upwards (pushing back on timelines).",
      "Establish rigorous operational gates for your team's access to you.",
      "Mandate 'No Meeting' blocks explicitly for your own deep work.",
    ],
  },
  "High-Functioning Exhausted": {
    insights: [
      "Technically succeeding, but at a metabolic cost that is unviable.",
      "Engine screaming green and red-line simultaneously.",
      "Running on cortisol, grit, and structural anxiety.",
    ],
    recoveryStrategies: [
      "Institute mandatory 'boredom zones' to downregulate adrenaline.",
      "Transition from high-intensity recovery (e.g. HIIT) to stability efforts.",
      "Hard cutoff on evening screen exposure.",
    ],
    boundaryStrategies: [
      "Stop doing 120% when 85% meets the operational objective.",
      "Decline 4 PM meetings that threaten your evening wind-down.",
      "Force trade-offs when someone adds scope: 'I can do X, but I will drop Y.'",
    ],
  },
};

interface PlanAction {
  id: string;
  text: string;
  points: number;
}

interface PlanBoundary {
  id: string;
  situation: string;
  script: string;
}

interface PlanPrompt {
  id: string;
  question: string;
}

const PERSONALIZED_RECOVERY_PLANS: Record<
  string,
  {
    recommendedActions: PlanAction[];
    boundaryStrategies: PlanBoundary[];
    reflectionPrompts: PlanPrompt[];
  }
> = {
  "High-Functioning Exhausted": {
    recommendedActions: [
      { id: "hfe-1", text: "Schedule a non-negotiable 30-minute 'boredom zone' in your continuous afternoon block.", points: 40 },
      { id: "hfe-2", text: "Complete separation from electronic screens starting at 9:00 PM tonight.", points: 50 },
      { id: "hfe-3", text: "Perform a 60-second somatic reset or deep physiological sigh between major meetings.", points: 30 }
    ],
    boundaryStrategies: [
      { id: "hfee-1", situation: "When asked to attend a late-afternoon progress update", script: "I have a hard cutoff at 5 PM today. Let me review the notes async or we can touch base tomorrow morning." },
      { id: "hfee-2", situation: "When requested to take on an extra high-priority project", script: "I can take this on, but to maintain quality, we need to defer either X or Y task. Which one should we deprioritize?" }
    ],
    reflectionPrompts: [
      { id: "hfeq-1", question: "What is the metabolic price am I paying for maintaining 120% output when 85% meets the operational objective?" },
      { id: "hfeq-2", question: "If I was forced to delegate or automate one critical task today without telling anyone why, what would it be?" }
    ]
  },
  "Founder on Fire": {
    recommendedActions: [
      { id: "fof-1", text: "Institute an absolute 3-hour digital blackout block during daylight hours.", points: 40 },
      { id: "fof-2", text: "Delegate two minor operational or admin decisions completely to a trusted lieutenant.", points: 50 },
      { id: "fof-3", text: "Perform a progressive muscle relaxation checklist for 3 minutes.", points: 30 }
    ],
    boundaryStrategies: [
      { id: "foff-1", situation: "When matching a team member sending sudden, out-of-hours messages", script: "I am offline until tomorrow morning. If this is an absolute emergency, call my phone. Otherwise, let's sync tomorrow." },
      { id: "foff-2", situation: "When tempted to intervene in operational details your team is handling", script: "I trust my team to navigate this problem. I am intentionally staying out of the loop until they request feedback." }
    ],
    reflectionPrompts: [
      { id: "fofq-1", question: "How much of my personal identity and self-worth is dangerously fused with the hourly variations of business outcomes?" },
      { id: "fofq-2", question: "What is the worst-case scenario if I shut down all systems for 24 hours? Is it actually catastrophic, or is it a control illusion?" }
    ]
  },
  "Over-Giver": {
    recommendedActions: [
      { id: "og-1", text: "Practice saying 'No' to one unsolicited help invitation or project vacuum.", points: 40 },
      { id: "og-2", text: "Schedule 45 minutes of isolated, solitary recovery with zero social engagement.", points: 50 },
      { id: "og-3", text: "Reframe guilt as physiological evidence of healing when transitioning into resting state.", points: 30 }
    ],
    boundaryStrategies: [
      { id: "ogg-1", situation: "When asked to take on someone else's unfinished workload", script: "I understand that is in a difficult space, but my capacity is fully committed. I won't be able to step in this time." },
      { id: "ogg-2", situation: "When asked to attend a meeting where you have no direct contribution", script: "Since my responsibilities aren't key here, I'll drop off to focus on core delivery. Let me know if action items arise." }
    ],
    reflectionPrompts: [
      { id: "ogq-1", question: "Am I using being 'constantly helpful' as a sub-conscious tool to regulate my own anxiety and seek validation?" },
      { id: "ogq-2", question: "Where is my silent resentment currently building because I refused to disappoint someone else?" }
    ]
  },
  "Silent Resenter": {
    recommendedActions: [
      { id: "sr-1", text: "Identify one task that is 'not your job' and leave it undone, observing the outcome.", points: 40 },
      { id: "sr-2", text: "Practice radical candour by expressing one frustration directly and constructively.", points: 50 },
      { id: "sr-3", text: "Do a primary values audit to identify where your daily work diverges from your core values.", points: 30 }
    ],
    boundaryStrategies: [
      { id: "srr-1", situation: "When requested to work past contracted hours because of poor processes", script: "I want to support the team, but I cannot extend my hours to buffer systemic bottlenecks. Let's arrange a process review." },
      { id: "srr-2", situation: "When receiving a last-minute request that disrupts your planned delivery", script: "To deliver this on time, we will need to adjust the delivery dates of my other commitments. Let me know what to reschedule." }
    ],
    reflectionPrompts: [
      { id: "srq-1", question: "Is my corporate cynicism functioning as a necessary, survivalist shield to prevent further metabolic exploitation?" },
      { id: "srq-2", question: "What is the specific, unmet need that I am currently screaming inside about but failing to communicate?" }
    ]
  },
  "Manager in the Middle": {
    recommendedActions: [
      { id: "mim-1", text: "Cancel or postpone one non-essential team synchronization meeting this week.", points: 40 },
      { id: "mim-2", text: "Delegate a status-update dashboard completely to a senior direct report.", points: 50 },
      { id: "mim-3", text: "Add a 15-minute 'no meetings' buffer zone block inside your shared Outlook calendar.", points: 30 }
    ],
    boundaryStrategies: [
      { id: "mimm-1", situation: "When senior leadership sets high-pressure targets without capacity support", script: "With our current staffing levels, we can either hit target A with high confidence, or distribute capacity over all three. Which do we prioritize?" },
      { id: "mimm-2", situation: "When team members request constant direct assistance on basic problems", script: "I want to empower you here. Spend 20 minutes framing the three potential solutions, and we'll review them during our weekly 1:1." }
    ],
    reflectionPrompts: [
      { id: "mimq-1", question: "Am I acting as an emotional shock-absorber for senior leadership targets at the expense of my own physical stability?" },
      { id: "mimq-2", question: "How would my management style change if I allowed my team to navigate setbacks rather than constantly buffering them?" }
    ]
  }
};

export const ResultView = ({
  result,
  onRestart,
  onPlanStart,
  onAwardPoints,
}: {
  result: BurnoutFingerprint;
  onRestart: () => void;
  onPlanStart: () => void;
  onAwardPoints?: (amount: number, reason: string) => void;
}) => {
  const enhancements =
    FINGERPRINT_ENHANCEMENTS[result.profile] ||
    FINGERPRINT_ENHANCEMENTS["High-Functioning Exhausted"];

  // Local state for completed actions, committed scripts and written reflections
  const [completedActions, setCompletedActions] = useState<string[]>(() => {
    return JSON.parse(localStorage.getItem("blaze_completed_rec_actions") || "[]");
  });
  const [committedBoundaries, setCommittedBoundaries] = useState<string[]>(() => {
    return JSON.parse(localStorage.getItem("blaze_committed_rec_boundaries") || "[]");
  });
  const [copiedScriptId, setCopiedScriptId] = useState<string | null>(null);
  const [reflections, setReflections] = useState<Record<string, string>>(() => {
    return JSON.parse(localStorage.getItem(`blaze_reflections_${result.profile}`) || "{}");
  });
  const [reflectionStatus, setReflectionStatus] = useState<Record<string, string>>({});

  const handleToggleAction = (actionId: string, points: number) => {
    if (completedActions.includes(actionId)) return; // No duplicate scoring
    const next = [...completedActions, actionId];
    setCompletedActions(next);
    localStorage.setItem("blaze_completed_rec_actions", JSON.stringify(next));
    if (onAwardPoints) {
      onAwardPoints(points, `Completed Action: ${result.profile}`);
    }
  };

  const handleCommitBoundary = (boundaryId: string) => {
    if (committedBoundaries.includes(boundaryId)) return;
    const next = [...committedBoundaries, boundaryId];
    setCommittedBoundaries(next);
    localStorage.setItem("blaze_committed_rec_boundaries", JSON.stringify(next));
    if (onAwardPoints) {
      onAwardPoints(25, `Committed Script: ${result.profile}`);
    }
  };

  const handleCopy = (boundaryId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScriptId(boundaryId);
    setTimeout(() => setCopiedScriptId(null), 2000);
  };

  const handleSaveReflection = (promptId: string) => {
    const text = reflections[promptId] || "";
    if (text.trim().length < 10) {
      setReflectionStatus(prev => ({ ...prev, [promptId]: "Too short (min 10 chars)" }));
      return;
    }
    
    const nextReflections = { ...reflections, [promptId]: text };
    setReflections(nextReflections);
    localStorage.setItem(`blaze_reflections_${result.profile}`, JSON.stringify(nextReflections));
    
    const alreadyAwarded = JSON.parse(localStorage.getItem(`blaze_awarded_reflections_${result.profile}`) || "[]");
    if (!alreadyAwarded.includes(promptId)) {
      alreadyAwarded.push(promptId);
      localStorage.setItem(`blaze_awarded_reflections_${result.profile}`, JSON.stringify(alreadyAwarded));
      if (onAwardPoints) {
        onAwardPoints(50, `Completed Reflection Diary: ${result.profile}`);
      }
    }
    
    setReflectionStatus(prev => ({ ...prev, [promptId]: "✓ Saved & Transmitted" }));
    setTimeout(() => {
      setReflectionStatus(prev => {
        const updated = { ...prev };
        delete updated[promptId];
        return updated;
      });
    }, 3000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-12 px-4">
      {/* Archetype Card */}
      <div className="text-center space-y-6 bg-gradient-to-b from-slate-50 to-white/0 p-8 rounded-3xl border border-border shadow-sm">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary-light text-primary rounded-lg text-xs uppercase tracking-widest font-black">
          <User className="w-3 h-3" /> Burnout Fingerprint Assigned
        </span>
        <h1 className="text-5xl font-light text-text-main tracking-tight">
          {result.profile}
        </h1>
        <p className="text-xl text-text-muted max-w-2xl mx-auto leading-relaxed font-serif italic text-balance">
          "{result.description}"
        </p>
      </div>

      {/* Nova AI Coach Assessment Briefing */}
      <div className="bg-card text-text-main rounded-3xl p-8 border border-border shadow-xl relative overflow-hidden group">
        <div className="absolute right-[-10%] top-[-10%] w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-xs uppercase tracking-widest font-black text-primary">
              Nova AI Analysis Briefing
            </span>
          </div>
          <h3 className="text-2xl font-light">Direct Pattern Diagnosis</h3>
          <p className="font-serif text-lg leading-relaxed text-text-muted italic">
            "
            {result.analysis ||
              `Based on your feedback, you are trying to rationalise a structural energy deficit that is biologically unviable. Your metric pattern shows that your baseline stability is leaking through depleted emotional boundaries and hyperarousal loops.`}
            "
          </p>
          <div className="text-xs text-text-muted uppercase tracking-widest font-black">
            - Provocative Performance Coach, Nova
          </div>
        </div>
      </div>

      {/* Energy Leaks Scoring Breakdown */}
      {result.scores && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-xl font-light text-text-main">
              Your Energy Leaks Metric
            </h3>
            <span className="text-xs text-text-muted font-bold uppercase tracking-widest">
              Scale: 1 (Safe) to 4 (Red Alert)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {leakKeys.map(({ key, label, icon: IconComponent }) => {
              const score = result.scores ? result.scores[key] : 2;
              const conf = getLeakDetails(key, score);
              return (
                <div
                  key={key}
                  className="p-6 bg-white rounded-2xl border border-border shadow-sm space-y-4 hover:border-border transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-surface dark:bg-card rounded-xl text-text-muted">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-medium text-text-main text-sm leading-none">
                          {label}
                        </h4>
                        <span className="text-xs text-text-muted uppercase font-black tracking-wider">
                          Level {score} of 4
                        </span>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${conf.bg} ${conf.text}`}
                    >
                      {conf.title}
                    </span>
                  </div>

                  {/* Meter Track */}
                  <div className="relative">
                    <div className="h-2.5 bg-surface dark:bg-card rounded-full w-full overflow-hidden">
                      <motion.div
                        className={`h-full ${conf.color}`}
                        initial={{ width: 0 }}
                        animate={{ width: conf.width }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-text-muted uppercase tracking-widest mt-1.5">
                      <span>Safe</span>
                      <span>Mod</span>
                      <span>Severe</span>
                      <span>Crisis</span>
                    </div>
                  </div>

                  <p className="text-xs text-text-muted leading-normal italic">
                    {conf.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Burnout Breakdown Map (Enhanced Insights) */}
      <div className="space-y-6 bg-surface dark:bg-card border border-border rounded-3xl p-8 shadow-sm">
        <h3 className="text-2xl font-display font-bold text-text-main border-b border-border pb-4 flex items-center gap-3">
          <Compass className="w-6 h-6 text-primary" /> Burnout Breakdown Map
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
          {/* Insights */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs">
              <Activity className="w-4 h-4" /> Root Causes
            </div>
            <ul className="space-y-3">
              {enhancements.insights.map((insight, idx) => (
                <li
                  key={idx}
                  className="flex gap-3 text-sm text-text-muted font-medium"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recovery Strategies */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success font-bold uppercase tracking-widest text-xs">
              <Moon className="w-4 h-4" /> Recovery Tactics
            </div>
            <ul className="space-y-3">
              {enhancements.recoveryStrategies.map((strat, idx) => (
                <li
                  key={idx}
                  className="flex gap-3 text-sm text-text-muted font-medium"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-success mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{strat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Boundary Strategies */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-warning font-bold uppercase tracking-widest text-xs">
              <ShieldCheck className="w-4 h-4" /> Boundary Scripts
            </div>
            <ul className="space-y-3">
              {enhancements.boundaryStrategies.map((strat, idx) => (
                <li
                  key={idx}
                  className="flex gap-3 text-sm text-text-muted font-medium"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{strat}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Interactive Personalized Recovery Plan */}
      <div className="card space-y-8 border-primary/30 shadow-xl shadow-primary/5 bg-card text-text-main relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl opacity-30 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-success/5 rounded-full blur-3xl opacity-20 pointer-events-none" />
        
        <div className="relative z-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-lg shadow-primary/30">
                <BookOpen className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-2xl font-display font-bold tracking-tight text-text-main">Personalized Recovery Plan</h3>
                <p className="text-xs text-text-muted uppercase tracking-wider font-extrabold text-primary dark:text-primary-light">Nova Curated • Profile: {result.profile}</p>
              </div>
            </div>
            <div className="text-sm bg-surface dark:bg-surface/50 border border-border px-3 py-1 rounded-full text-text-muted font-bold">
              Complete tasks below to earn recovery XP
            </div>
          </div>

          <p className="text-sm text-text-muted leading-relaxed font-medium">
            Based on your diagnostics, Nova has synthesized an actionable recovery protocol. 
            Commit to the items below daily to build boundary muscle memory, claim rewards, and recover high baseline energy.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-4">
            {/* Recommended Actions */}
            <div className="space-y-4 bg-surface dark:bg-surface/30 border border-border p-5 rounded-2xl flex flex-col">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold uppercase tracking-widest text-xs border-b border-border pb-2 mb-2">
                <CheckCircle2 className="w-4 h-4" /> Recommended Actions
              </div>
              <p className="text-[11px] text-text-muted italic mb-2">Toggle to complete actions and claim recovery points.</p>
              <div className="space-y-3 flex-grow">
                {((PERSONALIZED_RECOVERY_PLANS[result.profile] || PERSONALIZED_RECOVERY_PLANS["High-Functioning Exhausted"]).recommendedActions).map((action) => {
                  const isDone = completedActions.includes(action.id);
                  return (
                    <div 
                      key={action.id}
                      onClick={() => handleToggleAction(action.id, action.points)}
                      className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${
                        isDone 
                          ? 'bg-success/15 border-success/50 text-success-foreground dark:text-success/20' 
                          : 'bg-card border-border hover:bg-surface text-text-main'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-all ${
                        isDone 
                          ? 'bg-success border-success text-white' 
                          : 'border-border text-transparent'
                      }`}>
                        <Check className="w-3.5 h-3.5 stroke-[4px]" />
                      </div>
                      <div className="space-y-1">
                        <p className={`text-xs font-semibold leading-normal ${isDone ? 'line-through text-text-muted opacity-60' : ''}`}>{action.text}</p>
                        <span className={`text-[10px] font-black tracking-widest uppercase ${isDone ? 'text-success dark:text-success' : 'text-primary'}`}>
                          {isDone ? 'Completed (+XP)' : `+${action.points} XP`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Boundary Strategies */}
            <div className="space-y-4 bg-surface dark:bg-surface/30 border border-border p-5 rounded-2xl flex flex-col">
              <div className="flex items-center gap-2 text-warning dark:text-warning font-bold uppercase tracking-widest text-xs border-b border-border pb-2 mb-2">
                <ShieldCheck className="w-4 h-4" /> Boundary Scripts
              </div>
              <p className="text-[11px] text-text-muted italic mb-2">Practice using these highly professional, firm pushback scripts.</p>
              <div className="space-y-3 flex-grow">
                {((PERSONALIZED_RECOVERY_PLANS[result.profile] || PERSONALIZED_RECOVERY_PLANS["High-Functioning Exhausted"]).boundaryStrategies).map((scrip) => {
                  const isCommitted = committedBoundaries.includes(scrip.id);
                  const isCopied = copiedScriptId === scrip.id;
                  return (
                    <div key={scrip.id} className="p-3 bg-card border border-border rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider font-extrabold text-warning dark:text-warning leading-tight block truncate max-w-[150px]">{scrip.situation}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCopy(scrip.id, scrip.script)}
                            className="text-text-muted hover:text-text-main p-1 rounded hover:bg-surface transition-all cursor-pointer"
                            title="Copy script to clipboard"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-text-main leading-relaxed font-serif italic bg-surface dark:bg-surface/50 p-2.5 rounded border border-border">"{scrip.script}"</p>
                      <button
                        onClick={() => handleCommitBoundary(scrip.id)}
                        disabled={isCommitted}
                        className={`w-full py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer ${
                          isCommitted 
                            ? 'bg-success/20 text-success-foreground dark:text-success/40 border border-success/30' 
                            : 'bg-primary hover:bg-primary-dark text-primary-foreground font-black shadow-lg shadow-primary/15'
                        }`}
                      >
                        {isCommitted ? '✓ Committed to Boundaries' : 'Commit & Rehearse (+25 XP)'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reflection Prompts */}
            <div className="space-y-4 bg-surface dark:bg-surface/30 border border-border p-5 rounded-2xl flex flex-col">
              <div className="flex items-center gap-2 text-success dark:text-teal-400 font-bold uppercase tracking-widest text-xs border-b border-border pb-2 mb-2">
                <Sparkles className="w-4 h-4" /> Reflection Journal
              </div>
              <p className="text-[11px] text-text-muted italic mb-2">Synthesize your triggers. Nova analyzes completed entries.</p>
              <div className="space-y-3 flex-grow">
                {((PERSONALIZED_RECOVERY_PLANS[result.profile] || PERSONALIZED_RECOVERY_PLANS["High-Functioning Exhausted"]).reflectionPrompts).map((prompt) => (
                  <div key={prompt.id} className="p-3 bg-card border border-border rounded-xl space-y-2">
                    <label className="text-xs font-bold leading-tight block text-text-main">{prompt.question}</label>
                    <textarea
                      placeholder="Type your reflection here (min 10 characters)..."
                      value={reflections[prompt.id] || ""}
                      onChange={(e) => setReflections(prev => ({ ...prev, [prompt.id]: e.target.value }))}
                      rows={3}
                      className="w-full bg-surface dark:bg-surface/50 border border-border rounded-lg p-2 text-xs text-text-main placeholder-text-muted/40 focus:outline-none focus:border-primary/50 resize-none font-normal"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-text-muted italic font-medium leading-none">
                        {reflectionStatus[prompt.id] || ""}
                      </span>
                      <button
                        onClick={() => handleSaveReflection(prompt.id)}
                        className="bg-primary hover:bg-primary-dark text-primary-foreground font-black text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all cursor-pointer shrink-0"
                      >
                        Save Entry (+50 XP)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Energy Budget Navigation */}
      <div className="card bg-surface dark:bg-card p-8 border border-border rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1">
          <h4 className="text-lg font-bold text-text-main">
            Next Step: Pillar 2 (Rebuild Energy)
          </h4>
          <p className="text-text-muted text-sm italic">
            Nova has mapped this diagnostics profile to a baseline daily Energy
            Budget.
          </p>
        </div>
        <button
          onClick={onPlanStart}
          className="bg-primary hover:bg-primary/95 text-primary-foreground px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest text-xs shadow-md shadow-primary/20 hover:scale-[1.03] transition-all flex items-center gap-3 cursor-pointer"
        >
          Begin Energy Budget Builder <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={onRestart}
        className="mx-auto block text-text-muted text-xs uppercase tracking-widest font-black hover:text-text-muted transition-colors cursor-pointer"
      >
        Retake Diagnostic Assessment
      </button>
    </div>
  );
};
