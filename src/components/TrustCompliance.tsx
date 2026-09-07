import React from 'react';
import { ShieldCheck, CheckCircle2, FileText } from 'lucide-react';
import { useFeatureFlags } from '../lib/feature-flags.ts';

export const TrustCompliance = () => {
  const flags = useFeatureFlags();
  
  const complianceStandards = [
    {
      id: 'gdpr',
      name: 'GDPR / Privacy Framework',
      active: false,
      description: 'Security foundation in progress. End-to-end certification claims will appear only when independently verified.'
    },
    {
      id: 'cyber_essentials',
      name: 'Cyber Essentials',
      active: false,
      description: 'Roadmap: Not yet verified.'
    },
    {
      id: 'iso27001',
      name: 'Information Security',
      active: false,
      description: 'Roadmap: Not yet verified. Implementation in progress.'
    }
  ];

  return (
    <div className="card space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-text-main text-lg">Trust & Compliance</h3>
          <p className="text-xs text-text-muted">Live certification and assurance status.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {complianceStandards.map(standard => (
          <div key={standard.id} className="p-4 rounded-xl border border-white/[0.05] bg-background/40 space-y-3 relative overflow-hidden">
            {standard.active && (
              <div className="absolute top-0 right-0 w-16 h-16 bg-success/10 blur-xl pointer-events-none" />
            )}
            <div className="flex items-start justify-between">
              <h4 className="text-sm font-bold text-text-muted">{standard.name}</h4>
              {standard.active ? (
                <CheckCircle2 className="w-4 h-4 text-success dark:text-[#4ade80] shrink-0" />
              ) : (
                <div className="px-1.5 py-0.5 rounded bg-card text-[10px] uppercase tracking-wider font-bold text-text-muted">Pending</div>
              )}
            </div>
            <p className="text-xs text-text-muted font-light leading-relaxed">
              {standard.description}
            </p>
          </div>
        ))}
      </div>
      
      <div className="flex flex-col items-center gap-1.5 mt-4">
         <button
           disabled
           aria-disabled="true"
           title="Available once at least one certification is independently verified"
           className="flex items-center gap-2 text-xs uppercase font-black tracking-[0.2em] text-text-muted/50 cursor-not-allowed"
         >
            <FileText className="w-4 h-4" /> Download Certificate Packet
         </button>
         <p className="text-[10px] text-text-muted">Not yet available — no certifications have been independently verified.</p>
      </div>
    </div>
  );
};
