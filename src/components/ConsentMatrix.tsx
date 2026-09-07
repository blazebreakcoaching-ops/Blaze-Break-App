import React from 'react';
import { Database, Calendar, BookOpen, Brain, Activity } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { UserProfileData } from '../types.ts';
import { logAuditAction } from '../lib/audit-logger.ts';

export const ConsentMatrix = ({ profile, onUpdate }: { profile: UserProfileData, onUpdate: (p: UserProfileData) => void }) => {
  const dataPoints = [
    { id: 'mood', label: 'Mood & Biological Processing', icon: Activity, required: true, desc: "Aggregates inputs into your Recovery Velocity Score.", zone: "Zone A", zoneColor: "primary" },
    { id: 'calendar', label: 'Calendar Integration', icon: Calendar, required: false, desc: "Scans meeting density to calculate 'Meeting Fatigue'.", zone: "Zone A", zoneColor: "primary" },
    { id: 'ai_memory', label: 'Nova AI Memory Context', icon: Brain, required: false, desc: "Permits Nova to remember conversational context.", zone: "Zone A", zoneColor: "primary" },
    { id: 'journal', label: 'Trigger Journal Scanning', icon: BookOpen, required: false, desc: "Used for detecting pattern similarities over 90 days.", zone: "Zone A", zoneColor: "primary" },
  ];

  const toggleConsent = (pointId: string, current: boolean) => {
    const matrix = profile.consentMatrix || {};
    const newState = !current;
    
    logAuditAction({
      userId: profile.fullName || 'anonymous',
      action: `Toggled consent for ${pointId} to ${newState}`,
      target: pointId,
      status: 'authorised',
      details: `User explicitly changed consent for ${pointId} data processing.`
    });

    onUpdate({
      ...profile,
      consentMatrix: {
        ...matrix,
        [pointId]: newState
      }
    });
  };

  return (
    <div className="card space-y-6 relative overflow-hidden bg-background border border-border">

      <div className="relative z-10">
        <h3 className="text-xl font-bold text-text-main flex items-center gap-2 mb-2">
          <Database className="w-5 h-5 text-primary" /> Data & Privacy Controls
        </h3>
        <p className="text-xs text-text-muted max-w-xl leading-relaxed">
          You are the sole custodian of your recovery telemetry. Visualize and strictly govern which data nodes Nova can process to model your biological performance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 relative z-10">
        {dataPoints.map(point => {
          const isEnabled = point.required || !!(profile.consentMatrix && profile.consentMatrix[point.id]);
          return (
            <div key={point.id} className={cn("p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300", isEnabled ? "bg-primary/10 border-primary/30 shadow-inner" : "bg-surface/50 border-white/[0.05]")}>
              <div className="flex items-start gap-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", isEnabled ? "bg-primary/20 text-[#9a3412] dark:text-primary border-primary/30" : "bg-surface text-text-muted border-border")}>
                  <point.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={cn("text-sm font-bold tracking-tight", isEnabled ? "text-[#9a3412] dark:text-primary" : "text-text-muted")}>{point.label}</h4>
                    {point.zone && (
                      <span className={cn(
                        "px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded-full font-bold border",
                        point.zoneColor === 'primary' && "bg-primary/20 text-[#9a3412] dark:text-primary border-primary/30"
                      )}>
                        {point.zone}
                      </span>
                    )}
                    {point.required && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-card text-text-muted border border-border">System Required</span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted mt-1">{point.desc}</p>
                </div>
              </div>
              <div className="flex items-center justify-end">
                <button 
                  disabled={point.required}
                  onClick={() => toggleConsent(point.id, isEnabled)}
                  role="switch"
                  aria-checked={isEnabled}
                  aria-label={`${isEnabled ? 'Revoke' : 'Grant'} consent for ${point.label}${point.required ? ' (required, cannot be changed)' : ''}`}
                  className={cn("w-12 h-6 rounded-full transition-all duration-300 relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/50", isEnabled ? "bg-success" : "bg-surface", point.required && "opacity-50 cursor-not-allowed")}
                >
                  <div className={cn("w-4 h-4 rounded-full bg-white absolute top-1 transition-transform duration-300 shadow-sm", isEnabled ? "left-7" : "left-1")} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
