import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Coffee, Smartphone, Edit3, Bed, ZapOff, CheckCircle2, CloudFog, Sparkles, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface SleepBuilderProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

const SLEEP_DEBT_DATA = [
  { day: 'Mon', debt: 1.5 },
  { day: 'Tue', debt: 2.0 },
  { day: 'Wed', debt: 1.8 },
  { day: 'Thu', debt: 2.5 },
  { day: 'Fri', debt: 3.0 },
  { day: 'Sat', debt: 1.0 },
  { day: 'Sun', debt: 0.5 },
];

export const SleepBuilder = ({ fingerprint, onAwardPoints }: SleepBuilderProps) => {
  const [bedtime, setBedtime] = useState('22:30');
  const [caffeineCutoff, setCaffeineCutoff] = useState(true);
  const [phoneOff, setPhoneOff] = useState(true);
  const [parkedItem, setParkedItem] = useState('');
  const [parkingList, setParkingList] = useState<string[]>([]);
  const [mentalUnload, setMentalUnload] = useState('');
  const [windDownStarted, setWindDownStarted] = useState(false);

  const handleParkItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (parkedItem.trim()) {
      setParkingList([...parkingList, parkedItem.trim()]);
      setParkedItem('');
    }
  };

  const removeParkedItem = (index: number) => {
    setParkingList(parkingList.filter((_, i) => i !== index));
  };

  const handleStartWindDown = () => {
    setWindDownStarted(true);
    if (onAwardPoints) onAwardPoints(15, 'Started Wind-Down Routine');
  };

  const renderTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card p-3 rounded-xl shadow-md border border-border">
          <p className="text-xs font-black uppercase tracking-widest text-text-muted mb-1">{label} - Sleep Debt</p>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {payload[0].value} hours
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 11 / Sleep Hygiene</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Sleep & Wind-Down Builder</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Burnout recovery without sleep support is like trying to charge your phone with a shoelace."
            </p>
          </div>
        </div>
      </div>

      <div className="card border border-primary/20 bg-primary/5 p-8 relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
              <Moon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-display font-bold text-text-main tracking-tight">Nova's Evening Voice</h3>
              <p className="text-[11px] uppercase tracking-[0.2em] font-black text-primary">Winding Down</p>
            </div>
          </div>
          <p className="text-sm text-text-main leading-relaxed font-serif italic">
            "You tend to carry the day's pressure into the evening. Let's help you set it down. Use the parking list below to write down tomorrow's problems — they'll still be there in the morning. They don't need solving at 11 PM."
          </p>
        </div>
              </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card border border-border p-6 space-y-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
               <div className="flex items-center gap-3 mb-2">
                 <div className="w-10 h-10 rounded-full bg-surface dark:bg-surface flex items-center justify-center text-text-main">
                   <Bed className="w-5 h-5" />
                 </div>
                 <div>
                   <span className="text-xs font-black uppercase tracking-widest text-text-muted">Target Time</span>
                   <h4 className="text-lg font-display font-bold text-text-main">Bedtime Target</h4>
                 </div>
               </div>
               <input 
                 type="time" 
                 value={bedtime}
                 onChange={(e) => setBedtime(e.target.value)}
                 className="w-full bg-transparent border-b-2 border-border/50 text-3xl font-display font-black text-primary focus:outline-none focus:border-primary transition-colors py-2"
               />
                           </div>

            <div className="card border border-border p-6 space-y-4">
               <span className="text-xs font-black uppercase tracking-widest text-text-muted">Environmental Control</span>
               
               <button 
                 onClick={() => setCaffeineCutoff(!caffeineCutoff)}
                 className={cn("w-full flex items-center justify-between p-3 rounded-xl border transition-all", caffeineCutoff ? "bg-primary/10 border-primary/30" : "bg-transparent border-border/50 hover:bg-surface dark:hover:bg-surface")}
               >
                 <div className="flex items-center gap-3">
                   <Coffee className={cn("w-4 h-4", caffeineCutoff ? "text-primary" : "text-text-muted")} />
                   <span className={cn("text-sm font-bold", caffeineCutoff ? "text-primary dark:text-primary" : "text-text-main")}>Caffeine Cut-off (2 PM)</span>
                 </div>
                 {caffeineCutoff && <CheckCircle2 className="w-4 h-4 text-primary" />}
               </button>

               <button 
                 onClick={() => setPhoneOff(!phoneOff)}
                 className={cn("w-full flex items-center justify-between p-3 rounded-xl border transition-all", phoneOff ? "bg-primary/10 border-primary/30" : "bg-transparent border-border/50 hover:bg-surface dark:hover:bg-surface")}
               >
                 <div className="flex items-center gap-3">
                   <Smartphone className={cn("w-4 h-4", phoneOff ? "text-primary" : "text-text-muted")} />
                   <span className={cn("text-sm font-bold", phoneOff ? "text-primary dark:text-primary" : "text-text-main")}>Screen Blackout (1 HR prior)</span>
                 </div>
                 {phoneOff && <CheckCircle2 className="w-4 h-4 text-primary" />}
               </button>
            </div>
          </div>

          <div className="card border border-border p-8 space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <Edit3 className="w-5 h-5 text-primary" />
                <h4 className="text-xl font-display font-bold text-text-main">Mental Unload</h4>
              </div>
              <span className="tag">Free-write</span>
            </div>
            <p className="text-sm font-medium text-text-muted">Dump any racing thoughts here. They are structurally contained for the night.</p>
            <textarea 
              value={mentalUnload}
              onChange={(e) => setMentalUnload(e.target.value)}
              placeholder="What is keeping your nervous system engaged right now?"
              className="w-full h-32 bg-surface dark:bg-surface/50 border border-border/50 rounded-xl p-4 focus:outline-none focus:border-primary resize-none text-text-main placeholder-text-muted/60"
            />
          </div>

        </div>

        <div className="lg:col-span-1 space-y-8">
           
           <div className="card border border-border p-6 space-y-6 h-[250px] flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-xs uppercase tracking-[0.2em] font-black text-text-muted">Sleep Debt Trend</span>
              </div>
              <div className="flex-1 w-full relative">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={SLEEP_DEBT_DATA} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.2} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                    <Tooltip content={renderTooltip} />
                    <Area type="monotone" dataKey="debt" name="Sleep Debt (hrs)" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorDebt)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
           </div>

           <div className="card border border-border p-6 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <ZapOff className="w-5 h-5 text-primary" />
                <h4 className="text-xl font-display font-bold text-text-main">Tomorrow Parking List</h4>
              </div>
              <p className="text-xs font-medium text-text-muted mb-4">Store action items you are afraid of forgetting. Deal with them tomorrow.</p>
              
              <form onSubmit={handleParkItem} className="flex gap-2">
                <input 
                  type="text" 
                  value={parkedItem}
                  onChange={(e) => setParkedItem(e.target.value)}
                  placeholder="Task or worry..."
                  className="w-full bg-surface dark:bg-surface/50 border border-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
                <button type="submit" className="btn-primary px-4 py-2 text-sm whitespace-nowrap">Park It</button>
              </form>

              <div className="space-y-2 mt-4 max-h-40 overflow-y-auto">
                <AnimatePresence>
                  {parkingList.map((item, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center justify-between bg-surface dark:bg-surface/50 p-3 rounded-lg border border-border/50"
                    >
                      <span className="text-sm font-medium text-text-main truncate pr-2">{item}</span>
                      <button onClick={() => removeParkedItem(idx)} className="text-text-muted hover:text-destructive transition-colors">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                  {parkingList.length === 0 && (
                    <p className="text-sm text-text-muted italic text-center py-4 ">No items parked yet.</p>
                  )}
                </AnimatePresence>
              </div>
           </div>
        </div>
      </div>

      <div className="flex justify-center mt-12">
        <button 
          onClick={handleStartWindDown}
          disabled={windDownStarted}
          className={cn(
            "flex items-center gap-3 px-8 py-4 rounded-full font-bold uppercase tracking-widest transition-all",
            windDownStarted 
              ? "bg-primary/20 text-primary cursor-not-allowed" 
              : "bg-primary text-primary-foreground hover:bg-primary shadow-xl shadow-primary/20 hover:scale-105"
          )}
        >
          {windDownStarted ? (
            <>
              <CheckCircle2 className="w-5 h-5" /> Wind-Down Routine Active
            </>
          ) : (
             <>
               <Moon className="w-5 h-5 group-hover:animate-pulse" /> Begin Official Wind-Down
             </>
          )}
        </button>
      </div>

    </div>
  );
};
