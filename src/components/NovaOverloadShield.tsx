import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Calendar, 
  MessageSquare, 
  CheckSquare, 
  Zap, 
  Lock, 
  EyeOff, 
  ArrowRight,
  Activity,
  UserX,
  Server
} from 'lucide-react';
import { cn } from '../lib/utils';
import { BurnoutFingerprint } from '../types';

interface NovaOverloadShieldProps {
  fingerprint: BurnoutFingerprint | null;
  onAwardPoints?: (amount: number, reason: string) => void;
  onNavigate?: (tab: string) => void;
}

type ShieldState = 'stable' | 'drifting' | 'overload';

interface Integration {
  id: string;
  name: string;
  icon: any;
  status: 'disconnected' | 'connected';
  description: string;
  stats?: string;
}

const SHIELD_STATES: Record<ShieldState, { label: string; color: string; icon: any; message: string; subtext: string }> = {
  stable: {
    label: 'Green — Stable',
    color: 'emerald',
    icon: ShieldCheck,
    message: "Your schedule has enough breathing room today.",
    subtext: "Capacity is aligned with energy levels. No intervention required."
  },
  drifting: {
    label: 'Amber — Drifting',
    color: 'amber',
    icon: Shield,
    message: "Meeting load is high and recovery gaps are low. Protect one break.",
    subtext: "Your telemetry indicates escalating pressure and reduced recovery space."
  },
  overload: {
    label: 'Red — Overload Risk',
    color: 'rose',
    icon: ShieldAlert,
    message: "You are heading into overload. Let's reduce one thing now.",
    subtext: "Your combined meeting volume, message pressure, and lack of gaps have breached your limit."
  }
};

// Fully-written class strings (not template-literal interpolation) so Tailwind's
// scanner always generates them — this doesn't depend on some unrelated file
// coincidentally referencing the same color name.
const SHIELD_COLOR_CLASSES: Record<string, {
  cardBorder: string;
  cardBg: string;
  iconBg: string;
  iconShadow: string;
  heading: string;
  glow: string;
}> = {
  emerald: {
    cardBorder: 'border-success/30',
    cardBg: 'bg-success/5',
    iconBg: 'bg-success',
    iconShadow: 'shadow-success/30',
    heading: 'text-success dark:text-success',
    glow: 'bg-success/20',
  },
  amber: {
    cardBorder: 'border-warning/30',
    cardBg: 'bg-warning/5',
    iconBg: 'bg-warning',
    iconShadow: 'shadow-warning/30',
    heading: 'text-warning dark:text-warning',
    glow: 'bg-warning/20',
  },
  rose: {
    cardBorder: 'border-destructive/30',
    cardBg: 'bg-destructive/5',
    iconBg: 'bg-destructive',
    iconShadow: 'shadow-destructive/30',
    heading: 'text-destructive dark:text-destructive',
    glow: 'bg-destructive/20',
  },
};

export const NovaOverloadShield = ({ fingerprint, onAwardPoints, onNavigate }: NovaOverloadShieldProps) => {
  const [currentState, setCurrentState] = useState<ShieldState>('stable');
  const [activeTab, setActiveTab] = useState<'manual' | 'integrations'>('manual');
  
  // Phase 1: Manual Input State
  const [manualData, setManualData] = useState({
    meetings: 3,
    hours: 8,
    messagePressure: 'low',
    sleepQuality: 'good',
    energyLevel: 'high',
    recoveryGaps: 'yes'
  });

  const [integrations, setIntegrations] = useState<Integration[]>([
    { id: 'gcal', name: 'Google Calendar', icon: Calendar, status: 'disconnected', description: 'Reads free/busy & meeting density.', stats: '3 back-to-back meetings, no breaks' },
    { id: 'outlook', name: 'Outlook Calendar', icon: Calendar, status: 'disconnected', description: 'Reads free/busy & meeting density.', stats: 'No active overload' },
    { id: 'gmail', name: 'Gmail Metadata', icon: MessageSquare, status: 'disconnected', description: 'Tracks email volume & after-hours sending.', stats: 'High unread load, 12 after-hours sends' },
    { id: 'slack', name: 'Slack', icon: MessageSquare, status: 'disconnected', description: 'Tracks mentions & interruption frequency.', stats: '14 mentions after 6PM' },
    { id: 'asana', name: 'Asana / Jira', icon: CheckSquare, status: 'disconnected', description: 'Adds task pressure & deadline load.', stats: '5 overdue tasks, 12 due today' }
  ]);
  const [simulating, setSimulating] = useState(false);

  const toggleIntegration = (id: string) => {
    const target = integrations.find(int => int.id === id);
    if (target && target.status === 'disconnected' && onAwardPoints) {
      onAwardPoints(20, `Connected ${target.name}`);
    }

    setIntegrations(prev => prev.map(int => {
      if (int.id === id) {
        return { ...int, status: int.status === 'connected' ? 'disconnected' : 'connected' };
      }
      return int;
    }));
  };

  useEffect(() => {
    let score = 0;
    
    if (activeTab === 'manual') {
      if (manualData.meetings > 5) score += 2;
      else if (manualData.meetings > 3) score += 1;
      
      if (manualData.hours > 10) score += 2;
      else if (manualData.hours > 8) score += 1;
      
      if (manualData.messagePressure === 'high') score += 2;
      else if (manualData.messagePressure === 'medium') score += 1;
      
      if (manualData.sleepQuality === 'poor') score += 2;
      else if (manualData.sleepQuality === 'fair') score += 1;
      
      if (manualData.energyLevel === 'low') score += 2;
      else if (manualData.energyLevel === 'medium') score += 1;
      
      if (manualData.recoveryGaps === 'no') score += 2;
    } else {
      const connectedCount = integrations.filter(i => i.status === 'connected').length;
      if (connectedCount === 0) {
        score = 0;
      } else {
        integrations.forEach(int => {
          if (int.status === 'connected') {
            if (int.id === 'gcal') score += 2; // 3 back to back meetings
            if (int.id === 'gmail') score += 2; // High unread load
            if (int.id === 'slack') score += 2; // 14 mentions
            if (int.id === 'asana') score += 2; // 5 overdue tasks
          }
        });
      }
    }
    
    let nextState: ShieldState = 'stable';
    if (score >= 7) nextState = 'overload';
    else if (score >= 4) nextState = 'drifting';
    
    setCurrentState(nextState);
  }, [activeTab, manualData, integrations]);

  const calculateRisk = () => {
    setSimulating(true);
    setTimeout(() => {
      setSimulating(false);
      // Removed the manual calculation so we can just show a scanning animation before resolving.
      // The effect above will already keep it in sync, so we just run the animation.
    }, 1500);
  };

  const activeState = SHIELD_STATES[currentState];
  const stateColors = SHIELD_COLOR_CLASSES[activeState.color];

  return (
    <div className="space-y-12 pb-24">
      <div className="max-w-4xl">
        <div className="flex items-center gap-4 mb-4">
           <div className="tag">Section 22 / Burnout Protection</div>
           <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-4">
            <h3 className="text-5xl font-display font-bold text-text-main tracking-tight">Nova Overload Shield</h3>
            <p className="text-xl text-text-muted font-medium  max-w-2xl">
              "Most tools wait until you are overwhelmed. Nova tracks metadata to prevent the crash before it happens."
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Input & Privacy */}
        <div className="space-y-8">
          <div className="card p-2 flex bg-surface border border-border">
            <button 
              onClick={() => setActiveTab('manual')}
              className={cn("flex-1 py-2 text-sm font-bold rounded-xl transition-all", activeTab === 'manual' ? "bg-white dark:bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main")}
            >
              Phase 1: Manual Scan
            </button>
            <button 
              onClick={() => setActiveTab('integrations')}
              className={cn("flex-1 py-2 text-sm font-bold rounded-xl transition-all", activeTab === 'integrations' ? "bg-white dark:bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main")}
            >
              Integrations (Coming Soon)
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'manual' ? (
              <motion.div 
                key="manual"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="card p-6 space-y-6 border border-border"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black uppercase tracking-widest text-text-main flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Current Workload
                  </h4>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Meetings Today</label>
                    <input 
                      type="number" 
                      min="0"
                      value={manualData.meetings} 
                      onChange={(e) => setManualData({...manualData, meetings: parseInt(e.target.value) || 0})}
                      className="w-full bg-surface border border-border/50 rounded-xl p-3 text-text-main font-medium focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Hours Planned</label>
                    <input 
                      type="number" 
                      min="0"
                      value={manualData.hours} 
                      onChange={(e) => setManualData({...manualData, hours: parseInt(e.target.value) || 0})}
                      className="w-full bg-surface border border-border/50 rounded-xl p-3 text-text-main font-medium focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Message Pressure (Slack/Email)</label>
                    <select 
                      value={manualData.messagePressure}
                      onChange={(e) => setManualData({...manualData, messagePressure: e.target.value})}
                      className="w-full bg-surface border border-border/50 rounded-xl p-3 text-text-main font-medium focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                    >
                      <option value="low">Low (Quiet day)</option>
                      <option value="medium">Medium (Standard ping pong)</option>
                      <option value="high">High (Urgent, constant interruptions)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Energy Level</label>
                      <select 
                        value={manualData.energyLevel}
                        onChange={(e) => setManualData({...manualData, energyLevel: e.target.value})}
                        className="w-full bg-surface border border-border/50 rounded-xl p-3 text-text-main font-medium focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                      >
                        <option value="high">High</option>
                        <option value="medium">Fair</option>
                        <option value="low">Drained</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Sleep Quality</label>
                      <select 
                        value={manualData.sleepQuality}
                        onChange={(e) => setManualData({...manualData, sleepQuality: e.target.value})}
                        className="w-full bg-surface border border-border/50 rounded-xl p-3 text-text-main font-medium focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                      >
                        <option value="good">Good</option>
                        <option value="fair">Fair</option>
                        <option value="poor">Poor</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Are Recovery Gaps Protected?</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setManualData({...manualData, recoveryGaps: 'yes'})}
                        className={cn("flex-1 p-3 rounded-xl font-bold transition-all text-center", manualData.recoveryGaps === 'yes' ? 'bg-success/10 text-success border border-success/30' : 'bg-surface border border-border/50 text-text-muted hover:border-text-muted/30')}
                      >
                        Yes
                      </button>
                      <button 
                        onClick={() => setManualData({...manualData, recoveryGaps: 'no'})}
                        className={cn("flex-1 p-3 rounded-xl font-bold transition-all text-center", manualData.recoveryGaps === 'no' ? 'bg-destructive/10 text-destructive border border-destructive/30' : 'bg-surface border border-border/50 text-text-muted hover:border-text-muted/30')}
                      >
                        No
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="integrations"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="card p-6 space-y-6 border border-border"
              >
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-black uppercase tracking-widest text-text-main flex items-center gap-2">
                    <Server className="w-4 h-4 text-primary" /> Automatic Sync
                  </h4>
                  <p className="text-xs font-medium text-text-muted">
                    We track metadata, never message content. Your privacy is paramount.
                  </p>
                </div>
                <div className="space-y-3">
                  {integrations.map(int => (
                    <div key={int.id} className="flex items-start justify-between p-4 rounded-2xl bg-surface/50 border border-border/50">
                      <div className="flex items-start gap-3">
                        <div className={cn("w-10 h-10 rounded-xl shrink-0 flex items-center justify-center transition-colors", int.status === 'connected' ? 'bg-primary/10 text-primary' : 'bg-surface dark:bg-surface text-text-muted')}>
                          <int.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h5 className="font-bold text-text-main text-sm">{int.name}</h5>
                          <div className="text-xs text-text-muted">{int.description}</div>
                          {int.status === 'connected' && int.stats && (
                            <div className="mt-2 text-xs font-medium text-warning bg-warning/10 inline-block px-2 py-1 rounded">
                              Detected: {int.stats}
                            </div>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => toggleIntegration(int.id)}
                        className={cn("px-3 py-1.5 shrink-0 rounded-lg text-xs font-bold transition-all", int.status === 'connected' ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-border dark:bg-surface text-text-main hover:bg-surface dark:hover:bg-surface')}
                      >
                        {int.status === 'connected' ? 'Connected' : 'Connect'}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="card p-6 border border-primary/20 bg-primary/5">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4" /> Privacy Perimeter
            </h4>
            <ul className="space-y-3">
              {[
                { icon: Server, text: "Metadata only. We never read message content." },
                { icon: UserX, text: "No employer surveillance. Your data is yours." },
                { icon: EyeOff, text: "No secret HR reports. Trust is our moat." }
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-text-main font-medium">
                  <div className="p-1 rounded bg-primary/10 text-primary shrink-0 mt-0.5">
                    <item.icon className="w-3 h-3" />
                  </div>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column: Shield Status & Interventions */}
        <div className="lg:col-span-2 space-y-8">
          
          <div className={cn("card p-8 md:p-12 transition-all duration-500 relative overflow-hidden border", stateColors.cardBorder, stateColors.cardBg)}>
             <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
               <div className="flex items-center gap-4">
                 <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl transition-all duration-500", stateColors.iconBg, stateColors.iconShadow)}>
                   {simulating ? <Zap className="w-8 h-8 animate-pulse" /> : <activeState.icon className="w-8 h-8" />}
                 </div>
                 <div>
                   <h3 className="text-xs font-black uppercase tracking-widest text-text-muted mb-1">Current Status</h3>
                   <h2 className={cn("text-3xl font-display font-bold transition-colors", stateColors.heading)}>
                     {simulating ? 'Scanning...' : activeState.label}
                   </h2>
                 </div>
               </div>
               
               <button 
                 onClick={calculateRisk} 
                 disabled={simulating}
                 className="btn-primary shrink-0 self-start md:self-auto bg-border hover:bg-surface dark:bg-surface dark:hover:bg-surface text-text-main border-transparent"
               >
                 <Zap className="w-4 h-4 mr-2" /> {activeTab === 'manual' ? 'Calculate Risk' : 'Force Scan'}
               </button>
             </div>

             <div className="relative z-10 space-y-2">
               <p className="text-xl font-medium text-text-main">
                 "{activeState.message}"
               </p>
               <p className="text-text-muted font-medium ">
                 {activeState.subtext}
               </p>
             </div>

             <div className={cn("absolute right-[-10%] top-[-10%] w-64 h-64 rounded-full blur-[100px] transition-all duration-1000", stateColors.glow)} />
          </div>

          <AnimatePresence mode="popLayout">
            {currentState !== 'stable' && !simulating && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                <div className="card p-6 border border-primary/20">
                  <h4 className="text-sm font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Recommended Recovery Mode: {currentState === 'drifting' ? 'Soft' : currentState === 'overload' ? 'Strong' : ''}
                  </h4>
                  <ul className="space-y-3 mb-6">
                    {currentState === 'drifting' ? (
                      <>
                        <li className="text-text-main font-medium text-sm flex items-start gap-2"><ArrowRight className="w-4 h-4 text-primary shrink-0" /> Protect one 10-minute break.</li>
                        <li className="text-text-main font-medium text-sm flex items-start gap-2"><ArrowRight className="w-4 h-4 text-primary shrink-0" /> Reduce one low-value task.</li>
                        <li className="text-text-main font-medium text-sm flex items-start gap-2"><ArrowRight className="w-4 h-4 text-primary shrink-0" /> Restrict after-hours notifications.</li>
                      </>
                    ) : (
                      <>
                        <li className="text-text-main font-medium text-sm flex items-start gap-2"><ArrowRight className="w-4 h-4 text-primary shrink-0" /> Block dedicated recovery time.</li>
                        <li className="text-text-main font-medium text-sm flex items-start gap-2"><ArrowRight className="w-4 h-4 text-primary shrink-0" /> Suggest moving a meeting.</li>
                        <li className="text-text-main font-medium text-sm flex items-start gap-2"><ArrowRight className="w-4 h-4 text-primary shrink-0" /> Turn on Slack Focus Mode.</li>
                      </>
                    )}
                  </ul>
                  <button className="btn-primary w-full shadow-lg shadow-primary/20">
                    Get Started
                  </button>
                </div>

                 {currentState === 'overload' && (
                  <div className="card p-6 border border-destructive/20 bg-destructive/5">
                    <h4 className="text-sm font-black uppercase tracking-widest text-destructive mb-2 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4" /> Guardian Dispatch
                    </h4>
                    <p className="text-text-main font-medium text-sm leading-relaxed mb-6">
                      Your biometric load and event pressure indicate a high risk of systemic crash. Do you want me to notify a trusted Guardian?
                    </p>
                    <button className="btn-primary w-full bg-destructive hover:bg-destructive border-destructive text-destructive-foreground shadow-lg shadow-destructive/20">
                      Notify Guardian Network
                    </button>
                  </div>
                )}
                
                {/* Quick Actions */}
                <div className="card p-6 col-span-1 md:col-span-2 border border-border">
                   <h4 className="text-sm font-black uppercase tracking-widest text-text-muted mb-4 flex items-center gap-2">
                     <Zap className="w-4 h-4" /> Quick Interventions & Energy Sync
                   </h4>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <button
                       onClick={() => onNavigate && onNavigate('recover')}
                       className="p-4 rounded-xl bg-surface/50 border border-border/50 hover:border-primary/30 hover:bg-surface transition-all text-left group"
                     >
                       <h5 className="font-bold text-text-main group-hover:text-primary transition-colors">One Less Thing Button ↗</h5>
                       <span className="text-xs text-text-muted">Strip away noise to prevent immediate burnout.</span>
                     </button>
                     <button
                       onClick={() => onNavigate && onNavigate('budget')}
                       className="p-4 rounded-xl bg-surface/50 border border-warning/30 bg-warning/5 hover:border-warning/50 hover:bg-warning/10 transition-all text-left group flex flex-col justify-between"
                     >
                       <div>
                         <h5 className="font-bold text-text-main group-hover:text-warning transition-colors flex items-center justify-between">
                           Energy Budget ↗
                           <span className="text-xs bg-warning text-warning-foreground px-2 py-0.5 rounded-full font-bold">Auto-Synced</span>
                         </h5>
                         <span className="text-xs text-text-muted mt-1 block">Live telemetry from {integrations.filter(i => i.status === 'connected').length} active integration(s) is currently deducting credits from your budget.</span>
                       </div>
                     </button>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
};
