import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Smartphone, BellOff, MessageSquare, Calendar, Power, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface DigitalBoundaryShieldProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
}

export const DigitalBoundaryShield = ({ fingerprint, onAwardPoints }: DigitalBoundaryShieldProps) => {
  const [weekendMode, setWeekendMode] = useState(false);
  const [auditChecks, setAuditChecks] = useState<Record<string, boolean>>({
    slack: false,
    email: false,
    whatsapp: false,
  });
  
  const [urgentLoudMsg, setUrgentLoudMsg] = useState('');
  const [filterResult, setFilterResult] = useState<'urgent' | 'loud' | null>(null);

  const handleAuditToggle = (key: string) => {
    setAuditChecks(prev => {
      const next = { ...prev, [key]: !prev[key] };
      return next;
    });

    if (!auditChecks[key]) {
      const next = { ...auditChecks, [key]: true };
      if (Object.values(next).every(Boolean) && onAwardPoints && !Object.values(auditChecks).every(Boolean)) {
        onAwardPoints(10, 'Completed Notification Audit');
      }
    }
  };

  const handleFilterCheck = () => {
    if (!urgentLoudMsg.trim()) return;
    
    // Simple heuristic or random for the sake of the demonstration
    const isLoud = urgentLoudMsg.length > 20 || urgentLoudMsg.toLowerCase().includes('need') || urgentLoudMsg.toLowerCase().includes('quick');
    setFilterResult(isLoud ? 'loud' : 'urgent');
  };

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 14 / Digital Defenses</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Digital Boundary Shield</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Burnout is now powered by phones, notifications, and the demon known as 'just checking quickly'."
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Urgent or Loud Filter */}
        <div className="lg:col-span-2 space-y-8">
           <div className="card glass border-primary/20 bg-primary/5 p-8 relative overflow-hidden">
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-text-main tracking-tight">Nova's Filter: Urgent or Loud?</h3>
                  <p className="text-[11px] uppercase tracking-[0.2em] font-black text-primary">Threat Assessment</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <p className="text-xl font-display font-bold text-text-main">
                  "Is this actually urgent, or did someone else's panic just walk into your nervous system?"
                </p>
                
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={urgentLoudMsg}
                    onChange={(e) => setUrgentLoudMsg(e.target.value)}
                    placeholder="Paste the message or describe the request..."
                    className="flex-1 bg-surface dark:bg-surface/50 border border-border/50 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-text-main"
                  />
                  <button onClick={handleFilterCheck} className="btn-primary whitespace-nowrap">
                    Assess
                  </button>
                </div>

                <AnimatePresence>
                  {filterResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={cn(
                        "p-6 rounded-2xl border flex gap-4 mt-4",
                        filterResult === 'loud' 
                          ? "bg-warning/10 border-warning/30 text-warning-foreground dark:text-warning"
                          : "bg-destructive/10 border-destructive/30 text-destructive-foreground dark:text-destructive"
                      )}
                    >
                      <AlertTriangle className="w-6 h-6 shrink-0" />
                      <div>
                        <h4 className="font-bold text-lg mb-1">{filterResult === 'loud' ? "It's Loud, Not Urgent." : "It Might Be Urgent."}</h4>
                        <p className="text-sm font-medium ">
                          {filterResult === 'loud' 
                            ? "This is someone else's anxiety presented as a deadline. Do not reply yet. Delay your response by at least 2 hours to break the urgency loop." 
                            : "If it truly requires immediate action, engage cleanly and log off immediately after. Do not let it cascade into checking other tabs."}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className="absolute right-[-5%] top-[-5%] w-64 h-64 bg-primary/10 rounded-full blur-[80px]" />
          </div>

          {/* Work App Shutdown Ritual */}
          <div className="card glass p-8">
            <div className="flex items-center gap-3 mb-6">
              <Power className="w-5 h-5 text-success" />
              <h3 className="text-2xl font-display font-bold text-text-main">Work App Shutdown Ritual</h3>
            </div>
            <p className="text-text-muted mb-6">Close the digital loops before you step away from the desk.</p>
            
            <div className="space-y-3">
              {[
                { label: 'Close Slack / Teams tab', name: 'slack_tab' },
                { label: 'Close Email tab', name: 'email_tab' },
                { label: 'Turn off phone notifications for work apps', name: 'phone_notifs' },
                { label: 'Physically close the laptop', name: 'laptop_close' }
              ].map((item, idx) => (
                 <label key={idx} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:bg-surface dark:bg-card dark:hover:bg-surface transition-colors cursor-pointer">
                   <input type="checkbox" className="w-5 h-5 rounded border-border/50 text-success focus:ring-success focus:ring-offset-0 bg-transparent" />
                   <span className="font-medium text-text-main">{item.label}</span>
                 </label>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1 space-y-8">
          
          {/* Weekend Protection Mode */}
          <div className="card glass p-6 border-primary/20 relative overflow-hidden group">
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-2">
                <Calendar className={cn("w-5 h-5", weekendMode ? "text-primary" : "text-text-muted")} />
                <span className="font-bold text-text-main font-display">Weekend Protection</span>
              </div>
              <button 
                onClick={() => {
                  setWeekendMode(!weekendMode);
                  if (!weekendMode && onAwardPoints) onAwardPoints(20, 'Weekend Protection Mode Activated');
                }}
                className={cn(
                  "w-12 h-6 rounded-full transition-colors relative", 
                  weekendMode ? "bg-primary" : "bg-border dark:bg-surface"
                )}
              >
                <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-all", weekendMode ? "left-7" : "left-1")} />
              </button>
            </div>
            
            <div className="relative z-10">
              <p className="text-sm text-text-muted mb-4 leading-relaxed">
                Blocks out "quick checks" and silences after-hours anxiety loops.
              </p>
              {weekendMode && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm font-bold text-primary dark:text-primary flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Active until Monday 8AM
                </div>
              )}
            </div>
            
            {weekendMode && (
              <motion.div layoutId="weekend-glow" className="absolute inset-0 bg-primary/10 blur-xl" />
            )}
          </div>

          {/* Notification Audit */}
          <div className="card glass p-6">
            <div className="flex items-center gap-2 mb-6">
              <BellOff className="w-5 h-5 text-text-main" />
              <h3 className="font-bold text-text-main font-display">Notification Audit</h3>
            </div>
            <p className="text-sm text-text-muted mb-6">Your attention is your most valuable asset. Stop giving it away for free.</p>
            
            <div className="space-y-3">
               {[
                 { id: 'slack', label: 'Slack/Teams: Mentions only' },
                 { id: 'email', label: 'Email: Badges off, banners off' },
                 { id: 'whatsapp', label: 'WhatsApp: Work group muted' }
               ].map(item => (
                 <button
                   key={item.id}
                   onClick={() => handleAuditToggle(item.id)}
                   className={cn(
                     "w-full flex items-center justify-between p-3 rounded-lg border text-sm transition-all",
                     auditChecks[item.id] ? "bg-success/10 border-success/30 text-success-foreground dark:text-success font-bold" : "bg-transparent border-border/50 text-text-main"
                   )}
                 >
                   {item.label}
                   {auditChecks[item.id] && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                 </button>
               ))}
            </div>
          </div>

          <div className="card glass p-6 bg-surface dark:bg-surface/50">
             <div className="flex items-center gap-2 mb-2">
               <MessageSquare className="w-4 h-4 text-text-muted" />
               <span className="text-xs font-black uppercase tracking-widest text-text-muted">Template</span>
             </div>
             <p className="text-sm font-medium text-text-main italic mb-3">
               "Received. I am currently focused on another priority but will review this and respond by [Tomorrow 10 AM]."
             </p>
             <button className="text-xs font-bold text-primary hover:text-primary transition-colors">
               Copy Template
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};
