import React from 'react';
import { ShieldCheck, Lock, Users, Building, Activity, ShieldQuestion } from 'lucide-react';
import { cn } from '../lib/utils';

export const DataZoneVisualizer = () => {
  const collections = [
    { name: "Mood Pulse Journal", zone: "private", icon: Lock, desc: "Personal logs" },
    { name: "Burnout Fingerprint", zone: "private", icon: Activity, desc: "Diagnostic profile" },
    { name: "Nova Chat Transcripts", zone: "private", icon: Lock, desc: "AI therapy logs" },
    { name: "Recovery Milestones", zone: "shared", icon: Users, desc: "Shared with Allies" },
    { name: "Weekly Wins", zone: "shared", icon: Users, desc: "Shared with Allies" },
    { name: "Somatic Reset Triggers", zone: "private", icon: Lock, desc: "Health metrics" },
    { name: "Aggregated Engagement", zone: "org", icon: Building, desc: "Org dashboard" },
    { name: "Team Burnout Risk (K-Anonymized)", zone: "org", icon: Building, desc: "Org dashboard" },
    { name: "Authorised Access Logs", zone: "private", icon: ShieldCheck, desc: "Audit trail" }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 mb-6 relative z-10">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
          <Lock className="w-3.5 h-3.5" /> Zone A: Private
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-success/10 border border-success/20 text-success text-xs font-bold uppercase tracking-wider">
          <Users className="w-3.5 h-3.5" /> Zone B: Shared
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface0/10 border border-muted-foreground/20 text-text-muted text-xs font-bold uppercase tracking-wider">
          <Building className="w-3.5 h-3.5" /> Zone D: Org Anonymous
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {collections.map((item, i) => (
          <div
            key={i}
            className={cn(
              "p-5 rounded-xl border flex flex-col gap-2 transition-all hover:scale-[1.02] relative overflow-hidden font-sans shadow-sm",
              item.zone === 'private' && "bg-surface/40 border-primary/20 hover:border-primary/40",
              item.zone === 'shared' && "bg-success/10 border-success/20 hover:border-success/40",
              item.zone === 'org' && "bg-surface-elevated/40 border-muted-foreground/20 hover:border-muted-foreground/40"
            )}
          >
            <div className={cn(
              "absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-[0.03]",
              item.zone === 'private' && "bg-primary",
              item.zone === 'shared' && "bg-success",
              item.zone === 'org' && "bg-surface0"
            )} />
            <div className="flex items-center justify-between">
               <item.icon className={cn(
                 "w-5 h-5",
                 item.zone === 'private' && "text-primary",
                 item.zone === 'shared' && "text-success",
                 item.zone === 'org' && "text-text-muted"
               )} />
               <span className={cn(
                 "text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                 item.zone === 'private' && "text-primary border-primary/30 bg-primary/10",
                 item.zone === 'shared' && "text-success/40 border-success/30 bg-success/10",
                 item.zone === 'org' && "text-text-muted border-muted-foreground/30 bg-surface0/10"
               )}>
                 {item.zone}
               </span>
            </div>
            <div className="mt-2 text-text-main font-bold text-sm tracking-tight">{item.name}</div>
            <div className="text-text-muted text-xs font-medium">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
