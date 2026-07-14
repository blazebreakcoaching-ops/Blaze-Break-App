import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, ShieldAlert, Cpu, Settings2 } from 'lucide-react';
import { cn } from '../lib/utils';

export const FeatureFlagsView = () => {
  const [flags, setFlags] = useState<{ [key: string]: boolean }>({
    enable_overload_shield: false,
    enable_guardian_protocol: false,
    enable_nova_coach: true,
    enable_nova_voice: false,
    compliance_gdpr_active: true,
    compliance_cyber_essentials: true,
    compliance_iso_27001: true
  });

  useEffect(() => {
    try {
      const savedFlags = localStorage.getItem('blaze_feature_flags');
      if (savedFlags) {
        setFlags(prev => ({ ...prev, ...JSON.parse(savedFlags) }));
      }
    } catch (e) {}
  }, []);

  const toggleFlag = (key: string) => {
    setFlags(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('blaze_feature_flags', JSON.stringify(next));
      window.dispatchEvent(new Event('feature-flags-updated'));
      window.dispatchEvent(new Event('storage'));
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-xl font-display font-bold text-text-main flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" /> Feature Settings
        </h3>
        <p className="text-xs text-text-muted">Manage experimental or high-impact protocol modules and architecture flags.</p>
      </div>

      <div className="space-y-4">
        {/* Overload Shield */}
        <div className="bg-surface dark:bg-surface/50 border border-border dark:border-border rounded-xl p-5 flex gap-4 items-start transition-all hover:border-primary/30">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-center group cursor-pointer" onClick={() => toggleFlag('enable_overload_shield')}>
              <h4 className="font-bold text-sm text-text-main">Nova Overload Shield</h4>
              <button type="button" className="text-primary transition-transform active:scale-95">
                {flags.enable_overload_shield ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-text-muted" />}
              </button>
            </div>
            <p className="text-xs text-text-muted max-w-[90%] leading-relaxed">
              Activate the mandatory breathing & delay screen. Automatically blocks access to work channels when biometric or active debt thresholds cross critical failure levels.
            </p>
          </div>
        </div>

        {/* Guardian Protocol */}
        <div className="bg-surface dark:bg-surface/50 border border-border dark:border-border rounded-xl p-5 flex gap-4 items-start transition-all hover:border-primary/30">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0 mt-0.5">
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-center group cursor-pointer" onClick={() => toggleFlag('enable_guardian_protocol')}>
              <h4 className="font-bold text-sm text-text-main">Guardian Protocol Auto-Escalation</h4>
              <button type="button" className="text-primary transition-transform active:scale-95">
                {flags.enable_guardian_protocol ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-text-muted" />}
              </button>
            </div>
            <p className="text-xs text-text-muted max-w-[90%] leading-relaxed">
              Authorizes Nova to actively notify designated Trusted Contacts if you enter a "Safety" failure state and stop responding to regular communication nudges.
            </p>
          </div>
        </div>

        {/* Nova Voice */}
        <div className="bg-surface dark:bg-surface/50 border border-border dark:border-border rounded-xl p-5 flex gap-4 items-start transition-all hover:border-primary/30">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0 mt-0.5">
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-center group cursor-pointer" onClick={() => toggleFlag('enable_nova_voice')}>
              <h4 className="font-bold text-sm text-text-main">Nova Voice Mode</h4>
              <button type="button" className="text-primary transition-transform active:scale-95">
                {flags.enable_nova_voice ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-text-muted" />}
              </button>
            </div>
            <p className="text-xs text-text-muted max-w-[90%] leading-relaxed">
              Enable auditory intelligence. Nova will converse with you aloud through experimental text-to-speech outputs during rehearsal simulations.
            </p>
          </div>
        </div>
        
        <div className="space-y-1 mt-8 mb-4">
          <h3 className="text-xl font-display font-bold text-text-main flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" /> Assurance & Compliance Toggles
          </h3>
          <p className="text-xs text-text-muted">Compliance toggles disabled in Production Readiness Pass.</p>
        </div>

      </div>
    </div>
  );
};
