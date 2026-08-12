import { auth, db } from '../lib/firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useState, useEffect } from 'react';
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
  Trophy,
  Loader2,
  Target,
  Zap,
  Wand2,
  Copy,
  Users,
  Network
} from 'lucide-react';
import { NovaChat } from './NovaChat';
import { cn } from '../lib/utils';

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
        script: "I'm excited to take on these [Senior Tasks]. To do this effectively, I'd like to formalize this transition. Can we look at the promotion criteria this week so we're aligned on the roadmap for my new role?",
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
        situation: 'You realize a project cannot be completed without more resources.',
        script: "I've mapped the critical path for this delivery. To hit the current deadline without compromising quality, we need an additional analyst for 15 hours a week. Otherwise, we will need to adjust the operational timeline by two weeks.",
        advice: 'Present the problem as a math equation (resources versus timeline), not an emotional appeal.'
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
        advice: 'Never apologize for having a weekend. You are a high-value resource; resources need maintenance.'
      },
      {
        id: 'discount-ask',
        title: 'The "Quick Favor" Ask',
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
        title: 'Emotional Labor Check',
        situation: 'Being the "emotional rock" for family while depleted.',
        script: "I really want to be there for you, but I don't have the emotional capacity right now to give this the attention it deserves. Can we talk about this tomorrow after I've had some rest?",
        advice: "Setting boundaries with family is the hardest. Use the 'quality' argument: 'I want to be a good listener, and I can't be one right now.'"
      }
    ]
  }
];

export const BoundaryRehearsal = ({ onAwardPoints, onRehearsalComplete }: { onAwardPoints: (amount: number, reason: string) => void, onRehearsalComplete: () => void }) => {
  const [selected, setSelected] = useState<Script | null>(null);
  const [activeCategory, setActiveCategory] = useState(scriptGroups[0].category);
  const [isPractising, setIsPractising] = useState(false);
  const [mode, setMode] = useState<'library' | 'generator'>('library');

  const [generatorInput, setGeneratorInput] = useState('');
  const [generatingScripts, setGeneratingScripts] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<'polite' | 'data' | 'direct'>('polite');

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
  useEffect(() => { fetchSavedScripts(); }, [uid]);

  const getParsedCustomScript = () => {
    if (!generatedResult) return { script: '', advice: '' };
    const parts = generatedResult.split(/###\s*(?:Script|Behavioral Strategy)/gi);
    const script = parts[1]?.trim() || generatedResult;
    const advice = parts[2]?.trim() || "Nova recommends holding this line high and matching with visual boundaries.";
    return { script, advice };
  };

  const handleGenerateScrips = async () => {
    if (!generatorInput.trim()) return;
    setGeneratingScripts(true);
    setGeneratedResult(null);
    
    try {
      const toneLabels = {
        polite: 'Polite but Firm (Fawners recovering)',
        data: 'Data-driven Trade-off (Logical parameters)',
        direct: 'Direct No (Absolute boundary protection)'
      };

      const response = await secureApiFetch('/api/nova/chat', {
        method: 'POST',
        data: {
          message: `The user has received this demand/situation: "${generatorInput}". 
          Generate a tailored, professional, zero-apology pushback script in the following tone: "${toneLabels[selectedTone]}".
          
          Format your response exactly like this:
          ### Script
          [Input the customized script here. Make it professional, confident, and direct. Avoid any apologies like "I'm sorry" or "pardon".]
          
          ### Behavioral Strategy
          [Input tactical advice on why this works, specifically tailored for a high achiever, and how it protects their energy budget.]`,
          systemInstruction: `You are Nova, the High-Performance Recovery Coach. Provide a copy-paste ready tactical script and custom behavioral strategy. No fluff, no introductory chatter.`
        }
      });
      const data = await response.json();
      setGeneratedResult(data.text);
      onAwardPoints(20, "Generated Custom Boundary Script");

      // Persist so this generation survives a refresh and shows up in
      // Recent Custom Scripts below - reuses the same boundary_scripts
      // collection and schema ConnectedBoundaryScripts already reads from.
      if (uid) {
        try {
          const { script } = (() => {
            const parts = data.text.split(/###\s*(?:Script|Behavioral Strategy)/gi);
            return { script: parts[1]?.trim() || data.text };
          })();
          const id = Date.now().toString();
          await setDoc(doc(db, 'users', uid, 'boundary_scripts', id), {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            title: generatorInput.slice(0, 80),
            scenarioType: 'workload',
            scriptText: script.slice(0, 500),
            status: 'saved',
          });
          fetchSavedScripts();
        } catch (e) {
          // Non-critical - the generated script is still shown and usable
          // for practice even if saving it to history fails.
        }
      }
    } catch (e) {
      setGeneratedResult("### Script\nI have received your request. Let me check my capacity and I will outline the trade-offs required to take this on.\n\n### Behavioral Strategy\nThis delays commitment, giving your cognitive load time to level out.");
    } finally {
      setGeneratingScripts(false);
    }
  };

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
    setShowCritique(false);
    setFinalCritique(null);
    setDetailedFeedback(null);
    onAwardPoints(50, "Boundary Rehearsal");
    onRehearsalComplete();
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
          message: "The rehearsal is complete. Give me a 2-sentence final critique of my performance. Did I apologize too much? Was I firm?",
          systemInstruction: "You are Nova. Provide a concise, tough, direct critique of the user's boundary setting rehearsal."
        }
      });
      const data = await response.json();
      setFinalCritique(data.text);
    } catch(e) {
      setFinalCritique("Rehearsal audio processed. You held the line well, but ensure your body language matches the words next time.");
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
                  <h2 className="text-2xl lg:text-3xl font-display font-medium text-text-main tracking-tight">Boundary Rehearsal</h2>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs font-medium uppercase tracking-widest text-primary flex items-center gap-1.5"><Network className="w-3 h-3" /> Core Pillar: Practice</span>
                  </div>
                </div>
                <div className="mt-4 md:mt-0 flex bg-surface border border-border rounded-lg p-1">
                  <button
                    onClick={() => setMode('library')}
                    className={cn("px-5 py-2.5 rounded-md text-xs font-medium uppercase tracking-widest transition-colors", mode === 'library' ? "bg-card text-text-main" : "text-text-muted hover:text-text-main")}
                  >
                    Library
                  </button>
                  <button
                    onClick={() => setMode('generator')}
                    className={cn("px-5 py-2.5 rounded-md text-xs font-medium uppercase tracking-widest transition-colors", mode === 'generator' ? "bg-card text-text-main" : "text-text-muted hover:text-text-main")}
                  >
                    Custom Generator
                  </button>
                </div>
             </div>
          </div>
          <p className="text-sm lg:text-base text-text-muted font-serif italic leading-relaxed max-w-2xl border-l-2 border-primary/30 pl-5 py-1">
            "Master the 'Firm No' and the 'Strategic Yes'. Practical scripts for high-stakes moments. Stop apologizing for protecting your own time."
          </p>
        </div>
      </div>

      {mode === 'generator' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 max-w-none space-y-6">
            <div className="card bg-card border border-border p-8 space-y-6 relative overflow-hidden group">
              <div className="relative z-10 space-y-3 border-b border-border pb-5">
                <h4 className="text-lg font-bold text-text-main flex items-center gap-2 tracking-tight">
                  <Wand2 className="w-5 h-5 text-primary" /> Script Builder
                </h4>
                <p className="text-xs text-text-muted leading-relaxed font-medium">
                  Received an unreasonable demand on Slack or Email? Don't panic and say yes. Paste it here, and Nova will draft a confident, zero-apology script.
                </p>
              </div>

              <div className="relative z-10 space-y-5">
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-widest text-text-muted ml-1 mb-2 block">The Incoming Demand</label>
                  <textarea
                    value={generatorInput}
                    onChange={(e) => setGeneratorInput(e.target.value)}
                    placeholder='e.g. "Can you quickly throw together a 10-slide deck for the board meeting tomorrow morning?"'
                    className="w-full h-32 bg-background border border-border rounded-lg p-4 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 resize-none transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1 mb-2 block">Select Compilation Tone</label>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { id: 'polite', label: 'Polite but Firm' },
                      { id: 'data', label: 'Data Trade-off' },
                      { id: 'direct', label: 'Direct No' }
                    ].map((tone) => (
                      <button
                        key={tone.id}
                        onClick={() => setSelectedTone(tone.id as any)}
                        className={cn(
                          "py-3 px-4 text-left rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer",
                          selectedTone === tone.id
                            ? "border-primary bg-primary/10 text-primary shadow-inner"
                            : "border-border bg-background text-text-muted hover:border-muted-foreground hover:text-text-muted"
                        )}
                      >
                        {tone.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleGenerateScrips}
                    disabled={!generatorInput.trim() || generatingScripts}
                    className="w-full bg-primary hover:opacity-90 text-primary-foreground py-4 rounded-lg text-xs font-medium uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40 disabled:grayscale"
                  >
                    {generatingScripts ? <><Loader2 className="w-4 h-4 animate-spin" /> Drafting your script...</> : <><Sparkles className="w-4 h-4" /> Generate Pushback Script</>}
                  </button>
                </div>
              </div>
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

          <div className="lg:col-span-8 space-y-6">
            <h4 className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" /> Generated Response
            </h4>

            {!generatedResult && !generatingScripts ? (
              <div className="h-[400px] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-text-muted p-8 text-center bg-surface">
                <ShieldAlert className="w-8 h-8 mb-4 opacity-20" />
                <p className="text-xs font-medium max-w-sm">Scripts will populate here. Choose the tone that matches the political capital you want to spend.</p>
              </div>
            ) : generatingScripts ? (
              <div className="h-[400px] rounded-xl border border-primary/20 bg-primary/5 flex flex-col items-center justify-center text-primary relative overflow-hidden">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p className="text-xs font-medium uppercase tracking-widest">Nova is drafting your script...</p>
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
                        <h3 className="text-success font-bold text-xs uppercase tracking-widest mt-6 mb-3 border-b border-border pb-2" {...props} />
                      ),
                      p: ({node, ...props}) => (
                        <div className="relative group mb-6">
                          <p className="bg-surface p-5 rounded-lg border border-border text-text-muted pr-12 leading-relaxed" {...props} />
                          <button
                            onClick={(e) => {
                              const text = (e.currentTarget.previousElementSibling as HTMLElement)?.innerText;
                              if (text) copyToClipboard(text);
                            }}
                            className="absolute right-4 top-4 p-2 bg-card rounded-lg border border-border text-text-muted hover:text-success opacity-0 group-hover:opacity-100 transition-all focus:outline-none"
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

                  <div className="mt-8 pt-6 border-t border-border flex justify-end">
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
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded bg-primary/10 border border-primary/20 text-[11px] font-medium uppercase tracking-widest text-primary">
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
                       <span className="text-[11px] font-medium uppercase tracking-widest block text-primary mb-1">Nova's Suggestion</span>
                       <span className="text-xs text-primary font-medium leading-relaxed">{selected?.advice}</span>
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
                      systemInstruction={`You are Nova, an AI recovery coach. Help the user practice setting boundaries for this specific scenario: "${selected?.situation}". 
                      The user wants to use this script: "${selected?.script}".
                      ROLEPLAY: You are the manager, client, or family member. BE TOUGH. Push back slightly. Ask 'Why?' or 'Can't you just squeeze it in?'.
                      CRITIQUE: After they reply, give them a one-sentence critique if they apologized or sounded weak.
                      GOAL: Help them deliver the line with zero apology and maximum professionalism. Executive tone.`}
                      initialMessage={`"Alright, let's practice. I'll play the other side of this conversation and push back a little — that's the point. Here goes: 'Hey, I know you're at capacity, but I really need this handled by tonight. Can you just make it happen?'"`}
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
                        <span className="text-[11px] uppercase font-medium tracking-widest text-primary">Nova Insight</span>
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
                             <Zap className="w-5 h-5 text-success" />
                             <span className="text-xs font-medium uppercase tracking-widest text-success/80">A closer look</span>
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
                      
                      <div className="p-6 bg-success/10 rounded-2xl border border-success/20 space-y-3">
                         <div className="flex items-center gap-3">
                           <Trophy className="w-5 h-5 text-success" />
                           <span className="text-xs font-black uppercase tracking-widest text-success">Parameter Locked</span>
                         </div>
                         <p className="text-sm text-success font-medium">"You’ve successfully identified the leak in this interaction. Consistency is your next move."</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-border bg-background relative z-10">
                  <button 
                     onClick={() => setIsPractising(false)}
                     className="w-full bg-surface dark:bg-card text-text-main py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-border transition-colors shadow-lg"
                  >
                    Return to Lab
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};
