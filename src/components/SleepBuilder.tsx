import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Moon, Coffee, Smartphone, Edit3, Bed, ZapOff, CheckCircle2, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { addNovaMemory } from '../lib/nova-brain';

interface SleepBuilderProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

export const SleepBuilder = ({ fingerprint, onAwardPoints }: SleepBuilderProps) => {
  const [bedtime, setBedtime] = useState('22:30');
  const [caffeineCutoff, setCaffeineCutoff] = useState(true);
  const [phoneOff, setPhoneOff] = useState(true);
  const [parkedItem, setParkedItem] = useState('');
  const [parkingList, setParkingList] = useState<string[]>([]);
  const [mentalUnload, setMentalUnload] = useState('');
  const [windDownStarted, setWindDownStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load the real, persisted ritual state - previously this was pure
  // ephemeral React state that reset on every reload, meaning a parked
  // worry or a bedtime target never actually survived leaving the page.
  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) { setLoaded(true); return; }
      try {
        const snap = await getDoc(doc(db, 'users', auth.currentUser.uid, 'preferences', 'sleep_builder'));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.bedtime === 'string') setBedtime(data.bedtime);
          if (typeof data.caffeineCutoff === 'boolean') setCaffeineCutoff(data.caffeineCutoff);
          if (typeof data.phoneOff === 'boolean') setPhoneOff(data.phoneOff);
          if (typeof data.mentalUnload === 'string') setMentalUnload(data.mentalUnload);
          if (Array.isArray(data.parkingList)) setParkingList(data.parkingList);
        }
      } catch (e) {
        // Leaves the honest defaults in place rather than pretending progress loaded.
      }
      setLoaded(true);
    };
    load();
  }, []);

  const savePrefs = (updates: Record<string, any>) => {
    if (!auth.currentUser) return;
    setDoc(doc(db, 'users', auth.currentUser.uid, 'preferences', 'sleep_builder'), {
      ...updates,
      updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(() => {
      // Non-fatal - the UI still reflects the change locally even if this save fails.
    });
  };

  // Debounced autosave for the ritual settings, mirroring the pattern
  // already used for Recovery Intelligence Layer's and Recovery Fuel
  // Engine's preference docs.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      savePrefs({ bedtime, caffeineCutoff, phoneOff, mentalUnload, parkingList });
    }, 800);
    return () => clearTimeout(t);
  }, [bedtime, caffeineCutoff, phoneOff, mentalUnload, parkingList, loaded]);

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
    addNovaMemory({
      type: 'state',
      content: `User began their evening wind-down ritual. Bedtime target: ${bedtime}. Caffeine cutoff observed: ${caffeineCutoff}. Screen blackout observed: ${phoneOff}.${parkingList.length > 0 ? ` Parked ${parkingList.length} item(s) for tomorrow rather than solving them tonight.` : ''}`,
      source: 'Sleep & Wind-Down Builder',
      confidence: 'verified',
      canEdit: false,
    });
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
              <p className="text-[11px] uppercase tracking-[0.2em] font-black text-[#9a3412] dark:text-primary">Winding Down</p>
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
                 className="w-full bg-transparent border-b-2 border-border/50 text-3xl font-display font-black text-[#9a3412] dark:text-primary focus:outline-none focus:border-primary transition-colors py-2"
               />
                           </div>

            <div className="card border border-border p-6 space-y-4">
               <span className="text-xs font-black uppercase tracking-widest text-text-muted">Environmental Control</span>
               
               <button 
                 onClick={() => setCaffeineCutoff(!caffeineCutoff)}
                 aria-pressed={caffeineCutoff}
                 className={cn("w-full flex items-center justify-between p-3 rounded-xl border transition-all", caffeineCutoff ? "bg-primary/10 border-primary/30" : "bg-transparent border-border/50 hover:bg-surface dark:hover:bg-surface")}
               >
                 <div className="flex items-center gap-3">
                   <Coffee className={cn("w-4 h-4", caffeineCutoff ? "text-primary" : "text-text-muted")} />
                   <span className={cn("text-sm font-bold", caffeineCutoff ? "text-[#9a3412] dark:text-primary" : "text-text-main")}>Caffeine Cut-off (2 PM)</span>
                 </div>
                 {caffeineCutoff && <CheckCircle2 className="w-4 h-4 text-primary" />}
               </button>

               <button 
                 onClick={() => setPhoneOff(!phoneOff)}
                 aria-pressed={phoneOff}
                 className={cn("w-full flex items-center justify-between p-3 rounded-xl border transition-all", phoneOff ? "bg-primary/10 border-primary/30" : "bg-transparent border-border/50 hover:bg-surface dark:hover:bg-surface")}
               >
                 <div className="flex items-center gap-3">
                   <Smartphone className={cn("w-4 h-4", phoneOff ? "text-primary" : "text-text-muted")} />
                   <span className={cn("text-sm font-bold", phoneOff ? "text-[#9a3412] dark:text-primary" : "text-text-main")}>Screen Blackout (1 HR prior)</span>
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
              <div className="flex-1 w-full flex flex-col items-center justify-center text-center gap-2 px-2">
                <Moon className="w-6 h-6 text-text-muted/50" />
                <p className="text-xs text-text-muted leading-relaxed">Nightly sleep-hours logging isn't built yet, so there's no real trend to show here. This tracks your wind-down ritual instead - bedtime target, cutoffs, and what you park for tomorrow.</p>
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
                      <button onClick={() => removeParkedItem(idx)} aria-label={`Remove parked item: ${item}`} className="text-text-muted hover:text-destructive transition-colors">
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
              ? "bg-primary/20 text-[#9a3412] dark:text-primary cursor-not-allowed" 
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
