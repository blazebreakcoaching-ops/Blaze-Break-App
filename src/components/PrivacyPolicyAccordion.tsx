import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils.ts';

interface PolicySection {
  id: string;
  title: string;
  content: React.ReactNode;
}

export const PrivacyPolicyAccordion = () => {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const policies: PolicySection[] = [
    {
      id: 'data_collection',
      title: '1. What Data We Collect',
      content: (
        <div className="space-y-3 text-sm text-text-muted font-light leading-relaxed">
          <p>We believe in minimal data extraction. We only collect what is strictly necessary to power Nova's coaching logic and your personal recovery dashboards.</p>
          <ul className="list-disc pl-5 space-y-1 text-text-muted">
            <li><strong>Self-Reported Signals:</strong> Body sensations and stress indicators you log yourself - not measured by any sensor or device.</li>
            <li><strong>Self-Reported Mood:</strong> Daily check-ins and journal entries.</li>
            <li><strong>Metadata:</strong> App usage metrics, used in aggregate for system performance tuning.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'employer_firewall',
      title: '2. The Employer Firewall',
      content: (
        <div className="space-y-3 text-sm text-text-muted font-light leading-relaxed">
          <p>Your organisation cannot see your personal recovery data. That boundary is enforced by our access-control architecture: no employer-facing feature or account can read your individual entries, Nova conversations, or Nova's memory of you.</p>
          <p>If your access is sponsored by your employer, they may see an aggregated "Team Climate" dashboard. That dashboard only shows a number once at least a minimum number of people in a cohort have opted in to sharing (your organisation's admin sets this minimum, with a floor we enforce) - individual results are never shown, and a cohort just above that minimum can still, in principle, be a small enough group that a determined admin could make educated guesses about it. We continue to reduce that risk as this feature matures.</p>
        </div>
      )
    },
    {
      id: 'ai_boundaries',
      title: '3. AI Boundaries & Constraints',
      content: (
        <div className="space-y-3 text-sm text-text-muted font-light leading-relaxed">
          <p>Nova is a coaching intelligence, not a medical device. It operates under strict guidelines:</p>
          <ul className="list-disc pl-5 space-y-1 text-text-muted">
            <li>Nova is prohibited from making clinical diagnoses.</li>
            <li>We do not train external foundation models on your private journal entries.</li>
            <li>You can view and purge Nova's contextual memory at any time.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'data_retention',
      title: '4. Data Retention & Erasure',
      content: (
        <div className="space-y-3 text-sm text-text-muted font-light leading-relaxed">
          <p>You have the right of erasure. Selecting "Delete My Account" permanently deletes your personal recovery data - diagnostic metrics, somatic logs, journal entries, and Nova's memory of you - with no cool-down or recovery period.</p>
          <p>Security audit records that reference your account are kept separately, for accountability and legal reasons, and are not included in this deletion. We do not control what happens to data already sent to third-party processors (e.g. our AI providers or messaging provider) before a deletion request is made.</p>
        </div>
      )
    }
  ];

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-primary/10 border border-primary/20 text-primary rounded-xl flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-text-main text-lg tracking-tight">Privacy Policy Details</h3>
          <p className="text-xs text-text-muted mt-1">Plain-English transparency on our operational rules.</p>
        </div>
      </div>

      <div className="space-y-3">
        {policies.map((policy) => {
          const isActive = activeSection === policy.id;
          return (
            <div 
              key={policy.id} 
              className={cn(
                "rounded-xl border transition-all duration-500 overflow-hidden",
                isActive 
                  ? "bg-surface border-primary/50 shadow-[0_0_20px_rgba(234,88,12,0.15)]"
                  : "bg-background/40 border-white/[0.04] hover:bg-surface/60"
              )}
            >
              <button
                onClick={() => setActiveSection(isActive ? null : policy.id)}
                aria-expanded={isActive}
                aria-controls={`policy-panel-${policy.id}`}
                className="w-full p-5 flex items-center justify-between text-left cursor-pointer"
              >
                <h4 className={cn(
                  "font-bold transition-colors duration-300",
                  isActive ? "text-[#9a3412] dark:text-primary" : "text-text-main"
                )}>
                  {policy.title}
                </h4>
                <ChevronDown className={cn(
                  "w-5 h-5 transition-transform duration-500 ease-in-out shrink-0",
                  isActive ? "rotate-180 text-[#9a3412] dark:text-primary" : "text-text-muted"
                )} />
              </button>
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    id={`policy-panel-${policy.id}`}
                    role="region"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                  >
                    <div className="px-5 pb-5 pt-1">
                      {policy.content}
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
