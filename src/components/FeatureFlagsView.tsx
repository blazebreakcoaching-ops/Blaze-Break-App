import React, { useState } from 'react';
import { ToggleLeft, ToggleRight, ShieldAlert, Cpu, Settings2 } from 'lucide-react';
import { getFeatureFlags, setFeatureFlag, FeatureFlag } from '../lib/feature-flags';

export const FeatureFlagsView = () => {
  // Reads from the single shared source of truth (feature-flags.ts) rather
  // than a second, hand-duplicated set of defaults - those two drifted out
  // of sync before (this file said enable_nova_voice defaulted to false
  // after the real default had already been changed to true elsewhere),
  // showing the toggle in the wrong position even though the feature
  // itself was already on.
  const [flags, setFlags] = useState<{ [key: string]: boolean }>(getFeatureFlags());

  const toggleFlag = (key: string) => {
    const next = !flags[key];
    setFeatureFlag(key as FeatureFlag, next);
    setFlags(prev => ({ ...prev, [key]: next }));
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
            <ShieldAlert className="w-5 h-5 text-[#9a3412] dark:text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-center group">
              <h4 className="font-bold text-sm text-text-main">Nova Overload Shield</h4>
              <button
                type="button"
                onClick={() => toggleFlag('enable_overload_shield')}
                role="switch"
                aria-checked={flags.enable_overload_shield}
                aria-label="Nova Overload Shield"
                className="text-primary transition-transform active:scale-95 cursor-pointer"
              >
                {flags.enable_overload_shield ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-text-muted" />}
              </button>
            </div>
            <p className="text-xs text-text-muted max-w-[90%] leading-relaxed">
              Shows a status card (stable / drifting / overload risk) based on your meeting load, message volume, and recovery gaps, with a suggestion for what to protect. It's advisory - a status read and a nudge, not a screen you're blocked by or a channel it locks you out of.
            </p>
          </div>
        </div>

        {/* Guardian Protocol */}
        <div className="bg-surface dark:bg-surface/50 border border-border dark:border-border rounded-xl p-5 flex gap-4 items-start transition-all hover:border-primary/30">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0 mt-0.5">
            <Cpu className="w-5 h-5 text-[#9a3412] dark:text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-center group">
              <h4 className="font-bold text-sm text-text-main">Guardian Check-In Suggestions</h4>
              <button
                type="button"
                onClick={() => toggleFlag('enable_guardian_protocol')}
                role="switch"
                aria-checked={flags.enable_guardian_protocol}
                aria-label="Guardian Check-In Suggestions"
                className="text-primary transition-transform active:scale-95 cursor-pointer"
              >
                {flags.enable_guardian_protocol ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6 text-text-muted" />}
              </button>
            </div>
            <p className="text-xs text-text-muted max-w-[90%] leading-relaxed">
              When enabled, Nova may suggest reaching out to a Trusted Contact during a difficult conversation. Nova cannot send anything on its own - you'd still choose to send the alert yourself from Guardian Relay.
            </p>
          </div>
        </div>

        {/* Nova Voice */}
        <div className="bg-surface dark:bg-surface/50 border border-border dark:border-border rounded-xl p-5 flex gap-4 items-start transition-all hover:border-primary/30">
          <div className="bg-primary/10 p-2 rounded-lg shrink-0 mt-0.5">
            <Cpu className="w-5 h-5 text-[#9a3412] dark:text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-center group">
              <h4 className="font-bold text-sm text-text-main">Nova Voice Mode</h4>
              <button
                type="button"
                onClick={() => toggleFlag('enable_nova_voice')}
                role="switch"
                aria-checked={flags.enable_nova_voice}
                aria-label="Nova Voice Mode"
                className="text-primary transition-transform active:scale-95 cursor-pointer"
              >
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
