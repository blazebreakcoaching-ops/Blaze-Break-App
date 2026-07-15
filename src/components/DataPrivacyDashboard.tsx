import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, Calendar, Brain, BookOpen, Shield, ChevronDown, Check, Settings } from 'lucide-react';
import { UserProfileData } from '../types.ts';
import { cn } from '../lib/utils.ts';
import { useFeatureFlags, setFeatureFlag, FeatureFlag } from '../lib/feature-flags.ts';
import { logAuditAction } from '../lib/audit-logger.ts';

interface DataPoint {
  id: string;
  label: string;
  category: string;
  description: string;
  novaUsage: string;
  icon: React.ElementType;
  required: boolean;
  flagId: FeatureFlag;
}

export const DataPrivacyDashboard = ({ 
  profile,
}: { 
  profile: UserProfileData 
}) => {
  const flags = useFeatureFlags();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dataPoints: DataPoint[] = [
    {
      id: 'mood',
      label: 'Mood & Somatic Metrics',
      category: 'Core Biological',
      description: 'Records daily energy, mood tags, and somatic (nervous system) flags.',
      novaUsage: 'Nova correlates these drops with your meeting density to detect "Burnout Velocity".',
      icon: Activity,
      required: true,
      flagId: 'enable_mood_pulse' as FeatureFlag
    },
    {
      id: 'calendar',
      label: 'Calendar Sync (Metadata)',
      category: 'Workload Tracking',
      description: 'Accesses meeting counts, durations, and back-to-back blocks (no meeting contents).',
      novaUsage: 'Nova predicts fatigue spikes and automatically suggests tactical breaks before overload occurs.',
      icon: Calendar,
      required: false,
      flagId: 'enable_calendar_sync' as FeatureFlag
    },
    {
      id: 'ai_memory',
      label: 'Contextual AI Memory',
      category: 'Personalization',
      description: 'Allows Nova to remember previous coaching sessions and your specified goals.',
      novaUsage: 'Nova references your historical wins to reinforce your progress during low-energy days.',
      icon: Brain,
      required: false,
      flagId: 'enable_ai_memory' as FeatureFlag
    },
    {
      id: 'journal',
      label: 'Trigger Journal Processing',
      category: 'Reflection',
      description: 'Allows semantic processing of your free-text journal entries.',
      novaUsage: 'Nova scans for repetitive stress keywords to help you identify unacknowledged boundaries.',
      icon: BookOpen,
      required: false,
      flagId: 'enable_journal_scanning' as FeatureFlag
    }
  ];

  const handleToggle = async (point: DataPoint, e: React.MouseEvent) => {
    e.stopPropagation();
    if (point.required) return;
    
    const currentState = flags[point.flagId] ?? true; // assuming default true if undefined
    const newState = !currentState;
    
    await logAuditAction({
      userId: profile.fullName || 'anonymous',
      action: `Toggled Data Privacy Category: ${point.label}`,
      target: point.id,
      status: newState ? 'authorised' : 'revoked' as any,
      details: `User set ${point.label} sharing to ${newState}`
    });
    
    setFeatureFlag(point.flagId, newState);
  };

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-text-main text-lg tracking-tight">Data Privacy Dashboard</h3>
          <p className="text-xs text-text-muted mt-1">Granular controls over how Nova uses your signals.</p>
        </div>
      </div>

      <div className="space-y-3">
        {dataPoints.map((point) => {
          const isEnabled = point.required || (flags[point.flagId] !== false);
          const isExpanded = expandedId === point.id;
          
          return (
            <div 
              key={point.id}
              className={cn(
                "rounded-xl border transition-all duration-300 overflow-hidden",
                isExpanded 
                  ? "bg-surface border-primary/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]" 
                  : "bg-background/40 border-white/[0.04] hover:bg-surface/60 cursor-pointer"
              )}
              onClick={() => setExpandedId(isExpanded ? null : point.id)}
            >
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    isEnabled ? "bg-primary/10 text-primary" : "bg-surface text-text-muted"
                  )}>
                    <point.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className={cn(
                      "text-sm font-bold transition-colors",
                      isEnabled ? "text-text-main" : "text-text-muted"
                    )}>
                      {point.label}
                    </h4>
                    <span className="text-xs font-black uppercase tracking-widest text-text-muted">
                      {point.category}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {point.required && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-widest bg-card text-text-muted border border-border">Required</span>
                  )}
                  {!point.required && (
                    <button 
                      onClick={(e) => handleToggle(point, e)}
                      className={cn(
                        "w-12 h-6 rounded-full flex items-center p-1 transition-colors relative",
                        isEnabled ? "bg-success" : "bg-surface"
                      )}
                    >
                      <span className={cn(
                        "w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm",
                        isEnabled ? "translate-x-6" : "translate-x-0"
                      )} />
                    </button>
                  )}
                  <ChevronDown className={cn(
                    "w-4 h-4 text-text-muted transition-transform duration-300",
                    isExpanded && "rotate-180 text-primary"
                  )} />
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="px-4 pb-4 pt-2 border-t border-white/[0.04] grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs uppercase font-black tracking-widest text-text-muted">What we collect</p>
                        <p className="text-xs text-text-muted leading-relaxed">{point.description}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase font-black tracking-widest text-primary">How Nova uses it</p>
                        <p className="text-xs text-primary-light/70 leading-relaxed font-mono">{point.novaUsage}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};
