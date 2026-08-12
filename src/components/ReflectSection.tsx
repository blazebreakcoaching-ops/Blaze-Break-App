import { auth, db } from '../lib/firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Book, CheckCircle2, ChevronRight, Sparkles, Zap, ArrowRight, BookOpen, Activity, LayoutTemplate, Brain, AlertTriangle, TrendingUp, X, Clock, HelpCircle, Loader2 } from 'lucide-react';
import { NovaChat } from './NovaChat';
import { DailyVoiceJournal } from './DailyVoiceJournal.tsx';
import { cn } from '../lib/utils';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, BarChart, Bar, Cell, Legend } from 'recharts';

interface Chapter {
  id: string;
  title: string;
  snippet: string;
  content: string;
  actions: { label: string; text: string; type: 'energy' | 'boundary' | 'mindset' }[];
}

const calculateCorrelation = (data: any[]) => {
  if (data.length < 2) return 0;
  const n = data.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  
  for (let i = 0; i < n; i++) {
    const x = data[i].severity;
    const y = data[i].energyLevel;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }
  
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (den === 0) return 0;
  return Number((num / den).toFixed(2));
};

const getNovaAssessment = (text: string, severity: number) => {
  const lower = text.toLowerCase();
  if (severity >= 8) {
    if (lower.includes("slack") || lower.includes("email") || lower.includes("message")) {
      return "It looks like work is spilling into your evenings. Consider turning off notifications after 7 PM to protect your downtime.";
    }
    if (lower.includes("meeting") || lower.includes("sync") || lower.includes("huddle")) {
      return "Meeting fatigue seems high right now. Consider declining status meetings that don't have an agenda, and try the 'Capacity Overflow' boundary script.";
    }
    if (lower.includes("overnight") || lower.includes("weekend") || lower.includes("night") || lower.includes("lunch")) {
      return "Nova Relapse Alert: Sacrificing somatic biological repairs. Unchecked performance-identity will drive immediate system failure. Hard stop scheduled.";
    }
    return `This feels really heavy. Consider reaching out through Guardian Relay for extra support.`;
  } else {
    if (lower.includes("breathing") || lower.includes("walk") || lower.includes("water") || lower.includes("hydration")) {
      return "Nova Calibration: Micro-recovery anchor detected. Proactive baseline stability prevents sudden operational drop-offs.";
    }
    return `Nova Coaching Alert: Medium capacity load. Keep track of subsequent triggers. Do not allow minor leaks to accumulate into a cumulative burn crisis.`;
  }
};

const chapters: Chapter[] = [
  { 
    id: '1', 
    title: 'The Ambition Paradox', 
    snippet: 'Why the more you "do", the less you "are".', 
    content: `High achievers don't burn out because they're weak; they burn out because they're too strong. Your ability to override your body's signals is a superpower that has become a bug. The paradox of ambition is that to achieve more over a 10-year horizon, you must achieve intentionally less over a 24-hour horizon.`,
    actions: [
      { label: 'Energy Action', text: 'Reduce tomorrow\'s Executive budget by 20%', type: 'energy' },
      { label: 'Boundary Script', text: 'The "Capacity Overflow" block', type: 'boundary' },
      { label: 'Core Reflection', text: 'What is the one task I\'m doing just to feel busy?', type: 'mindset' }
    ]
  },
  { 
    id: '2', 
    title: 'The Guilt Translator', 
    snippet: 'Turning "I should be working" into "I am recovering".', 
    content: `That gnawing feeling when you sit on the couch isn't "laziness"—it's a neurological withdrawal from dopamine-seeking behavior. Recovery isn't the absence of work; it is the presence of repairs. If you don't schedule your repairs, your body will schedule your breakdown.`,
    actions: [
      { label: 'Energy Action', text: 'Add "Mandatory Boredom" (15 credits)', type: 'energy' },
      { label: 'Boundary Script', text: 'The "Weekend Recovery" boundary', type: 'boundary' },
      { label: 'Core Reflection', text: 'If recovery was "work", how would I grade my performance today?', type: 'mindset' }
    ]
  },
  { 
    id: '3', 
    title: 'Identity Base-Layer', 
    snippet: 'Who are you when the screen is dark?', 
    content: `If you lost your title tomorrow, what would remain? For many, the answer is "nothing". This fusion of identity and output is why every bad work day feels like a bad life. Decoupling your worth from your weekly metrics is the first step to sustainable algorithmic performance.`,
    actions: [
      { label: 'Energy Action', text: 'Allocate 10 credits to a "hobby" task', type: 'energy' },
      { label: 'Boundary Script', text: 'The "Social Battery" check-in', type: 'boundary' },
      { label: 'Core Reflection', text: 'List three things you like about yourself that have nothing to do with competence.', type: 'mindset' }
    ]
  },
  { 
    id: '4', 
    title: 'The Efficiency Trap', 
    snippet: 'Why being "fast" just gets you more work.', 
    content: `In a digital environment, the reward for finishing your work early is more work. If you are 20% more efficient than your peers, you are likely doing 40% more work for the same pay. Stop trying to find more time; start trying to find more space.`,
    actions: [
      { label: 'Energy Action', text: 'Set a hard 17:00 digital blackout', type: 'energy' },
      { label: 'Boundary Script', text: 'The "Promotion Criteria" talk', type: 'boundary' },
      { label: 'Core Reflection', text: 'How much of my schedule is dictated by other people\'s lack of planning?', type: 'mindset' }
    ]
  },
];

export const ReflectSection = ({ 
  onAwardPoints, 
  committedActionIds = [], 
  onCommitAction 
}: { 
  onAwardPoints: (amount: number, reason: string) => void,
  committedActionIds?: string[],
  onCommitAction?: (actionId: string) => void
}) => {
  const [selected, setSelected] = useState<Chapter | null>(null);
  const [view, setView] = useState<'content' | 'action'>('content');

  const [showTriggerTimeline, setShowTriggerTimeline] = useState(false);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(true);

  const uid = auth.currentUser?.uid;

  const fetchTriggers = async () => {
    if (!uid) { setTriggersLoading(false); return; }
    setTriggersLoading(true);
    try {
      const q = query(collection(db, 'users', uid, 'stress_triggers'), orderBy('date', 'desc'), limit(30));
      const snap = await getDocs(q);
      setTriggers(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    } catch (e) {
      // Honest empty state - no fabricated fallback data.
      setTriggers([]);
    } finally {
      setTriggersLoading(false);
    }
  };

  useEffect(() => { fetchTriggers(); }, [uid, showTriggerTimeline]);

  // 30-Day Emotional Mood Patterns State
  const [moodLogs, setMoodLogs] = useState<{ id: string; date: string; word: string; intensity: number; category: 'negative' | 'positive' | 'neutral' }[]>([]);
  const [moodLogsLoading, setMoodLogsLoading] = useState(true);

  const fetchMoodLogs = async () => {
    if (!uid) { setMoodLogsLoading(false); return; }
    setMoodLogsLoading(true);
    try {
      const q = query(collection(db, 'users', uid, 'emotional_patterns'), orderBy('createdAt', 'desc'), limit(30));
      const snap = await getDocs(q);
      setMoodLogs(snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          date: new Date(data.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          word: data.word,
          intensity: data.intensity,
          category: data.category as 'negative' | 'positive' | 'neutral',
        };
      }).reverse());
    } catch (e) {
      // Honest empty state - no fabricated fallback data.
      setMoodLogs([]);
    } finally {
      setMoodLogsLoading(false);
    }
  };

  useEffect(() => { fetchMoodLogs(); }, [uid]);

  const [moodFilter, setMoodFilter] = useState<'all' | 'negative' | 'positive'>('all');
  const [newMoodWord, setNewMoodWord] = useState('');
  const [newMoodIntensity, setNewMoodIntensity] = useState(5);
  const [newMoodCategory, setNewMoodCategory] = useState<'negative' | 'positive' | 'neutral'>('negative');

  const handleAddMoodLog = async () => {
    if (!newMoodWord.trim() || !uid) return;
    const word = newMoodWord.trim().charAt(0).toUpperCase() + newMoodWord.trim().slice(1);
    const intensity = Number(newMoodIntensity);
    const category = newMoodCategory;
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    try {
      const id = Date.now().toString();
      await setDoc(doc(db, 'users', uid, 'emotional_patterns', id), {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        word,
        intensity,
        category,
      });
      setMoodLogs(prev => [...prev, { id, date: dateStr, word, intensity, category }].slice(-30));
      setNewMoodWord('');
      onAwardPoints(40, "Emotional pattern logged to Nova Core");
    } catch (e) {
      console.error("Could not save this mood log:", e);
    }
  };

  const handleSelect = (chapter: Chapter) => {
    setSelected(chapter);
    setView('content');
    onAwardPoints(30, "Neural Impression");
  };

  const handleCommit = (chapterId: string, actionIndex: number) => {
    const actionId = `${chapterId}-${actionIndex}`;
    if (onCommitAction) {
      onCommitAction(actionId);
    }
  };

  return (
    <div className="space-y-12 pb-24 font-sans text-text-main">
      
      {/* Reflect header */}
      <div className="relative overflow-hidden rounded-xl bg-card border border-border p-6 sm:p-8 md:p-10">
        <div className="relative z-10 max-w-4xl">
          <div className="flex items-center gap-4 mb-6">
             <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
               <BookOpen className="w-6 h-6" />
             </div>
             <div>
                <h2 className="text-2xl lg:text-3xl font-display font-medium text-text-main tracking-tight">Reflect</h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs font-medium uppercase tracking-widest text-primary flex items-center gap-1.5"><Activity className="w-3 h-3" /> Recovery Insights</span>
                </div>
             </div>
          </div>
          <p className="text-sm text-text-muted font-serif italic leading-relaxed max-w-2xl border-l-2 border-primary/30 pl-4 py-1">
            "Understanding your patterns is the easy part. Actually changing them takes practice — turning what you've learned into small, repeatable actions."
          </p>
        </div>
      </div>

      {/* 30-day recurrent emotional pattern analysis */}
      <div className="card bg-card border border-border rounded-xl p-8 md:p-10 relative overflow-hidden">
        <div className="relative z-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-6">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Brain className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h3 className="text-xl font-display font-medium text-text-main tracking-tight">30-Day Emotional Patterns</h3>
                <p className="text-xs font-medium uppercase tracking-widest text-text-muted mt-1">What Nova's noticed</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              <button
                onClick={() => setShowTriggerTimeline(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 hover:border-primary/35 text-primary text-xs font-medium uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                <TrendingUp className="w-4 h-4" /> Trigger Timeline
              </button>

              {/* Filter controls */}
              <div className="flex bg-surface dark:bg-card/80 p-1 rounded-lg border border-border">
              {[
                { id: 'all', label: 'All Patterns' },
                { id: 'negative', label: 'Stress Leaks' },
                { id: 'positive', label: 'Positive Anchors' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setMoodFilter(opt.id as any)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                    moodFilter === opt.id 
                      ? "bg-primary text-primary-foreground shadow-md" 
                      : "text-text-muted hover:text-text-main"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Chart Column - Cortisol Load */}
            <div className="xl:col-span-8 bg-surface/30 border border-border/60 p-6 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest text-text-main">Chronological Load Timeline</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-text-muted bg-surface px-2 py-0.5 rounded border border-border">30-Day Resolution</span>
              </div>

              <div className="h-64 w-full">
                {moodLogsLoading ? (
                  <div className="h-full flex items-center justify-center text-text-muted">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : moodLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-text-muted">
                    <Brain className="w-6 h-6" />
                    <p className="text-xs font-medium">Nothing logged yet — use the form below to log your first pattern.</p>
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={moodLogs.filter(l => moodFilter === 'all' || l.category === moodFilter)}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorIntensity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 10]} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                      labelStyle={{ color: '#64748b', fontWeight: 'bold', fontSize: '11px' }}
                      itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      formatter={(value: any, name: any, props: any) => [
                        <span key="tooltip-val" className="text-text-main font-bold">
                          Intensity: {value}/10 ({props.payload.word})
                        </span>,
                        'Mood Load'
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="intensity"
                      stroke={moodFilter === 'positive' ? '#10b981' : '#ef4444'}
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorIntensity)"
                      activeDot={{ r: 6 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart Column - Recurrent Frequencies */}
            <div className="xl:col-span-4 bg-surface/30 border border-border/60 p-6 rounded-2xl flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-warning" />
                  <span className="text-xs font-black uppercase tracking-widest text-text-main">Top Recurrent Word Patterns</span>
                </div>

                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={(() => {
                        const wordFrequency = moodLogs.reduce((acc: Record<string, number>, log) => {
                          if (moodFilter === 'negative' && log.category !== 'negative') return acc;
                          if (moodFilter === 'positive' && log.category !== 'positive') return acc;
                          acc[log.word] = (acc[log.word] || 0) + 1;
                          return acc;
                        }, {});
                        return Object.keys(wordFrequency).map(word => ({
                          word,
                          count: wordFrequency[word],
                          category: moodLogs.find(l => l.word === word)?.category || 'neutral'
                        })).sort((a, b) => b.count - a.count).slice(0, 5);
                      })()}
                      margin={{ top: 5, right: 10, left: 15, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                      <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="word" tick={{ fill: '#cbd5e1', fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {(() => {
                          const wordFrequency = moodLogs.reduce((acc: Record<string, number>, log) => {
                            if (moodFilter === 'negative' && log.category !== 'negative') return acc;
                            if (moodFilter === 'positive' && log.category !== 'positive') return acc;
                            acc[log.word] = (acc[log.word] || 0) + 1;
                            return acc;
                          }, {});
                          const data = Object.keys(wordFrequency).map(word => ({
                            word,
                            count: wordFrequency[word],
                            category: moodLogs.find(l => l.word === word)?.category || 'neutral'
                          })).sort((a, b) => b.count - a.count).slice(0, 5);
                          return data.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.category === 'positive' ? '#10b981' : (entry.category === 'negative' ? '#ef4444' : '#6366f1')} 
                            />
                          ));
                        })()}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="text-[10px] uppercase font-black tracking-widest text-text-muted text-center">
                Word Frequency Cumulative Map
              </div>
            </div>
          </div>

          {/* Bottom Interactive Block: Nova Observation + Quick Input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-border">
            {/* Nova Insight */}
            <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 flex gap-4 items-start text-left">
              <div className="p-3 bg-primary/10 text-primary border border-primary/20 rounded-xl shrink-0">
                <Sparkles className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-medium uppercase tracking-widest text-primary font-mono block">Nova's read on your patterns</span>
                <p className="text-sm font-medium text-text-main tracking-tight leading-snug font-serif italic">
                  {(() => {
                    const negCount = moodLogs.filter(l => l.category === 'negative').length;
                    const fawningCount = moodLogs.filter(l => l.word === 'Fawning').length;
                    const resentfulCount = moodLogs.filter(l => l.word === 'Resentful').length;

                    if (negCount > 15) {
                      return `"You've logged a lot of '${fawningCount > resentfulCount ? 'Fawning' : 'Resentful'}' moments lately. That usually means you're taking on more than you can hold, and a boundary conversation is overdue. Worth rehearsing one soon."`;
                    }
                    return `"Your emotional baseline looks steady — keep logging as things come up. Even when things feel fine, unspoken pressure can build quietly, so it's worth staying on top of it."`;
                  })()}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-[10px] font-medium uppercase tracking-widest text-text-muted">Updated as you log</span>
                </div>
              </div>
            </div>

            {/* Quick Input Log Form */}
            <div className="p-6 bg-surface dark:bg-card/40 border border-border rounded-2xl space-y-4">
              <span className="text-xs font-black uppercase tracking-widest text-text-muted block text-left">Log Instant Emotional Marker</span>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text" 
                  value={newMoodWord}
                  onChange={(e) => setNewMoodWord(e.target.value)}
                  placeholder="e.g. Fawning, Resentful, Calm, Exhausted"
                  className="flex-1 bg-card border border-border/80 rounded-xl px-4 py-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary transition-all font-sans font-semibold text-left"
                />
                
                <select 
                  value={newMoodCategory}
                  onChange={(e) => setNewMoodCategory(e.target.value as any)}
                  className="bg-card border border-border/80 rounded-xl px-3 py-3 text-xs font-bold uppercase tracking-wider text-text-main focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="negative">Stress Leak</option>
                  <option value="positive">Positive Anchor</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-6">
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted shrink-0">Intensity:</span>
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    value={newMoodIntensity}
                    onChange={(e) => setNewMoodIntensity(Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer h-1.5 rounded bg-border"
                  />
                  <span className="text-xs font-mono font-bold text-primary shrink-0 w-4">{newMoodIntensity}</span>
                </div>

                <button
                  onClick={handleAddMoodLog}
                  className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shrink-0 cursor-pointer"
                >
                  Submit Pattern
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Voice Journal */}
      <DailyVoiceJournal onAwardPoints={onAwardPoints} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center gap-2 mb-6 px-1">
            <LayoutTemplate className="w-4 h-4 text-text-muted" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-text-muted">Recovery Curriculum</span>
          </div>
          
          <div className="space-y-3">
            {chapters.map(c => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className={cn(
                  "w-full text-left p-5 rounded-2xl transition-all duration-300 relative group overflow-hidden border",
                  selected?.id === c.id
                    ? "bg-card border-primary/40"
                    : "bg-white dark:bg-card/50 border-border hover:border-primary/20"
                )}
              >
                <div className="flex items-center gap-5 relative z-10">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-500",
                    selected?.id === c.id ? "bg-primary/10 border-primary/20 text-primary shadow-inner" : "bg-surface dark:bg-surface border-border dark:border-border text-text-muted"
                  )}>
                    <span className="font-mono font-bold text-sm">{c.id.padStart(2, '0')}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className={cn("font-bold text-sm tracking-tight transition-colors", selected?.id === c.id ? "text-primary" : "text-text-main group-hover:text-primary")}>{c.title}</h4>
                    <p className="text-[11px] text-text-muted font-mono mt-1.5  line-clamp-1">{c.snippet}</p>
                  </div>
                </div>
                {selected?.id === c.id && (
                  <motion.div 
                    layoutId="chapter-active"
                    className="absolute left-0 top-0 bottom-0 w-1 bg-primary"
                  />
                )}
              </button>
            ))}
          </div>
          
          <div className="mt-8 p-6 bg-surface dark:bg-card/80 rounded-2xl border border-border dark:border-border relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
               <Zap className="w-16 h-16 text-warning" />
             </div>
             <div className="flex items-center gap-2 mb-3 relative z-10">
                <Zap className="w-4 h-4 text-warning" />
                <span className="text-xs font-black uppercase tracking-widest text-text-muted">Implementation Rewards</span>
             </div>
             <p className="text-xs font-medium text-text-muted leading-relaxed relative z-10">
               Each protocol committed to the OS unlocks <strong className="text-warning">+250 Stability Points</strong>. Consistency is the only metric that matters.
             </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8 relative">
          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card flex flex-col items-center justify-center min-h-[500px] text-center p-6 sm:p-8 md:p-12 bg-white dark:bg-card border-dashed border-2 border-border/50"
              >
                <div className="w-20 h-20 bg-surface dark:bg-surface rounded-2xl flex items-center justify-center text-text-muted mb-6 border border-border dark:border-border shadow-inner">
                  <Book className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-text-main tracking-tight mb-3">Start Your Journal</h3>
                <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">Select a curriculum node to review theory and extract actionable blueprints for immediate deployment into your routine.</p>
              </motion.div>
            ) : (
              <motion.div
                key={selected.id + view}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="h-full"
              >
                {view === 'content' ? (
                  <div className="card h-full p-0 overflow-hidden bg-card border border-border relative group/card">
                    <div className="p-10 lg:p-12 relative z-10 flex flex-col h-full space-y-12">
                      <div className="flex items-center justify-between border-b border-primary/20 pb-6">
                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 bg-primary/20 text-primary text-[11px] uppercase font-medium tracking-widest rounded-md border border-primary/30">Pattern {selected.id}</span>
                        </div>
                        <span className="text-xs font-mono text-text-muted bg-surface px-3 py-1 rounded border border-border">~3 min read</span>
                      </div>

                      <div className="flex-1 space-y-8">
                        <h4 className="text-4xl lg:text-5xl font-display font-medium text-text-main leading-[1.1] tracking-tight">{selected.title}</h4>

                        <div className="pl-6 border-l-4 border-primary/50">
                          <p className="text-lg lg:text-xl text-text-muted leading-relaxed font-serif italic">
                            "{selected.content}"
                          </p>
                        </div>
                      </div>

                      <div className="pt-8 flex flex-col sm:flex-row items-center gap-6 justify-between border-t border-border">
                        <p className="text-xs font-medium text-text-muted uppercase tracking-[0.2em]">Ready to put this into practice?</p>
                        <button
                          onClick={() => setView('action')}
                          className="w-full sm:w-auto px-8 py-4 bg-primary hover:opacity-90 text-primary-foreground rounded-lg text-xs font-medium uppercase tracking-widest flex items-center justify-center gap-3 transition-all group/btn"
                        >
                          See What To Do <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                       <button
                         onClick={() => setView('content')}
                         className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-text-muted hover:text-text-main transition-colors group/back"
                       >
                          <ChevronRight className="w-4 h-4 rotate-180 group-hover/back:-translate-x-1 transition-transform" /> Back
                       </button>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                      {/* Action Plans */}
                      <div className="card bg-card border border-border p-8 space-y-8 relative overflow-hidden">
                        <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                        <div className="relative z-10 flex items-center justify-between border-b border-border pb-4">
                           <div className="flex items-center gap-3">
                             <Sparkles className="w-5 h-5 text-success" />
                             <span className="text-xs font-black uppercase tracking-[0.25em] text-success/80">Key Takeaways</span>
                           </div>
                        </div>
                        
                        <div className="relative z-10 space-y-6">
                          {selected.actions.map((action, i) => {
                            const actionId = `${selected.id}-${i}`;
                            const isCommitted = committedActionIds.includes(actionId);
                            
                            return (
                              <motion.div 
                                key={i} 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                              >
                                <div className={cn(
                                  "p-6 rounded-2xl transition-all duration-500 relative overflow-hidden text-left",
                                  isCommitted 
                                    ? "bg-success/10 border-success/30" 
                                    : "bg-surface/50 border-border border hover:border-primary/40"
                                )}>
                                  {isCommitted && <div className="absolute top-0 left-0 w-1 h-full bg-success" />}
                                  <div className="flex justify-between items-center mb-4">
                                    <span className={cn("text-[11px] font-black text-text-muted font-mono")}>
                                      [ {action.type.toUpperCase()} / {action.label} ]
                                    </span>
                                    <div className={cn(
                                      "w-6 h-6 rounded flex items-center justify-center transition-all duration-500",
                                      isCommitted ? "bg-success text-white" : "bg-surface text-text-muted border border-border"
                                    )}>
                                      {isCommitted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Zap className="w-3 h-3" />}
                                    </div>
                                  </div>
                                  
                                  <p className={cn("text-[15px] font-bold leading-tight tracking-tight mb-5", isCommitted ? "text-text-muted" : "text-text-main")}>
                                    {action.text}
                                  </p>
                                  
                                  {!isCommitted ? (
                                    <div className="space-y-3">
                                      <input 
                                        type="text" 
                                        placeholder="Customize specific constraint..."
                                        className="w-full bg-card border border-border/50 rounded-xl px-4 py-3 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary transition-all font-mono"
                                      />
                                      <button 
                                        onClick={() => {
                                          handleCommit(selected.id, i);
                                          onAwardPoints(50, "Parameter Committed");
                                        }}
                                        className="w-full py-3.5 bg-surface dark:bg-card hover:bg-border text-text-main text-xs uppercase font-black tracking-widest rounded-xl transition-all shadow-lg"
                                      >
                                        Push to System
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 pt-2 text-[11px] uppercase font-black tracking-widest text-success/80">
                                      <div className="w-1.5 h-1.5 rounded-full bg-success" /> Layer Active
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Nova Dialogue Column */}
                      <div className="flex flex-col gap-6">
                         <div className="card bg-white dark:bg-card h-full flex flex-col p-0 overflow-hidden border border-border min-h-[500px]">
                            <div className="bg-surface dark:bg-surface/50 border-b border-border p-5 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                  <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-text-main tracking-tight block text-left">Synthesis Coach</span>
                                  <span className="text-[11px] font-black uppercase tracking-widest text-text-muted mt-0.5 block px-0 bg-transparent">Guidance Mode</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 bg-surface/30 relative">
                              <div className="absolute inset-0 pb-16">
                                <NovaChat 
                                  systemInstruction={`You are Nova. The user is reflecting on Chapter: ${selected.title}. Goal: Turn theory into ONE specific action today. Reject generic plans. Challenge them if their plan is too vague. Profile: ${selected.snippet}. Keep it very brief, executive tone.`}
                                  initialMessage={`"I see you're processing '${selected.title}'. Based on your burnout profile, why is allocating time for this specific insight difficult in your current environment?"`}
                                />
                              </div>
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Trigger Timeline Correlation Modal */}
      <AnimatePresence>
        {showTriggerTimeline && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTriggerTimeline(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative w-full max-w-5xl bg-card border border-border rounded-xl p-6 md:p-8 shadow-lg flex flex-col max-h-[90vh] overflow-hidden z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border pb-5 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 text-primary flex items-center justify-center shrink-0 shadow-inner">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-xl md:text-2xl font-display font-black text-text-main tracking-tight">
                      Trigger Log & Energy Correlation
                    </h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-text-muted mt-0.5">
                      Nova Analytical Correlation Engine
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTriggerTimeline(false)}
                  className="p-2.5 rounded-xl bg-surface hover:bg-border/50 text-text-muted hover:text-text-main transition-all cursor-pointer border border-border/40"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Scrollable Container */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-8 scrollbar-thin text-left">
                {/* Product/Coaching Statement */}
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex items-start gap-3">
                  <div className="p-2 bg-primary/10 text-primary border border-primary/20 rounded-lg shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-black uppercase tracking-wider text-primary">Nova Intercept Report</h5>
                    <p className="text-xs text-text-muted leading-relaxed mt-1 font-medium">
                      Every logged "Quick Note" from your dashboard is recorded chronologically with severe drains mapped against your energy baseline. Tracking these crossovers allows you to notice patterns of critical capacity collapse before they lead to relapse.
                    </p>
                  </div>
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Metric 1: Correlation Status */}
                  <div className={cn(
                    "p-5 rounded-2xl border text-left flex flex-col justify-between space-y-3 shadow-inner",
                    calculateCorrelation(triggers) <= -0.5
                      ? "bg-destructive/5 border-destructive/20 text-destructive"
                      : "bg-primary/5 border-primary/10 text-primary"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Correlation Matrix</span>
                      <span className="text-[10px] font-mono font-bold bg-surface px-1.5 py-0.5 rounded border border-border/60">Pearson R</span>
                    </div>
                    <div>
                      <h4 className="text-2xl font-display font-black tracking-tight flex items-baseline gap-1">
                        {calculateCorrelation(triggers)}
                        <span className="text-xs font-bold text-text-muted font-sans">
                          {calculateCorrelation(triggers) <= -0.5 ? " (Strong Inverse)" : " (Stable)"}
                        </span>
                      </h4>
                      <p className="text-[11px] text-text-muted mt-1 font-medium leading-relaxed">
                        {calculateCorrelation(triggers) <= -0.5 
                          ? "Critical Inverse stress link: Every severity peak corresponds directly to a sharp decline in energy stability." 
                          : "Your baseline energy is dynamic but holding independent from immediate operational severity peaks."}
                      </p>
                    </div>
                  </div>

                  {/* Metric 2: Avg Severity */}
                  <div className="p-5 bg-surface/40 border border-border/60 rounded-2xl text-left flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Average Burden Strain</span>
                      <AlertTriangle className="w-4 h-4 text-warning" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-display font-black text-text-main tracking-tight">
                        {(triggers.reduce((acc, t) => acc + t.severity, 0) / Math.max(1, triggers.length)).toFixed(1)}
                        <span className="text-xs font-bold text-text-muted"> / 10</span>
                      </h4>
                      <p className="text-[11px] text-text-muted mt-1 font-medium leading-relaxed">
                        Average severity of logged incidents. Incidents exceeding 7/10 represent system overloads requiring immediate boundary interventions.
                      </p>
                    </div>
                  </div>

                  {/* Metric 3: Total Logs */}
                  <div className="p-5 bg-surface/40 border border-border/60 rounded-2xl text-left flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Triggers Logged</span>
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-display font-black text-text-main tracking-tight">
                        {triggers.length}
                        <span className="text-xs font-bold text-text-muted"> Incidents</span>
                      </h4>
                      <p className="text-[11px] text-text-muted mt-1 font-medium leading-relaxed">
                        Continuous monitoring captures immediate drains to program proactive boundary shields in your Recovery Planner.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Visualizer - Correlation Chart */}
                <div className="bg-surface/30 border border-border/60 p-6 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span className="text-xs font-black uppercase tracking-widest text-text-main">
                        Severity Burden vs Energy Stability Baseline
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-text-muted bg-surface px-2 py-0.5 rounded border border-border">
                      Scaled Timeline Overlay
                    </span>
                  </div>

                  <div className="h-72 w-full">
                    {triggersLoading ? (
                      <div className="h-full flex items-center justify-center text-text-muted">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </div>
                    ) : triggers.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-text-muted text-xs font-medium">
                        No logged incidents available to visualize correlation.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={[...triggers].reverse().map(t => ({
                            ...t,
                            formattedDate: new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                            severityPercent: t.severity * 10
                          }))}
                          margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorEnergyModal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorSeverityModal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                          <XAxis dataKey="formattedDate" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                            labelStyle={{ color: '#64748b', fontWeight: 'bold', fontSize: '11px' }}
                            itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                            formatter={(value: any, name: any, props: any) => {
                              if (name === "severityPercent") {
                                return [
                                  <span key="val-sev" className="text-destructive font-bold">{props.payload.severity}/10</span>,
                                  "Severity Burden"
                                ];
                              }
                              return [
                                <span key="val-eng" className="text-primary font-bold">{value}%</span>,
                                "Energy Baseline"
                              ];
                            }}
                          />
                          <Legend 
                            verticalAlign="top" 
                            height={36} 
                            iconType="circle" 
                            wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 'bold' }} 
                          />
                          <Area
                            name="Energy Baseline (%)"
                            type="monotone"
                            dataKey="energyLevel"
                            stroke="#6366f1"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#colorEnergyModal)"
                            activeDot={{ r: 6 }}
                          />
                          <Area
                            name="severityPercent"
                            type="monotone"
                            dataKey="severityPercent"
                            stroke="#ef4444"
                            strokeWidth={2.5}
                            fillOpacity={1}
                            fill="url(#colorSeverityModal)"
                            activeDot={{ r: 6 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Timeline Component */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                    <Activity className="w-4 h-4 text-text-muted" />
                    <span className="text-xs font-black uppercase tracking-widest text-text-main">
                      Trigger Timeline
                    </span>
                  </div>

                  {triggersLoading ? (
                    <div className="flex items-center justify-center py-12 text-text-muted">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  ) : triggers.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-border/60 rounded-2xl bg-surface/20">
                      <HelpCircle className="w-8 h-8 text-text-muted mx-auto mb-3" />
                      <p className="text-xs font-bold text-text-main">No logged triggers captured</p>
                      <p className="text-[10px] text-text-muted mt-1">Use the 'Log Trigger' floating widget in the home dashboard to log instant capacity drains.</p>
                    </div>
                  ) : (
                    <div className="relative pl-6 border-l border-border/80 ml-3 space-y-8">
                      {triggers.map((trigger, idx) => {
                        const dateObj = new Date(trigger.date);
                        const displayDate = dateObj.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });

                        const isHighSeverity = trigger.severity >= 7;

                        return (
                          <div key={trigger.id || idx} className="relative">
                            {/* Glowing timeline node */}
                            <div className={cn(
                              "absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all shadow-md",
                              isHighSeverity
                                ? "bg-card border-destructive text-destructive ring-4 ring-destructive/10"
                                : "bg-card border-primary text-primary ring-4 ring-primary/10"
                            )}>
                              <div className={cn("w-1.5 h-1.5 rounded-full", isHighSeverity ? "bg-destructive" : "bg-primary")} />
                            </div>

                            {/* Timeline content box */}
                            <div className="bg-surface/50 border border-border/60 p-5 rounded-2xl space-y-4 hover:border-primary/30 transition-all text-left">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                                <span className="text-[10px] font-mono font-bold text-text-muted flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" /> {displayDate}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border",
                                    isHighSeverity
                                      ? "bg-destructive/10 text-destructive border-destructive/20"
                                      : "bg-warning/10 text-warning border-warning/20"
                                  )}>
                                    Severity {trigger.severity}/10
                                  </span>
                                  <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-[10px] font-black uppercase tracking-wider">
                                    Energy {trigger.energyLevel}%
                                  </span>
                                </div>
                              </div>

                              <p className="text-sm font-bold text-text-main leading-snug tracking-tight">
                                {trigger.text}
                              </p>

                              {/* Nova Intervention Script */}
                              <div className="p-3.5 bg-primary/5 rounded-xl border border-primary/10 flex gap-3 items-start">
                                <div className="p-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg shrink-0">
                                  <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '8s' }} />
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-primary font-mono block">Nova's Pattern Detection</span>
                                  <p className="text-xs font-medium text-text-muted leading-relaxed">
                                    {getNovaAssessment(trigger.text, trigger.severity)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Close footer */}
              <div className="border-t border-border pt-5 mt-6 flex justify-end">
                <button
                  onClick={() => setShowTriggerTimeline(false)}
                  className="px-6 py-2.5 bg-surface hover:bg-border text-text-main text-xs font-black uppercase tracking-widest rounded-xl border border-border/80 transition-all cursor-pointer"
                >
                  Close Monitor
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
